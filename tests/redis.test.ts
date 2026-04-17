import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test"
import { RedisClient } from "bun"
import {
  acquireLock,
  releaseLock,
  getLockOwner,
  lockExists,
  releaseLockIfOwner,
  releaseAllLocksForModerator,
  eventIdFromLockKey,
} from "../db/redis"

const testRedis = new RedisClient(process.env.REDIS_URL ?? "redis://localhost:6379")

const TEST_EVENT_A = "test-event-00000001"
const TEST_EVENT_B = "test-event-00000002"
const TEST_EVENT_C = "test-event-00000003"
const MOD_ALICE = "mod-alice-uuid-0001"
const MOD_BOB = "mod-bob-uuid-0002"

async function cleanupKeys(...eventIds: string[]) {
  const keys = eventIds.map((id) => `lock:event:${id}`)
  if (keys.length) await testRedis.del(...keys)
}

describe("eventIdFromLockKey", () => {
  it("extracts the event id from a valid lock key", () => {
    expect(eventIdFromLockKey("lock:event:abc-123")).toBe("abc-123")
  })

  it("handles UUIDs correctly", () => {
    const uuid = "a1b2c3d4-0001-0001-0001-000000000001"
    expect(eventIdFromLockKey(`lock:event:${uuid}`)).toBe(uuid)
  })

  it("returns null when the prefix does not match", () => {
    expect(eventIdFromLockKey("other:event:abc-123")).toBeNull()
  })

  it("returns null for an empty string", () => {
    expect(eventIdFromLockKey("")).toBeNull()
  })

  it("returns null when only the prefix is present with no id", () => {
    expect(eventIdFromLockKey("lock:event:")).toBe("")
  })
})

describe("acquireLock", () => {
  afterEach(async () => {
    await cleanupKeys(TEST_EVENT_A, TEST_EVENT_B)
  })

  it("returns true when the lock is not yet held", async () => {
    const acquired = await acquireLock(TEST_EVENT_A, MOD_ALICE)
    expect(acquired).toBe(true)
  })

  it("returns false when another moderator already holds the lock", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    const secondAttempt = await acquireLock(TEST_EVENT_A, MOD_BOB)
    expect(secondAttempt).toBe(false)
  })

  it("returns false when the same moderator tries to re-acquire an existing lock", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    const reAcquire = await acquireLock(TEST_EVENT_A, MOD_ALICE)
    expect(reAcquire).toBe(false)
  })

  it("allows independent locks per event", async () => {
    const a = await acquireLock(TEST_EVENT_A, MOD_ALICE)
    const b = await acquireLock(TEST_EVENT_B, MOD_BOB)
    expect(a).toBe(true)
    expect(b).toBe(true)
  })
})

describe("getLockOwner", () => {
  afterEach(async () => {
    await cleanupKeys(TEST_EVENT_A)
  })

  it("returns the moderator id that holds the lock", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    const owner = await getLockOwner(TEST_EVENT_A)
    expect(owner).toBe(MOD_ALICE)
  })

  it("returns null when no lock exists for the event", async () => {
    const owner = await getLockOwner(TEST_EVENT_A)
    expect(owner).toBeNull()
  })
})

describe("lockExists", () => {
  afterEach(async () => {
    await cleanupKeys(TEST_EVENT_A)
  })

  it("returns true when a lock has been acquired", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    expect(await lockExists(TEST_EVENT_A)).toBe(true)
  })

  it("returns false when no lock exists", async () => {
    expect(await lockExists(TEST_EVENT_A)).toBe(false)
  })

  it("returns false after the lock has been released", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    await releaseLock(TEST_EVENT_A)
    expect(await lockExists(TEST_EVENT_A)).toBe(false)
  })
})

describe("releaseLock", () => {
  afterEach(async () => {
    await cleanupKeys(TEST_EVENT_A)
  })

  it("removes the lock so another moderator can acquire it", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    await releaseLock(TEST_EVENT_A)
    const acquired = await acquireLock(TEST_EVENT_A, MOD_BOB)
    expect(acquired).toBe(true)
  })

  it("is idempotent — releasing a non-existent lock does not throw", async () => {
    await expect(releaseLock("non-existent-event-id")).resolves.toBeUndefined()
  })
})

describe("releaseLockIfOwner", () => {
  afterEach(async () => {
    await cleanupKeys(TEST_EVENT_A)
  })

  it("releases the lock and returns true when called by the owner", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    const result = await releaseLockIfOwner(TEST_EVENT_A, MOD_ALICE)
    expect(result).toBe(true)
    expect(await lockExists(TEST_EVENT_A)).toBe(false)
  })

  it("does NOT release the lock and returns false when a non-owner calls it", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    const result = await releaseLockIfOwner(TEST_EVENT_A, MOD_BOB)
    expect(result).toBe(false)
    expect(await getLockOwner(TEST_EVENT_A)).toBe(MOD_ALICE)
  })

  it("returns false when no lock exists at all", async () => {
    const result = await releaseLockIfOwner(TEST_EVENT_A, MOD_ALICE)
    expect(result).toBe(false)
  })
})

describe("releaseAllLocksForModerator", () => {
  afterEach(async () => {
    await cleanupKeys(TEST_EVENT_A, TEST_EVENT_B, TEST_EVENT_C)
  })

  it("deletes all specified locks in one call", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    await acquireLock(TEST_EVENT_B, MOD_ALICE)
    await acquireLock(TEST_EVENT_C, MOD_ALICE)

    await releaseAllLocksForModerator([TEST_EVENT_A, TEST_EVENT_B, TEST_EVENT_C])

    expect(await lockExists(TEST_EVENT_A)).toBe(false)
    expect(await lockExists(TEST_EVENT_B)).toBe(false)
    expect(await lockExists(TEST_EVENT_C)).toBe(false)
  })

  it("is a no-op and does not throw when the array is empty", async () => {
    await expect(releaseAllLocksForModerator([])).resolves.toBeUndefined()
  })

  it("only removes the specified event locks, leaving others intact", async () => {
    await acquireLock(TEST_EVENT_A, MOD_ALICE)
    await acquireLock(TEST_EVENT_B, MOD_ALICE)
    await acquireLock(TEST_EVENT_C, MOD_BOB)

    await releaseAllLocksForModerator([TEST_EVENT_A, TEST_EVENT_B])

    expect(await lockExists(TEST_EVENT_A)).toBe(false)
    expect(await lockExists(TEST_EVENT_B)).toBe(false)
    expect(await lockExists(TEST_EVENT_C)).toBe(true)
  })
})

afterAll(async () => {
  await cleanupKeys(TEST_EVENT_A, TEST_EVENT_B, TEST_EVENT_C)
})
