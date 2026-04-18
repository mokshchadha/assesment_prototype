import Elysia, { t } from "elysia";
import { getModeratorByName } from "../db/postgres";
import { signJwt } from "../utils/jwt";
import { LOCK_TTL_SECONDS } from "../db/redis";

export const authRoutes = new Elysia({ prefix: "/auth" }).post(
  "/login",
  async ({ body, set }) => {
    const { name, region } = body;
    const moderator = await getModeratorByName(name);
    if (!moderator) {
      set.status = 401;
      return { error: "moderator not found" };
    }
    if (moderator.region_id !== region) {
      set.status = 401;
      return { error: "region mismatch" };
    }
    const token = await signJwt({
      sub: moderator.id,
      name: moderator.name,
      region: moderator.region_id,
      moderatorId: moderator.id,
    });
    return {
      token,
      userId: moderator.id,
      name: moderator.name,
      region: moderator.region_id,
      lockTtlSeconds: LOCK_TTL_SECONDS,
    };
  },
  {
    body: t.Object({
      name: t.String(),
      region: t.Union([
        t.Literal("Asia"),
        t.Literal("Europe"),
        t.Literal("US"),
      ]),
    }),
  },
);
