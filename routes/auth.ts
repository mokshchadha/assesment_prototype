import Elysia, { t } from "elysia"
import users from "../db/users.json"
import { signJwt } from "../utils/jwt"
import type { Region } from "../types"

type UsersMap = Record<string, { id: string; password: string; region: Region }>
const USERS = users as UsersMap

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post(
    "/login",
    async ({ body, set }) => {
      const record = USERS[body.name]

      if (!record || record.password !== body.password) {
        set.status = 401
        return { error: "invalid credentials" }
      }

      if (record.region !== body.region) {
        set.status = 401
        return { error: "region does not match account" }
      }

      const token = await signJwt({
        sub: record.id,
        name: body.name,
        region: record.region,
        moderatorId: record.id,
      })

      return { token, name: body.name, region: record.region }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 }),
        region: t.Union([
          t.Literal("Asia"),
          t.Literal("Europe"),
          t.Literal("US"),
        ]),
      }),
    }
  )
  .post("/logout", () => ({ ok: true }))