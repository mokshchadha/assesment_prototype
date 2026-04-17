import { SQL } from "bun"
import type { DbEvent, DbModerator, Region } from "../types"

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
      id TEXT PRIMARY KEY,
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
      claimed_by TEXT REFERENCES moderators(id),
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

  const seedModerators = [
    { id: "moksh", name: "moksh", region: "Asia" },
    { id: "maria", name: "maria", region: "Europe" },
    { id: "john", name: "john", region: "US" },
    { id: "alex", name: "alex", region: "Asia" },
  ]

  for (const m of seedModerators) {
    await sql`
      INSERT INTO moderators (id, name, region_id)
      VALUES (${m.id}, ${m.name}, ${m.region})
      ON CONFLICT (id) DO NOTHING
    `
  }
}

export async function getModeratorByName(name: string): Promise<DbModerator | null> {
  const [row] = await sql<DbModerator[]>`
    SELECT * FROM moderators WHERE name = ${name}
  `
  return row ?? null
}

export async function getModeratorById(id: string): Promise<DbModerator | null> {
  const [row] = await sql<DbModerator[]>`
    SELECT * FROM moderators WHERE id = ${id}
  `
  return row ?? null
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
  const [row] = await sql<DbEvent[]>`
    UPDATE events
    SET status = 'claimed',
        claimed_by = ${moderatorId},
        claimed_at = now()
    WHERE id = ${eventId}::uuid
    AND status = 'open'
    RETURNING *
  `
  return row ?? null
}

export async function markEventResolved(eventId: string): Promise<void> {
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
    WHERE claimed_by = ${moderatorId}
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
    WHERE claimed_by = ${moderatorId}
    AND status = 'claimed'
    ORDER BY claimed_at ASC
  `
}

export async function getResolvedEventsByModerator(moderatorId: string): Promise<DbEvent[]> {
  return sql<DbEvent[]>`
    SELECT * FROM events
    WHERE claimed_by = ${moderatorId}
    AND status = 'resolved'
    ORDER BY resolved_at DESC
  `
}

export { sql }