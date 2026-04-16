const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production"

const encoder = new TextEncoder()

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function base64urlDecode(str: string): string {
  return atob(str.replace(/-/g, "+").replace(/_/g, "/"))
}

export interface JwtPayload {
  sub: string
  name: string
  region: string
  moderatorId: string
  iat: number
  exp: number
}

const TOKEN_TTL_SECONDS = 60 * 60 * 8

export async function signJwt(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const full: JwtPayload = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS }

  const header = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })))
  const body = base64url(encoder.encode(JSON.stringify(full)))
  const unsigned = `${header}.${body}`

  const key = await importKey(SECRET)
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(unsigned))

  return `${unsigned}.${base64url(sig)}`
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null

    const [header, body, sig] = parts
    const unsigned = `${header}.${body}`

    const key = await importKey(SECRET)
    const sigBytes = Uint8Array.from(base64urlDecode(sig), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(unsigned))
    if (!valid) return null

    const payload: JwtPayload = JSON.parse(base64urlDecode(body))
    if (payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload
  } catch {
    return null
  }
}

export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null
  return authHeader.slice(7)
}