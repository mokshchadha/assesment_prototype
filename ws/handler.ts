import { t } from "elysia"
import { getModeratorByName } from "../db/postgres"
import { claimEvent, acknowledgeEvent } from "../services/claim"
import { verifyJwt } from "../utils/jwt"
import type { ClientMessage, Region } from "../types"

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

  const moderator = await getModeratorByName(name)
  if (!moderator) {
    sendError(ws, "user not found")
    ws.close()
    return false
  }

  return true
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

    const moderator = await getModeratorByName(name)
    if (!moderator) {
      sendError(ws, "user not found")
      ws.close()
      return
    }

    ws.subscribe(region)
  },

  async message(ws: any, rawMessage: unknown) {
    const { name, region } = ws.data.query as { name: string; region: Region; token: string }

    const moderator = await getModeratorByName(name)
    if (!moderator) {
      sendError(ws, "user not found")
      return
    }

    const msg = parseMessage(rawMessage)
    if (!msg) {
      sendError(ws, "invalid json")
      return
    }

    if (msg.type === "claim") return handleClaim(ws, msg as any, moderator.id, region)
    if (msg.type === "acknowledge") return handleAcknowledge(ws, msg as any, moderator.id, region)

    sendError(ws, "unknown message type")
  },

  async close(_ws: any) {},
}