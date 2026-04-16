import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { runMigrations } from "./db/postgres"
import { authRoutes } from "./routes/auth"
import { eventRoutes } from "./routes/events"
import { wsHandler } from "./ws/handler"
import { rehydrate } from "./services/rehydrate"
import { authMiddleware } from "./middleware/auth"

const app = new Elysia()
  .use(cors())
  .use(authMiddleware)
  .use(authRoutes)
  .use(eventRoutes)
  .ws("/ws", wsHandler)
  .get("/health", () => ({ status: "ok" }))
  .onError(({ error, set, code }) => {
    if (code === "VALIDATION") {
      set.status = 400
      return { error: error.message }
    }
    if ((error as any).message === "missing token" || (error as any).message === "invalid or expired token") {
      set.status = 401
      return { error: (error as any).message }
    }
    console.error(error)
    set.status = 500
    return { error: "internal server error" }
  })
  .onStart(async () => {
    await runMigrations()
    await rehydrate()
  })
  .listen(process.env.PORT ?? 3000)

console.log(`listening on ${app.server?.hostname}:${app.server?.port}`)

export type App = typeof app