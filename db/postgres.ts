import { SQL } from "bun"
import type { DbEvent, DbModerator, EventStatus, Region } from "../types"
import users from "../db/users.json"

type UsersMap = Record<string, { id: string; password: string; region: Region }>
const USERS = users as UsersMap

const sql = new SQL({
  url: process.env.DATABASE_URL ?? "postgres://localhost:5432/moderation",
})

export async function runMigrations(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY
    )
  `

  await sql`
    INSERT INTO regions (id) VALUES ('Asia'), ('Europe'), ('US')
    ON CONFLICT DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS moderators (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      region_id TEXT NOT NULL REFERENCES regions(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      region_id TEXT NOT NULL REFERENCES regions(id),
      payload JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'claimed', 'resolved', 'expired')),
      claimed_by UUID REFERENCES moderators(id),
      claimed_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      expired_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_events_region_status
    ON events (region_id, status)
  `

  for (const [name, user] of Object.entries(USERS)) {
    await sql`
      INSERT INTO moderators (id, name, region_id)
      VALUES (${user.id}::uuid, ${name}, ${user.region})
      ON CONFLICT (id) DO NOTHING
    `
  }
}

export async function insertEvent(
  regionId: Region,
  payload: Record<string, unknown>
): Promise<DbEvent|undefined> {
  const [row] = await sql<DbEvent[]>`
    INSERT INTO events (region_id, payload)
    VALUES (${regionId}, ${JSON.stringify(payload)}::jsonb)
    RETURNING *
  `
  return row
}

export async function getOpenEventsByRegion(region: Region): Promise<DbEvent[]> {
  return sql<DbEvent[]>`
    SELECT * FROM events
    WHERE region_id = ${region}
    AND status = 'open'
    ORDER BY created_at ASC
  `
}

export async function getRecentEventsByRegion(region: Region): Promise<DbEvent[]> {
  return sql<DbEvent[]>`
    SELECT * FROM events
    WHERE region_id = ${region}
    AND status IN ('open', 'claimed', 'resolved')
    ORDER BY created_at ASC
  `
}

export async function getEventById(id: string): Promise<DbEvent | null> {
  const [row] = await sql<DbEvent[]>`
    SELECT * FROM events WHERE id = ${id}
  `
  return row ?? null
}

export async function markEventClaimed(
  eventId: string,
  moderatorId: string
): Promise<DbEvent | null> {
  console.log("marking claimed ============", eventId, moderatorId)
  const [row] = await sql<DbEvent[]>`
    UPDATE events
    SET status = 'claimed',
        claimed_by = ${moderatorId}::uuid,
        claimed_at = now()
    WHERE id = ${eventId}::uuid
    AND status = 'open'
    RETURNING *
  `
  return row ?? null
}

export async function markEventResolved(eventId: string): Promise<void> {
  console.log("mark as resolved")
  await sql`
    UPDATE events
    SET status = 'resolved',
        resolved_at = now()
    WHERE id = ${eventId}::uuid
  `
}

export async function markEventOpen(eventId: string): Promise<void> {
  await sql`
    UPDATE events
    SET status = 'open',
        claimed_by = NULL,
        claimed_at = NULL
    WHERE id = ${eventId}::uuid
  `
}

export async function markEventExpired(eventId: string): Promise<void> {
  await sql`
    UPDATE events
    SET status = 'expired',
        expired_at = now()
    WHERE id = ${eventId}::uuid
  `
}

export async function reopenClaimedEventsByModerator(moderatorId: string): Promise<DbEvent[]> {
  return sql<DbEvent[]>`
    UPDATE events
    SET status = 'open',
        claimed_by = NULL,
        claimed_at = NULL
    WHERE claimed_by = ${moderatorId}::uuid
    AND status = 'claimed'
    RETURNING *
  `
}

export async function getAllClaimedEvents(): Promise<DbEvent[]> {
  return sql<DbEvent[]>`
    SELECT * FROM events WHERE status = 'claimed'
  `
}

export async function getClaimedEventsByModerator(moderatorId: string): Promise<DbEvent[]> {
  return sql<DbEvent[]>`
    SELECT * FROM events
    WHERE claimed_by = ${moderatorId}::uuid
    AND status = 'claimed'
    ORDER BY claimed_at ASC
  `
}

export { sql }