import { acquireLock, getLockOwner, releaseLock, releaseAllLocksForModerator } from "../db/redis"
import { getEventById, markEventClaimed, markEventResolved, markEventOpen, reopenClaimedEventsByModerator } from "../db/postgres"
import { type DbEvent, type Region } from "../types"

export async function claimEvent(
  eventId: string,
  moderatorId: string,
  moderatorRegion: Region
): Promise<{ success: true; event: DbEvent } | { success: false; reason: string }> {
  const event = await getEventById(eventId)
  console.log("moderatorId claiming ", moderatorId)
  if (!event) return { success: false, reason: "event not found" }
  if (event.status !== "open") return { success: false, reason: "event is not open" }
  if (event.region_id !== moderatorRegion) return { success: false, reason: "region mismatch" }

  const locked = await acquireLock(eventId, moderatorId)
  if (!locked) return { success: false, reason: "event already claimed" }

  const claimed = await markEventClaimed(eventId, moderatorId)
  if (!claimed) {
    await releaseLock(eventId)
    return { success: false, reason: "failed to update event status" }
  }

  return { success: true, event: claimed }
}

export async function acknowledgeEvent(
  eventId: string,
  moderatorId: string
): Promise<{ success: true } | { success: false; reason: string }> {
  const owner = await getLockOwner(eventId)
  if (owner !== moderatorId) return { success: false, reason: "not the lock owner" }

  await releaseLock(eventId)
  await markEventResolved(eventId)

  return { success: true }
}