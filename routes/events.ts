import { Elysia, t } from "elysia"
import { insertEvent } from "../db/postgres"
import { publish } from "../ws/server"
import { TYPES } from "../types"
import type { Region } from "../types"

export const eventRoutes = new Elysia({ prefix: "/events" })
  .post(
    "/",
    async ({ body, set }) => {
      const { region, payload } = body as { region: Region; payload: Record<string, unknown> }

      const event = await insertEvent(region, payload)
      if (!event) {
        set.status = 500
        return { error: "failed to create event" }
      }

      publish(region, { type: TYPES.availableEvents, events: [event] })

      set.status = 201
      return event
    },
    {
      body: t.Object({
        region: t.Union([t.Literal("Asia"), t.Literal("Europe"), t.Literal("US")]),
        payload: t.Record(t.String(), t.Unknown()),
      }),
    }
  )