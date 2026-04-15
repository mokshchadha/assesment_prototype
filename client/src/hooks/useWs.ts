import { useEffect, useRef, useCallback, useState } from "react"
import type { ModerationEvent, ServerMessage } from "../types"

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000"

interface UseWsOptions {
  moderatorId: string
  region: string
  onAvailableEvents: (events: ModerationEvent[]) => void
  onClaimSuccess: (event: ModerationEvent) => void
  onClaimFailed: (eventId: string, reason: string) => void
  onClaimExpired: (eventId: string) => void
  onAckSuccess: (eventId: string) => void
  onAckFailed: (eventId: string, reason: string) => void
  onError: (message: string) => void
}

export function useWs(opts: UseWsOptions | null) {
  const ws = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!opts) return

    const url = `${WS_URL}/ws?moderatorId=${opts.moderatorId}&region=${opts.region}`
    const socket = new WebSocket(url)
    ws.current = socket

    socket.onopen = () => setConnected(true)
    socket.onclose = () => setConnected(false)

    socket.onmessage = (e) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(e.data)
      } catch {
        return
      }

      switch (msg.type) {
        case "available_events": opts.onAvailableEvents(msg.events); break
        case "claim_success":    opts.onClaimSuccess(msg.event); break
        case "claim_failed":     opts.onClaimFailed(msg.eventId, msg.reason); break
        case "claim_expired":    opts.onClaimExpired(msg.eventId); break
        case "ack_success":      opts.onAckSuccess(msg.eventId); break
        case "ack_failed":       opts.onAckFailed(msg.eventId, msg.reason); break
        case "error":            opts.onError(msg.message); break
      }
    }

    return () => {
      socket.close()
      ws.current = null
    }
  }, [opts?.moderatorId, opts?.region])

  const claim = useCallback((eventId: string) => {
    ws.current?.send(JSON.stringify({ type: "claim", eventId }))
  }, [])

  const acknowledge = useCallback((eventId: string) => {
    ws.current?.send(JSON.stringify({ type: "acknowledge", eventId }))
  }, [])

  return { connected, claim, acknowledge }
}