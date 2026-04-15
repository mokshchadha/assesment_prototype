import { useState, useRef } from "react"
import type { ModerationEvent, Moderator } from "../types"
import { useWs } from "../hooks/useWs"
import { EventCard } from "./EventCard"

type Tab = "open" | "claimed" | "resolved"

interface DashboardProps {
  moderator: Moderator
  onLogout: () => void
}

export function Dashboard({ moderator, onLogout }: DashboardProps) {
  const [tab, setTab] = useState<Tab>("open")
  const [events, setEvents] = useState<Record<string, ModerationEvent>>({})
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  function upsertEvent(event: ModerationEvent) {
    setEvents(prev => ({ ...prev, [event.id]: event }))
  }

  const wsOpts = {
    moderatorId: moderator.id,
    region: moderator.region_id,
    onAvailableEvents: (incoming: ModerationEvent[]) => {
      setEvents(prev => {
        const next = { ...prev }
        for (const e of incoming) next[e.id] = e
        return next
      })
    },
    onClaimSuccess: (event: ModerationEvent) => {
      upsertEvent(event)
      showToast("Event claimed")
    },
    onClaimFailed: (_: string, reason: string) => showToast(`Claim failed: ${reason}`),
    onClaimExpired: (eventId: string) => {
      setEvents(prev => {
        if (!prev[eventId]) return prev
        return { ...prev, [eventId]: { ...prev[eventId], status: "expired" } }
      })
      showToast("A claim expired")
    },
    onAckSuccess: (eventId: string) => {
      setEvents(prev => {
        if (!prev[eventId]) return prev
        return { ...prev, [eventId]: { ...prev[eventId], status: "resolved", resolved_at: new Date().toISOString() } }
      })
      showToast("Event resolved")
    },
    onAckFailed: (_: string, reason: string) => showToast(`Ack failed: ${reason}`),
    onError: (message: string) => showToast(`Error: ${message}`),
  }

  const { connected, claim, acknowledge } = useWs(wsOpts)

  const allEvents = Object.values(events)
  const openEvents = allEvents.filter(e => e.status === "open")
  const claimedEvents = allEvents.filter(e => e.status === "claimed")
  const resolvedEvents = allEvents.filter(e => e.status === "resolved")

  const tabList: { id: Tab; label: string; count: number }[] = [
    { id: "open", label: "Open", count: openEvents.length },
    { id: "claimed", label: "Claimed", count: claimedEvents.length },
    { id: "resolved", label: "Resolved", count: resolvedEvents.length },
  ]

  const visibleEvents = tab === "open" ? openEvents : tab === "claimed" ? claimedEvents : resolvedEvents

  return (
    <div className="dashboard-root">
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="dash-badge">MOD</div>
          <div>
            <div className="dash-name">{moderator.name}</div>
            <div className="dash-region">{moderator.region_id}</div>
          </div>
        </div>
        <div className="dash-header-right">
          <div className={`conn-dot ${connected ? "on" : "off"}`} />
          <span className="conn-label">{connected ? "Live" : "Offline"}</span>
          <button className="logout-btn" onClick={onLogout}>Log out</button>
        </div>
      </header>

      <div className="dash-tabs">
        {tabList.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="dash-body">
        {visibleEvents.length === 0 ? (
          <div className="empty-state">No {tab} events</div>
        ) : (
          <div className="events-grid">
            {visibleEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onClaim={event.status === "open" ? () => claim(event.id) : undefined}
                onAck={event.status === "claimed" ? () => acknowledge(event.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}