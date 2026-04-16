import {
  acquireLock,
  getLockOwner,
  releaseLock,
  releaseLockIfOwner,
  releaseAllLocksForModerator,
  LOCK_TTL_SECONDS,
} from "../db/redis"
import {
  getEventById,
  markEventClaimed,
  markEventResolved,
  markEventOpen,
  markEventExpired,
  reopenClaimedEventsByModerator,
} from "../db/postgres"
import { getSession, removeSession } from "../ws/sessions"
import { type DbEvent, type Region, TYPES } from "../types"

export async function claimEvent(
  eventId: string,
  moderatorId: string,
  moderatorRegion: Region
): Promise<{ success: true; event: DbEvent } | { success: false; reason: string }> {
  const event = await getEventById(eventId)

  if (!event) {
    return { success: false, reason: "event not found" }
  }

  if (event.status !== "open") {
    return { success: false, reason: "event is not open" }
  }

  if (event.region_id !== moderatorRegion) {
    return { success: false, reason: "region mismatch" }
  }

  const locked = await acquireLock(eventId, moderatorId)
  if (!locked) {
    return { success: false, reason: "event already claimed" }
  }

  const claimed = await markEventClaimed(eventId, moderatorId)
  if (!claimed) {
    await releaseLock(eventId)
    return { success: false, reason: "failed to update event status" }
  }

  const session = getSession(moderatorId)
  if (session) {
    session.claimedEvents.add(eventId)

    const timer = setTimeout(() => {
      session.ws.send(JSON.stringify({ type: TYPES.claimExpired, eventId }))
      session.claimedEvents.delete(eventId)
      session.timers.delete(eventId)
    }, LOCK_TTL_SECONDS * 1000)

    session.timers.set(eventId, timer)
  }

  return { success: true, event: claimed }
}

export async function acknowledgeEvent(
  eventId: string,
  moderatorId: string
): Promise<{ success: true } | { success: false; reason: string }> {
  const owner = await getLockOwner(eventId)

  if (owner !== moderatorId) {
    return { success: false, reason: "not the lock owner" }
  }

  await releaseLock(eventId)
  await markEventResolved(eventId)

  const session = getSession(moderatorId)
  if (session) {
    session.claimedEvents.delete(eventId)
    const timer = session.timers.get(eventId)
    if (timer) {
      clearTimeout(timer)
      session.timers.delete(eventId)
    }
  }

  return { success: true }
}

export async function releaseModeratorClaims(moderatorId: string): Promise<void> {
  const session = getSession(moderatorId)
  const eventIds = session ? [...session.claimedEvents] : []

  for (const timer of session?.timers.values() ?? []) {
    clearTimeout(timer)
  }

  removeSession(moderatorId)

  if (eventIds.length === 0) return

  await releaseAllLocksForModerator(eventIds)
  await reopenClaimedEventsByModerator(moderatorId)
}

export async function expireStaleEvent(eventId: string): Promise<void> {
  await markEventExpired(eventId)
}

export function scheduleExpiryNotification(
  eventId: string,
  moderatorId: string,
  ttlSeconds: number
): void {
  const session = getSession(moderatorId)
  if (!session) return

  if (session.timers.has(eventId)) {
    clearTimeout(session.timers.get(eventId)!)
  }

  const timer = setTimeout(() => {
    session.ws.send(JSON.stringify({ type: TYPES.claimExpired, eventId }))
    session.claimedEvents.delete(eventId)
    session.timers.delete(eventId)
  }, ttlSeconds * 1000)

  session.timers.set(eventId, timer)
}