import type { ModeratorSession } from "../types"

const sessions = new Map<string, ModeratorSession>()

export function addSession(session: ModeratorSession): void {
  sessions.set(session.moderatorId, session)
}

export function getSession(moderatorId: string): ModeratorSession | undefined {
  return sessions.get(moderatorId)
}

export function removeSession(moderatorId: string): void {
  sessions.delete(moderatorId)
}

export function hasSession(moderatorId: string): boolean {
  return sessions.has(moderatorId)
}

export function broadcastToRegion(region: string, message: unknown): void {
  const payload = JSON.stringify(message)
  for (const session of sessions.values()) {
    if (session.region === region) {
      session.ws.send(payload)
    }
  }
}

export { sessions }