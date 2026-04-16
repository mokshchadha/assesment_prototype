import type { ModerationEvent } from "../types"

interface EventCardProps {
  event: ModerationEvent
  onClaim?: () => void
  onAck?: () => void
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  claimed: "Claimed",
  resolved: "Resolved",
  expired: "Expired",
}

export function EventCard({ event, onClaim, onAck }: EventCardProps) {
  let payloadObj: Record<string, any> = {};
  if (typeof event.payload === 'string') {
    try {
      payloadObj = JSON.parse(event.payload);
    } catch (e) {
      // ignore JSON parse errors
    }
  } else if (typeof event.payload === 'object' && event.payload !== null) {
    payloadObj = event.payload;
  }

  const { type, severity, reported_at, user_id } = payloadObj;

  return (
    <div className={`event-card status-${event.status}`}>
      <div className="event-card-top">
        <div className="event-meta">
          <span className={`status-pill ${event.status}`}>{STATUS_LABEL[event.status]}</span>
          <span className="event-region">{event.region_id}</span>
        </div>
        <span className="event-time">{timeAgo(event.created_at)}</span>
      </div>

      <div className="event-id">{event.id}</div>

      <div className="event-payload beautified">
        <div className="payload-tags">
          {type && <span className="ptag ptag-type">{String(type).replace(/_/g, ' ')}</span>}
          {severity && <span className={`ptag ptag-sev-${String(severity).toLowerCase()}`}>{String(severity)}</span>}
        </div>

        <div className="payload-grid">
          {reported_at && (
            <div className="payload-row">
              <span className="payload-key">reported at</span>
              <span className="payload-val">{String(reported_at)}</span>
            </div>
          )}
          {user_id && (
            <div className="payload-row">
              <span className="payload-key">user id</span>
              <span className="payload-val">{String(user_id)}</span>
            </div>
          )}
        </div>
      </div>

      {event.claimed_at && (
        <div className="event-claimed-at">
          claimed {timeAgo(event.claimed_at)}
        </div>
      )}

      <div className="event-actions">
        {event.status === "open" && onClaim && (
          <button className="btn-claim" onClick={onClaim}>Claim</button>
        )}
        {event.status === "claimed" && onAck && (
          <button className="btn-ack" onClick={onAck}>Acknowledge</button>
        )}
      </div>
    </div>
  )
}