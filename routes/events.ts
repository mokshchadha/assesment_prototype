import Elysia, { t } from "elysia"
import { insertEvent, getOpenEventsByRegion } from "../db/postgres"

const regionEnum = t.Union([
  t.Literal("Asia"),
  t.Literal("Europe"),
  t.Literal("US"),
])

export const eventRoutes = new Elysia()
  .post(
    "/events",
    async ({ body, set }) => {
      const event = await insertEvent(body.region, body.payload)
      set.status = 201
      return event
    },
    {
      body: t.Object({
        region: regionEnum,
        payload: t.Record(t.String(), t.Unknown()),
      }),
    }
  )
  .get(
    "/events/:region",
    async ({ params, set }) => {
      const region = params.region as "Asia" | "Europe" | "US"
      const events = await getOpenEventsByRegion(region)
      return events
    },
    {
      params: t.Object({
        region: regionEnum,
      }),
    }
  )