import users from "./db/users.json"

const API = process.env.API_URL ?? "http://localhost:3000"
const REGIONS = ["Asia", "Europe", "US"] as const

const EVENT_TYPES = [
  "spam",
  "hate_speech",
  "misinformation",
  "harassment",
  "explicit_content",
  "fraud",
  "violence",
  "impersonation",
]

const PLATFORMS = ["web", "mobile", "api"]
const SEVERITIES = ["low", "medium", "high", "critical"]

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomPayload(region: (typeof REGIONS)[number]) {
  return {
    type: randomItem(EVENT_TYPES),
    severity: randomItem(SEVERITIES),
    platform: randomItem(PLATFORMS),
    region,
    user_id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    content_id: `cnt_${Math.random().toString(36).slice(2, 10)}`,
    reported_at: new Date().toISOString(),
    meta: {
      ip: `${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}`,
      score: parseFloat((Math.random()).toFixed(3)),
    },
  }
}

async function getToken(): Promise<string> {
  const [name, user] = Object.entries(users)[0]
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password: user.password, region: user.region }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`login failed: ${body}`)
  }

  const data = await res.json()
  return data.token
}

async function sendEvent(token: string, region: (typeof REGIONS)[number]): Promise<void> {
  const res = await fetch(`${API}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ region, payload: randomPayload(region) }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`  failed [${region}]: ${res.status} ${body}`)
    return
  }

  const event = await res.json()
  console.log(`  sent   [${region}] ${event.id} type=${event.payload.type} severity=${event.payload.severity}`)
}

async function main() {
  const arg = process.argv.find(a => a.startsWith("--events="))
  if (!arg) {
    console.error("usage: bun seed-events.ts --events=<number>")
    process.exit(1)
  }

  const max = parseInt(arg.split("=")[1], 10)
  if (isNaN(max) || max <= 0) {
    console.error("--events must be a positive integer")
    process.exit(1)
  }

  console.log(`connecting to ${API}`)
  console.log(`will send 0–${max} events randomly every 2 seconds\n`)

  let token = await getToken()
  console.log("authenticated\n")

  let totalSent = 0

  async function tick() {
    const count = randomInt(0, max)
    if (count === 0) {
      console.log(`tick: skipped (0 events this round)`)
    } else {
      console.log(`tick: sending ${count} event${count === 1 ? "" : "s"}`)
      await Promise.all(
        Array.from({ length: count }, () => sendEvent(token, randomItem(REGIONS)))
      )
      totalSent += count
      console.log(`  total sent so far: ${totalSent}`)
    }
  }

  await tick()

  const interval = setInterval(async () => {
    try {
      await tick()
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("expired")) {
        console.log("token expired, refreshing...")
        try {
          token = await getToken()
        } catch {
          console.error("failed to refresh token, stopping")
          clearInterval(interval)
        }
      } else {
        console.error(`tick error: ${err.message}`)
      }
    }
  }, 2000)

  process.on("SIGINT", () => {
    clearInterval(interval)
    console.log(`\nstopped. total events sent: ${totalSent}`)
    process.exit(0)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})