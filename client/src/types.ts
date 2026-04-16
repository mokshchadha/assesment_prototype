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

export const TYPES = {
  availableEvents: "available_events",
  claimSuccess: "claim_success",
  claimFailed: "claim_failed",
  claimExpired: "claim_expired",
  ackSuccess: "ack_success",
  ackFailed: "ack_failed",
  error: "error",
  claim: "claim",
  acknowledge: "acknowledge",
} as const

export type ServerMessage =
  | { type: typeof TYPES.availableEvents; events: ModerationEvent[]; lockTtlSeconds: number }
  | { type: typeof TYPES.claimSuccess; event: ModerationEvent }
  | { type: typeof TYPES.claimFailed; eventId: string; reason: string }
  | { type: typeof TYPES.claimExpired; eventId: string }
  | { type: typeof TYPES.ackSuccess; eventId: string }
  | { type: typeof TYPES.ackFailed; eventId: string; reason: string }
  | { type: typeof TYPES.error; message: string }

export type ClientMessage =
  | { type: typeof TYPES.claim; eventId: string }
  | { type: typeof TYPES.acknowledge; eventId: string }