import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { runMigrations } from "./db/postgres"
import { authRoutes } from "./routes/auth"
import { eventRoutes } from "./routes/events"
import { wsHandler } from "./ws/handler"
import { rehydrate } from "./services/rehydrate"
import { enableKeyspaceNotifications } from "./db/redis"
import { startLockExpiryListener } from "./services/lockExpiry"
import { authMiddleware } from "./middleware/auth"
import { setServer } from "./ws/server"
import { handleError } from "./utils/error"

export const app = new Elysia()
  .use(cors())
  .use(authMiddleware)
  .use(authRoutes)
  .use(eventRoutes)
  .ws("/ws", wsHandler)
  .get("/health", () => ({ status: "ok" }))
  .onError(handleError)
  .onStart(async ({ server }) => {
    setServer(server!)
    await runMigrations()
    await rehydrate()
    await enableKeyspaceNotifications()
    await startLockExpiryListener()
  })
  .listen(process.env.PORT ?? 3000)

console.log(`listening on ${app.server?.hostname}:${app.server?.port}`)

export type App = typeof app