import { useState } from "react"
import type { Moderator } from "./types"
import { Login } from "./components/Login"
import { Dashboard } from "./components/Dashboard"

export default function App() {
  const [moderator, setModerator] = useState<Moderator | null>(null)

  function handleLogout() {
    setModerator(null)
  }

  return moderator
    ? <Dashboard moderator={moderator} onLogout={handleLogout} />
    : <Login onLogin={setModerator} />
}