export type Region = "Asia" | "Europe" | "US"
export type EventStatus = "open" | "claimed" | "resolved" | "expired"

export interface ModerationEvent {
  id: string
  region_id: Region
  payload: Record<string, unknown>
  status: EventStatus
  claimed_by: string | null
  claimed_at: string | null
  resolved_at: string | null
  expired_at: string | null
  created_at: string
}

export interface Moderator {
  id: string
  name: string
  region_id: Region
  created_at: string
}

export type ServerMessage =
  | { type: "available_events"; events: ModerationEvent[] }
  | { type: "claim_success"; event: ModerationEvent }
  | { type: "claim_failed"; eventId: string; reason: string }
  | { type: "claim_expired"; eventId: string }
  | { type: "ack_success"; eventId: string }
  | { type: "ack_failed"; eventId: string; reason: string }
  | { type: "error"; message: string }