import { useState, useRef, useEffect } from "react"
import type { ModerationEvent, Region } from "../types"
import { useWs } from "../hooks/useWs"
import { EventCard } from "./EventCard"

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000"
const LOCK_TTL_STORAGE_KEY = "mod_lock_ttl"

function getStoredTtl(): number {
  try {
    const raw = localStorage.getItem(LOCK_TTL_STORAGE_KEY)
    if (raw) {
      const val = parseInt(raw, 10)
      if (!isNaN(val) && val > 0) return val
    }
  } catch {}
  return 900
}

type Tab = "open" | "claimed" | "resolved"

interface DashboardProps {
  userId: string
  name: string
  region: Region
  token: string
  onLogout: () => void
}

export function Dashboard({ userId, name, region, token, onLogout }: DashboardProps) {
  const [tab, setTab] = useState<Tab>("open")
  const [events, setEvents] = useState<Record<string, ModerationEvent>>({})
  const lockTtl = getStoredTtl()
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
    name,
    region,
    token,
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
    },
    onAckFailed: (_: string, reason: string) => showToast(`Ack failed: ${reason}`),
    onError: (message: string) => showToast(`Error: ${message}`),
  }

  const { connected, claim, acknowledge } = useWs(wsOpts)

  useEffect(() => {
    let active = true
    fetch(`${API}/events`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (!active) return
        if (data.events) {
          setEvents(prev => {
            const next = { ...prev }
            for (const e of data.events) next[e.id] = e
            return next
          })
        }
      })
      .catch(err => console.error("Initial load failed", err))

    return () => { active = false }
  }, [token])

  const allEvents = Object.values(events)
  const openEvents = allEvents.filter(e => e.status === "open")
  const claimedEvents = allEvents.filter(e => e.status === "claimed" && e.claimed_by === userId)
  const resolvedEvents = allEvents.filter(e => e.status === "resolved" && e.claimed_by === userId)

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
            <div className="dash-name">{name}</div>
            <div className="dash-region">{region}</div>
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
                lockTtlSeconds={lockTtl}
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