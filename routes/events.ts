import { Elysia, t } from "elysia";
import {
  insertEvent,
  getOpenEventsByRegion,
  getClaimedEventsByModerator,
  getResolvedEventsByModerator,
} from "../db/postgres";
import { publish } from "../ws/server";
import { LOCK_TTL_SECONDS } from "../db/redis";
import { TYPES } from "../types";
import type { Region } from "../types";
import { authMiddleware } from "../middleware/auth";

export const eventRoutes = new Elysia({ prefix: "/events" })
  .use(authMiddleware)
  .get("/", async ({ jwtPayload }) => {
    const { moderatorId, region } = jwtPayload as {
      moderatorId: string;
      region: Region;
    };
    const [openEvents, myClaimedEvents, myResolvedEvents] = await Promise.all([
      getOpenEventsByRegion(region),
      getClaimedEventsByModerator(moderatorId),
      getResolvedEventsByModerator(moderatorId),
    ]);

    return {
      events: [...openEvents, ...myClaimedEvents, ...myResolvedEvents],
      lockTtlSeconds: LOCK_TTL_SECONDS,
    };
  })
  .post(
    "/",
    async ({ body, set }) => {
      const { region, payload } = body as {
        region: Region;
        payload: Record<string, unknown>;
      };

      const event = await insertEvent(region, payload);
      if (!event) {
        set.status = 500;
        return { error: "failed to create event" };
      }

      publish(region, { type: TYPES.availableEvents, events: [event] });

      set.status = 201;
      return event;
    },
    {
      body: t.Object({
        region: t.Union([
          t.Literal("Asia"),
          t.Literal("Europe"),
          t.Literal("US"),
        ]),
        payload: t.Record(t.String(), t.Unknown()),
      }),
    },
  );
