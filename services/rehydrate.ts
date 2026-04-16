import { getAllClaimedEvents, markEventExpired } from "../db/postgres"
import { lockExists } from "../db/redis"
import { scheduleExpiryNotification } from "./claim"

export async function rehydrate(): Promise<void> {
  const claimedEvents = await getAllClaimedEvents()

  for (const event of claimedEvents) {
    const active = await lockExists(event.id)

    if (!active) {
      await markEventExpired(event.id)
      continue
    }

    if (event.claimed_by && event.claimed_at) {
      const claimedAtMs = new Date(event.claimed_at).getTime()
      const elapsedSeconds = (Date.now() - claimedAtMs) / 1000
      const remainingSeconds = Math.max(0, 900 - elapsedSeconds)

      if (remainingSeconds > 0) {
        scheduleExpiryNotification(event.id, event.claimed_by, remainingSeconds)
      } else {
        await markEventExpired(event.id)
      }
    }
  }
}