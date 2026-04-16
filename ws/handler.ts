import { t } from "elysia"
import { getOpenEventsByRegion } from "../db/postgres"
import { addSession, getSession, hasSession } from "./sessions"
import { claimEvent, acknowledgeEvent, releaseModeratorClaims } from "../services/claim"
import { verifyJwt } from "../utils/jwt"
import users from "../db/users.json"
import type { ClientMessage, Region } from "../types"

type UsersMap = Record<string, { id: string; password: string; region: Region }>
const USERS = users as UsersMap

export const wsQuerySchema = t.Object({
  name: t.String(),
  region: t.Union([t.Literal("Asia"), t.Literal("Europe"), t.Literal("US")]),
  token: t.String(),
})

export const wsHandler = {
  query: wsQuerySchema,

  async open(ws: any) {
    const { name, region, token } = ws.data.query as { name: string; region: Region; token: string }

    const payload = await verifyJwt(token)
    if (!payload || payload.name !== name || payload.region !== region) {
      ws.send(JSON.stringify({ type: "error", message: "unauthorized" }))
      ws.close()
      return
    }

    const user = USERS[name]
    if (!user) {
      ws.send(JSON.stringify({ type: "error", message: "user not found" }))
      ws.close()
      return
    }

    if (hasSession(user.id)) {
      ws.send(JSON.stringify({ type: "error", message: "already connected" }))
      ws.close()
      return
    }

    addSession({
      moderatorId: user.id,
      region,
      claimedEvents: new Set(),
      timers: new Map(),
      ws,
    })

    const events = await getOpenEventsByRegion(region)
    ws.send(JSON.stringify({ type: "available_events", events }))
  },

  async message(ws: any, rawMessage: unknown) {
    const { name, region } = ws.data.query as { name: string; region: Region; token: string }

    const user = USERS[name]
    if (!user) {
      ws.send(JSON.stringify({ type: "error", message: "user not found" }))
      return
    }

    let msg: ClientMessage
    try {
      msg = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "invalid json" }))
      return
    }

    if (msg.type === "claim") {
      const result = await claimEvent(msg.eventId, user.id, region)
      if (result.success) {
        ws.send(JSON.stringify({ type: "claim_success", event: result.event }))
      } else {
        ws.send(JSON.stringify({ type: "claim_failed", eventId: msg.eventId, reason: result.reason }))
      }
      return
    }

    if (msg.type === "acknowledge") {
      const result = await acknowledgeEvent(msg.eventId, user.id)
      if (result.success) {
        ws.send(JSON.stringify({ type: "ack_success", eventId: msg.eventId }))
      } else {
        ws.send(JSON.stringify({ type: "ack_failed", eventId: msg.eventId, reason: result.reason }))
      }
      return
    }

    ws.send(JSON.stringify({ type: "error", message: "unknown message type" }))
  },

  async close(ws: any) {
    const { name } = ws.data.query as { name: string; region: Region; token: string }
    const user = USERS[name]
    if (!user) return
    await releaseModeratorClaims(user.id)
  },
}