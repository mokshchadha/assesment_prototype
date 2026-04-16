import { useState } from "react"
import type { Region } from "../types"
import type { useAuth } from "../hooks/useAuth"

const REGIONS: Region[] = ["Asia", "Europe", "US"]

interface LoginProps {
  onLogin: ReturnType<typeof useAuth>["login"]
}

export function Login({ onLogin }: LoginProps) {
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [region, setRegion] = useState<Region>("Asia")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !password) return
    setLoading(true)
    setError("")

    const result = await onLogin(name.trim(), password, region)
    if (result.error) setError(result.error)

    setLoading(false)
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-header">
          <div className="login-badge">MOD</div>
          <h1>Moderation Console</h1>
          <p>Sign in with your moderator credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label>Username</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. alex.chen"
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
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

          <button type="submit" className="submit-btn" disabled={loading || !name.trim() || !password}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  )
}