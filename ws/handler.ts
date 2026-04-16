import { t } from "elysia"
import { getOpenEventsByRegion, getClaimedEventsByModerator, getResolvedEventsByModerator } from "../db/postgres"
import { LOCK_TTL_SECONDS } from "../db/redis"
import { claimEvent, acknowledgeEvent } from "../services/claim"
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

    // subscribe this socket to its region topic
    // now ws.publish("Asia", ...) reaches every moderator in Asia
    ws.subscribe(region)

    const [openEvents, myClaimedEvents, myResolvedEvents] = await Promise.all([
      getOpenEventsByRegion(region),
      getClaimedEventsByModerator(user.id),
      getResolvedEventsByModerator(user.id),
    ])

    ws.send(JSON.stringify({ type: "available_events", events: [...openEvents, ...myClaimedEvents, ...myResolvedEvents], lockTtlSeconds: LOCK_TTL_SECONDS }))
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
        // publish to region — every other subscriber in this region gets it
        ws.publish(region, JSON.stringify({ type: "claim_success", event: result.event }))
      } else {
        ws.send(JSON.stringify({ type: "claim_failed", eventId: msg.eventId, reason: result.reason }))
      }
      return
    }

    if (msg.type === "acknowledge") {
      const result = await acknowledgeEvent(msg.eventId, user.id)
      if (result.success) {
        ws.send(JSON.stringify({ type: "ack_success", eventId: msg.eventId }))
        ws.publish(region, JSON.stringify({ type: "ack_success", eventId: msg.eventId }))
      } else {
        ws.send(JSON.stringify({ type: "ack_failed", eventId: msg.eventId, reason: result.reason }))
      }
      return
    }

    ws.send(JSON.stringify({ type: "error", message: "unknown message type" }))
  },

  async close(ws: any) {
    const { region } = ws.data.query as { name: string; region: Region; token: string }
    // bun automatically unsubscribes the socket on close
    // no session cleanup needed — redis owns claim state
  },
}