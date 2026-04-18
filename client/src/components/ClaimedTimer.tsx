import { useState, useEffect } from "react"

interface ClaimTimerProps {
  claimedAt: string
  ttlSeconds: number
}

export function ClaimTimer({ claimedAt, ttlSeconds }: ClaimTimerProps) {
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const expireTime = new Date(claimedAt).getTime() + ttlSeconds * 1000

    const id = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= expireTime) clearInterval(id)
    }, 100)

    return () => clearInterval(id)
  }, [claimedAt, ttlSeconds])

  const expireTime = new Date(claimedAt).getTime() + ttlSeconds * 1000
  const remaining = Math.max(0, expireTime - now)
  const pct = Math.max(0, Math.min(100, (remaining / (ttlSeconds * 1000)) * 100))
  const secs = Math.ceil(remaining / 1000)
  const elapsedSecs = Math.floor((now - new Date(claimedAt).getTime()) / 1000)

  const label = remaining <= 0 ? "expired"
    : secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s`
    : `${secs}s`

  return (
    <div className="event-claimed-container">
      <div className="event-claimed-at">
        claimed {elapsedSecs}s ago
        {" · "}<span style={{ color: remaining < 10_000 ? "var(--red)" : undefined }}>{label}</span>
      </div>
      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}