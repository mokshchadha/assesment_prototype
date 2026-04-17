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


function sendError(ws: any, message: string) {
  ws.send(JSON.stringify({ type: "error", message }))
}

function parseMessage(rawMessage: unknown): ClientMessage | null {
  try {
    return typeof rawMessage === "string" ? JSON.parse(rawMessage) : (rawMessage as ClientMessage)
  } catch {
    return null
  }
}

async function validateConnection(
  ws: any,
  name: string,
  region: Region,
  token: string,
): Promise<boolean> {
  const payload = await verifyJwt(token)
  const isValidToken = payload && payload.name === name && payload.region === region
  if (!isValidToken) {
    sendError(ws, "unauthorized")
    ws.close()
    return false
  }

  const user = USERS[name]
  if (!user) {
    sendError(ws, "user not found")
    ws.close()
    return false
  }

  return true
}

async function sendInitialEvents(ws: any, userId: string, region: Region) {
  const [openEvents, myClaimedEvents, myResolvedEvents] = await Promise.all([
    getOpenEventsByRegion(region),
    getClaimedEventsByModerator(userId),
    getResolvedEventsByModerator(userId),
  ])

  ws.send(
    JSON.stringify({
      type: "available_events",
      events: [...openEvents, ...myClaimedEvents, ...myResolvedEvents],
      lockTtlSeconds: LOCK_TTL_SECONDS,
    }),
  )
}

async function handleClaim(ws: any, msg: ClientMessage & { type: "claim" }, userId: string, region: Region) {
  const result = await claimEvent(msg.eventId, userId, region)

  if (result.success) {
    const payload = JSON.stringify({ type: "claim_success", event: result.event })
    ws.send(payload)
    ws.publish(region, payload)
  } else {
    ws.send(JSON.stringify({ type: "claim_failed", eventId: msg.eventId, reason: result.reason }))
  }
}

async function handleAcknowledge(ws: any, msg: ClientMessage & { type: "acknowledge" }, userId: string, region: Region) {
  const result = await acknowledgeEvent(msg.eventId, userId)

  if (result.success) {
    const payload = JSON.stringify({ type: "ack_success", eventId: msg.eventId })
    ws.send(payload)
    ws.publish(region, payload)
  } else {
    ws.send(JSON.stringify({ type: "ack_failed", eventId: msg.eventId, reason: result.reason }))
  }
}


export const wsHandler = {
  query: wsQuerySchema,

  async open(ws: any) {
    const { name, region, token } = ws.data.query as { name: string; region: Region; token: string }

    const isValid = await validateConnection(ws, name, region, token)
    if (!isValid) return

    ws.subscribe(region)
    await sendInitialEvents(ws, USERS[name]?.id ??'', region)
  },

  async message(ws: any, rawMessage: unknown) {
    const { name, region } = ws.data.query as { name: string; region: Region; token: string }

    const user = USERS[name]
    if (!user) {
      sendError(ws, "user not found")
      return
    }

    const msg = parseMessage(rawMessage)
    if (!msg) {
      sendError(ws, "invalid json")
      return
    }

    if (msg.type === "claim") return handleClaim(ws, msg as any, user.id, region)
    if (msg.type === "acknowledge") return handleAcknowledge(ws, msg as any, user.id, region)

    sendError(ws, "unknown message type")
  },

  async close(_ws: any) {},
}