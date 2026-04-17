import Elysia, { t } from "elysia"
import { getModeratorByName } from "../db/postgres"
import { signJwt } from "../utils/jwt"
import type { Region } from "../types"

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post(
    "/login",
    async ({ body, set }) => {
      const record = await getModeratorByName(body.name)

      if (!record) {
        set.status = 401
        return { error: "invalid credentials" }
      }

      if (record.region_id !== body.region) {
        set.status = 401
        return { error: "region does not match account" }
      }

      const token = await signJwt({
        sub: record.id,
        name: body.name,
        region: record.region_id,
        moderatorId: record.id,
      })

      return { token, name: body.name, region: record.region_id }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        region: t.Union([
          t.Literal("Asia"),
          t.Literal("Europe"),
          t.Literal("US"),
        ]),
      }),
    }
  )
  .post("/logout", () => ({ ok: true }))