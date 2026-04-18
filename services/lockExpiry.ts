import { redisSubscriber, eventIdFromLockKey } from "../db/redis";
import { getEventById, markEventOpen } from "../db/postgres";
import { publish } from "../ws/server";
import { TYPES } from "../types";

export async function startLockExpiryListener(): Promise<void> {
	await redisSubscriber.subscribe(
		"__keyevent@0__:expired",
		async (message: string) => {
			const eventId = eventIdFromLockKey(message);
			if (!eventId) return;

			const event = await getEventById(eventId);
			if (!event || event.status !== "claimed") return;

			const region = event.region_id;
			await markEventOpen(eventId);

			const reopened = await getEventById(eventId);
			if (!reopened) return;

			publish(region, { type: TYPES.claimExpired, eventId });
			publish(region, { type: TYPES.availableEvents, events: [reopened] });
		},
	);
}
