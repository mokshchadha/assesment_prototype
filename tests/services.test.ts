import { describe, it, expect, afterEach, afterAll } from "bun:test";
import {
	sql,
	insertEvent,
	getEventById,
	markEventClaimed,
} from "../db/postgres";
import { releaseLock, lockExists } from "../db/redis";
import { claimEvent, acknowledgeEvent } from "../services/claim";
import { rehydrate } from "../services/rehydrate";
import { type Region } from "../types";

const ASIA: Region = "Asia";
const EUROPE: Region = "Europe";
const MOD_MOKSH = "moksh";
const MOD_ALEX = "alex";

const createdEventIds: string[] = [];

async function seedEvent(
	region: Region = ASIA,
	payload: any = { type: "test" },
): Promise<string> {
	const event = await insertEvent(region, payload);
	if (!event) throw new Error("Failed to seed event");
	createdEventIds.push(event.id);
	return event.id;
}

async function cleanup() {
	for (const id of createdEventIds) {
		if (id) {
			await sql`DELETE FROM events WHERE id = ${id}::uuid`;
			await releaseLock(id);
		}
	}
	createdEventIds.length = 0;
}

describe("claimEvent service", () => {
	afterEach(cleanup);

	it("successfully claims an open event in the same region", async () => {
		const id = await seedEvent(ASIA);
		const result = await claimEvent(id, MOD_MOKSH, ASIA);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.event.status).toBe("claimed");
			expect(result.event.claimed_by).toBe(MOD_MOKSH);
		}

		expect(await lockExists(id)).toBe(true);
	});

	it("fails if the event does not exist", async () => {
		const result = await claimEvent(
			"00000000-0000-0000-0000-000000000000",
			MOD_MOKSH,
			ASIA,
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.reason).toBe("event not found");
		}
	});

	it("fails if the regions do not match", async () => {
		const id = await seedEvent(EUROPE);
		const result = await claimEvent(id, MOD_MOKSH, ASIA);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.reason).toBe("region mismatch");
		}
	});

	it("fails if the event is already claimed in database", async () => {
		const id = await seedEvent(ASIA);
		await markEventClaimed(id, MOD_ALEX);

		const result = await claimEvent(id, MOD_MOKSH, ASIA);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.reason).toBe("event is not open");
		}
	});
});

describe("acknowledgeEvent service", () => {
	afterEach(cleanup);

	it("successfully acknowledges a claimed event", async () => {
		const id = await seedEvent(ASIA);
		await claimEvent(id, MOD_MOKSH, ASIA);

		const result = await acknowledgeEvent(id, MOD_MOKSH);
		expect(result.success).toBe(true);

		const event = await getEventById(id);
		expect(event?.status).toBe("resolved");
		expect(await lockExists(id)).toBe(false);
	});

	it("fails if the moderator is not the lock owner", async () => {
		const id = await seedEvent(ASIA);
		await claimEvent(id, MOD_MOKSH, ASIA);

		const result = await acknowledgeEvent(id, MOD_ALEX);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.reason).toBe("not the lock owner");
		}
	});
});

describe("rehydrate service", () => {
	afterEach(cleanup);

	it("reopens claimed events that have no lock", async () => {
		const id = await seedEvent(ASIA);
		await markEventClaimed(id, MOD_MOKSH);
		await releaseLock(id);

		await rehydrate();

		const event = await getEventById(id);
		expect(event?.status).toBe("open");
		expect(event?.claimed_by).toBeNull();
	});

	it("keeps claimed events with active locks as claimed", async () => {
		const id = await seedEvent(ASIA);
		await claimEvent(id, MOD_MOKSH, ASIA);

		await rehydrate();

		const event = await getEventById(id);
		expect(event?.status).toBe("claimed");
		expect(event?.claimed_by).toBe(MOD_MOKSH);
	});
});

afterAll(async () => {
	await cleanup();
});
