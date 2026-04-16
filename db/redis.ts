import { RedisClient } from "bun"

const redis = new RedisClient(process.env.REDIS_URL ?? "redis://localhost:6379")

const LOCK_TTL_SECONDS = process.env.LOCK_TTL_SECONDS ? parseInt(process.env.LOCK_TTL_SECONDS, 10) : 900

function lockKey(eventId: string): string {
  return `lock:event:${eventId}`
}

export async function acquireLock(eventId: string, moderatorId: string): Promise<boolean> {
  const result = await redis.set(lockKey(eventId), moderatorId, "EX", String(LOCK_TTL_SECONDS), "NX")
  return result === "OK"
}

export async function releaseLock(eventId: string): Promise<void> {
  await redis.del(lockKey(eventId))
}

export async function getLockOwner(eventId: string): Promise<string | null> {
  return redis.get(lockKey(eventId))
}

export async function lockExists(eventId: string): Promise<boolean> {
  const val = await redis.exists(lockKey(eventId))
  return val === 1
}

export async function releaseLockIfOwner(
  eventId: string,
  moderatorId: string
): Promise<boolean> {
  const owner = await getLockOwner(eventId)
  if (owner !== moderatorId) return false
  await releaseLock(eventId)
  return true
}

export async function releaseAllLocksForModerator(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return
  const keys = eventIds.map(lockKey)
  await redis.del(...keys)
}

export { redis, LOCK_TTL_SECONDS }