import { useState } from "react"
import type { Moderator, Region } from "../types"

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000"
const REGIONS: Region[] = ["Asia", "Europe", "US"]

interface LoginProps {
  onLogin: (moderator: Moderator) => void
}

export function Login({ onLogin }: LoginProps) {
  const [name, setName] = useState("")
  const [region, setRegion] = useState<Region>("Asia")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError("")

    try {
      const res = await fetch(`${API}/moderators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), region }),
      })

      if (!res.ok) throw new Error("failed to register")

      const moderator: Moderator = await res.json()
      onLogin(moderator)
    } catch (err: any) {
      setError(err.message ?? "something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-header">
          <div className="login-badge">MOD</div>
          <h1>Moderation Console</h1>
          <p>Register to start reviewing events in your region</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label>Display name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. alex.chen"
              autoFocus
            />
          </div>

          <div className="field">
            <label>Region</label>
            <div className="region-group">
              {REGIONS.map(r => (
                <button
                  key={r}
                  type="button"
                  className={`region-btn ${region === r ? "active" : ""}`}
                  onClick={() => setRegion(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading || !name.trim()}>
            {loading ? "Connecting..." : "Enter Console"}
          </button>
        </form>
      </div>
    </div>
  )
}