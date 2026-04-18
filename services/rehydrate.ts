import { getAllClaimedEvents, markEventOpen } from "../db/postgres";
import { lockExists } from "../db/redis";

export async function rehydrate(): Promise<void> {
	const claimedEvents = await getAllClaimedEvents();

	for (const event of claimedEvents) {
		const active = await lockExists(event.id);
		if (!active) {
			await markEventOpen(event.id);
		}
	}
}
