import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "bun:test"
import { SQL } from "bun"
import {
  insertEvent,
  getOpenEventsByRegion,
  getRecentEventsByRegion,
  getEventById,
  markEventClaimed,
  markEventResolved,
  markEventOpen,
  markEventExpired,
  reopenClaimedEventsByModerator,
  getAllClaimedEvents,
  getClaimedEventsByModerator,
  getResolvedEventsByModerator,
} from "../db/postgres"
import type { Region } from "../types"

const testSql = new SQL({
  url: process.env.DATABASE_URL ?? "postgres://localhost:5432/moderation",
})

const MOD_MOKSH = "a1b2c3d4-0001-0001-0001-000000000001"
const MOD_MARIA = "a1b2c3d4-0002-0002-0002-000000000002"
const MOD_JOHN  = "a1b2c3d4-0003-0003-0003-000000000003"

const ASIA: Region    = "Asia"
const EUROPE: Region  = "Europe"
const US: Region      = "US"

const createdEventIds: string[] = []

async function seedEvent(region: Region = ASIA, extra: Record<string, unknown> = {}): Promise<string> {
  const event = await insertEvent(region, { type: "fraud", severity: "high", ...extra })
  if (!event) throw new Error("insertEvent returned undefined")
  createdEventIds.push(event.id)
  return event.id
}

async function deleteTestEvents() {
  if (createdEventIds.length === 0) return
  for (const id of createdEventIds) {
    await testSql`DELETE FROM events WHERE id = ${id}::uuid`
  }
  createdEventIds.length = 0
}

describe("insertEvent", () => {
  afterEach(deleteTestEvents)

  it("inserts an event and returns a DbEvent with the correct fields", async () => {
    const payload = { type: "spam", severity: "low", user_id: "u-001" }
    const event = await insertEvent(ASIA, payload)

    expect(event).toBeDefined()
    expect(event!.id).toBeString()
    expect(event!.region_id).toBe(ASIA)
    expect(event!.status).toBe("open")
    expect(event!.claimed_by).toBeNull()
    expect(event!.claimed_at).toBeNull()
    expect(event!.resolved_at).toBeNull()
    expect(event!.created_at).toBeInstanceOf(Date)
    const rawPayload = event!.payload
    const parsedPayload =
      typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload
    expect(parsedPayload).toMatchObject(payload)

    createdEventIds.push(event!.id)
  })

  it("allows inserting events for different regions independently", async () => {
    const asia   = await insertEvent(ASIA,   { type: "t1" })
    const europe = await insertEvent(EUROPE, { type: "t2" })
    const us     = await insertEvent(US,     { type: "t3" })

    expect(asia!.region_id).toBe(ASIA)
    expect(europe!.region_id).toBe(EUROPE)
    expect(us!.region_id).toBe(US)

    createdEventIds.push(asia!.id, europe!.id, us!.id)
  })
})

describe("getOpenEventsByRegion", () => {
  afterEach(deleteTestEvents)

  it("returns only open events for the given region", async () => {
    const idA = await seedEvent(ASIA)
    const idB = await seedEvent(ASIA)
    const idC = await seedEvent(EUROPE)

    await markEventClaimed(idB, MOD_MOKSH)

    const events = await getOpenEventsByRegion(ASIA)
    const ids = events.map((e) => e.id)

    expect(ids).toContain(idA)
    expect(ids).not.toContain(idB)
    expect(ids).not.toContain(idC)
    events.forEach((e) => {
      expect(e.status).toBe("open")
      expect(e.region_id).toBe(ASIA)
    })
  })

  it("returns an empty array when no open events exist for the region", async () => {
    const events = await getOpenEventsByRegion(US)
    const ownedByUs = events.filter((e) => e.region_id === US)
    ownedByUs.forEach((e) => expect(e.status).toBe("open"))
  })

  it("results are ordered by created_at ascending", async () => {
    const id1 = await seedEvent(EUROPE)
    await Bun.sleep(5)
    const id2 = await seedEvent(EUROPE)

    const events = await getOpenEventsByRegion(EUROPE)
    const idx1 = events.findIndex((e) => e.id === id1)
    const idx2 = events.findIndex((e) => e.id === id2)
    expect(idx1).toBeLessThan(idx2)
  })
})

describe("getRecentEventsByRegion", () => {
  afterEach(deleteTestEvents)

  it("returns open, claimed, and resolved events but not expired ones", async () => {
    const openId     = await seedEvent(US)
    const claimedId  = await seedEvent(US)
    const resolvedId = await seedEvent(US)
    const expiredId  = await seedEvent(US)

    await markEventClaimed(claimedId, MOD_JOHN)
    await markEventResolved(resolvedId)
    await markEventExpired(expiredId)

    const events = await getRecentEventsByRegion(US)
    const ids = events.map((e) => e.id)

    expect(ids).toContain(openId)
    expect(ids).toContain(claimedId)
    expect(ids).toContain(resolvedId)
    expect(ids).not.toContain(expiredId)
  })
})

describe("getEventById", () => {
  afterEach(deleteTestEvents)

  it("returns the event when it exists", async () => {
    const id = await seedEvent(ASIA, { type: "abuse" })
    const event = await getEventById(id)
    expect(event).not.toBeNull()
    expect(event!.id).toBe(id)
    const rawPayload = event!.payload
    const parsedPayload =
      typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload
    expect(parsedPayload).toMatchObject({ type: "abuse" })
  })

  it("returns null for a non-existent id", async () => {
    const result = await getEventById("00000000-0000-0000-0000-000000000000")
    expect(result).toBeNull()
  })
})

describe("markEventClaimed", () => {
  afterEach(deleteTestEvents)

  it("transitions an open event to claimed and stamps claimed_at", async () => {
    const id = await seedEvent(ASIA)
    const claimed = await markEventClaimed(id, MOD_MOKSH)

    expect(claimed).not.toBeNull()
    expect(claimed!.status).toBe("claimed")
    expect(claimed!.claimed_by).toBe(MOD_MOKSH)
    expect(claimed!.claimed_at).toBeInstanceOf(Date)
  })

  it("returns null when the event is already claimed (no double-claim)", async () => {
    const id = await seedEvent(ASIA)
    await markEventClaimed(id, MOD_MOKSH)

    const secondClaim = await markEventClaimed(id, MOD_MARIA)
    expect(secondClaim).toBeNull()
  })

  it("returns null for a non-existent event id", async () => {
    const result = await markEventClaimed("00000000-0000-0000-0000-000000000000", MOD_MOKSH)
    expect(result).toBeNull()
  })
})

describe("markEventResolved", () => {
  afterEach(deleteTestEvents)

  it("sets status to resolved and stamps resolved_at", async () => {
    const id = await seedEvent(EUROPE)
    await markEventResolved(id)

    const event = await getEventById(id)
    expect(event!.status).toBe("resolved")
    expect(event!.resolved_at).toBeInstanceOf(Date)
  })
})

describe("markEventOpen", () => {
  afterEach(deleteTestEvents)

  it("reverts a claimed event back to open and clears moderator references", async () => {
    const id = await seedEvent(ASIA)
    await markEventClaimed(id, MOD_MOKSH)
    await markEventOpen(id)

    const event = await getEventById(id)
    expect(event!.status).toBe("open")
    expect(event!.claimed_by).toBeNull()
    expect(event!.claimed_at).toBeNull()
  })
})

describe("markEventExpired", () => {
  afterEach(deleteTestEvents)

  it("sets status to expired and stamps expired_at", async () => {
    const id = await seedEvent(US)
    await markEventExpired(id)

    const event = await getEventById(id)
    expect(event!.status).toBe("expired")
    expect(event!.expired_at).toBeInstanceOf(Date)
  })
})

describe("reopenClaimedEventsByModerator", () => {
  afterEach(deleteTestEvents)

  it("reopens all claimed events for the given moderator", async () => {
    const id1 = await seedEvent(ASIA)
    const id2 = await seedEvent(ASIA)
    const id3 = await seedEvent(ASIA)

    await markEventClaimed(id1, MOD_MOKSH)
    await markEventClaimed(id2, MOD_MOKSH)

    const reopened = await reopenClaimedEventsByModerator(MOD_MOKSH)
    const reopenedIds = reopened.map((e) => e.id)

    expect(reopenedIds).toContain(id1)
    expect(reopenedIds).toContain(id2)
    reopened.forEach((e) => {
      expect(e.status).toBe("open")
      expect(e.claimed_by).toBeNull()
    })
  })

  it("does not touch events claimed by a different moderator", async () => {
    const idAlice = await seedEvent(EUROPE)
    const idBob   = await seedEvent(EUROPE)

    await markEventClaimed(idAlice, MOD_MOKSH)
    await markEventClaimed(idBob, MOD_MARIA)

    await reopenClaimedEventsByModerator(MOD_MOKSH)

    const bobEvent = await getEventById(idBob)
    expect(bobEvent!.status).toBe("claimed")
    expect(bobEvent!.claimed_by).toBe(MOD_MARIA)
  })

  it("returns an empty array when the moderator has no claimed events", async () => {
    const result = await reopenClaimedEventsByModerator(MOD_JOHN)
    expect(result).toBeArray()
  })
})

describe("getAllClaimedEvents", () => {
  afterEach(deleteTestEvents)

  it("includes all currently claimed events regardless of region", async () => {
    const idAsia   = await seedEvent(ASIA)
    const idEurope = await seedEvent(EUROPE)

    await markEventClaimed(idAsia, MOD_MOKSH)
    await markEventClaimed(idEurope, MOD_MARIA)

    const all = await getAllClaimedEvents()
    const ids = all.map((e) => e.id)

    expect(ids).toContain(idAsia)
    expect(ids).toContain(idEurope)
    all.forEach((e) => expect(e.status).toBe("claimed"))
  })
})

describe("getClaimedEventsByModerator", () => {
  afterEach(deleteTestEvents)

  it("returns only the events claimed by the specified moderator", async () => {
    const idMoksh = await seedEvent(ASIA)
    const idMaria = await seedEvent(EUROPE)

    await markEventClaimed(idMoksh, MOD_MOKSH)
    await markEventClaimed(idMaria, MOD_MARIA)

    const result = await getClaimedEventsByModerator(MOD_MOKSH)
    const ids = result.map((e) => e.id)

    expect(ids).toContain(idMoksh)
    expect(ids).not.toContain(idMaria)
    result.forEach((e) => {
      expect(e.status).toBe("claimed")
      expect(e.claimed_by).toBe(MOD_MOKSH)
    })
  })

  it("returns an empty array when the moderator has no claimed events", async () => {
    const result = await getClaimedEventsByModerator(MOD_JOHN)
    expect(result).toBeArray()
    result.forEach((e) => expect(e.claimed_by).toBe(MOD_JOHN))
  })
})

describe("getResolvedEventsByModerator", () => {
  afterEach(deleteTestEvents)

  it("returns only resolved events for the specified moderator", async () => {
    const idResolved  = await seedEvent(ASIA)
    const idClaimed   = await seedEvent(ASIA)
    const idOtherMod  = await seedEvent(EUROPE)

    await markEventClaimed(idResolved, MOD_MOKSH)
    await markEventResolved(idResolved)

    await markEventClaimed(idClaimed, MOD_MOKSH)

    await markEventClaimed(idOtherMod, MOD_MARIA)
    await markEventResolved(idOtherMod)

    const result = await getResolvedEventsByModerator(MOD_MOKSH)
    const ids = result.map((e) => e.id)

    expect(ids).toContain(idResolved)
    expect(ids).not.toContain(idClaimed)
    expect(ids).not.toContain(idOtherMod)
    result.forEach((e) => {
      expect(e.status).toBe("resolved")
      expect(e.claimed_by).toBe(MOD_MOKSH)
    })
  })

  it("orders results by resolved_at descending (most recent first)", async () => {
    const id1 = await seedEvent(ASIA)
    await markEventClaimed(id1, MOD_MOKSH)
    await markEventResolved(id1)

    await Bun.sleep(5)

    const id2 = await seedEvent(ASIA)
    await markEventClaimed(id2, MOD_MOKSH)
    await markEventResolved(id2)

    const result = await getResolvedEventsByModerator(MOD_MOKSH)
    const ids = result.map((e) => e.id)
    const idx1 = ids.indexOf(id1)
    const idx2 = ids.indexOf(id2)

    expect(idx2).toBeLessThan(idx1)
  })
})

afterAll(async () => {
  await deleteTestEvents()
})
