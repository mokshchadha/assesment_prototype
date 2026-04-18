# Assessment Prototype: Moderation System

A real-time moderation system prototype designed for high-concurrency event handling across multiple regions, built with **Bun**, **Elysia**, **PostgreSQL**, and **Redis**.

## ● Setup Instructions

### Prerequisites
- [Bun](https://bun.sh/) (v1.0.0 or higher) - this is used for bun test 
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) - for docker compose

### Steps
1. **Environment Configuration:**
   Create a `.env` file in the root directory:
   ```env
   LOCK_TTL_SECONDS=900
   DATABASE_URL="postgres://moduser:modpass@localhost:5433/moderation"
   JWT_SECRET="your-secret-key"
   ```

3. **Start Infrastructure:**
   Use Docker Compose to spin up PostgreSQL and Redis:
   ```bash
   docker-compose up -d
   ```

4. **Run Tests:**
   ```bash
   bun test
   ```

---

## ● Event Ingestions Approach

we use /events route to ingest all the events that come in and they are directly stored in Postgres. we publish event to UI so that moderators can see latest events with out refreshing the page.
Db diagram - https://dbdiagram.io/d/Sprinto-69c54752fb2db18e3b11b1e2
---

## ● API Documentation

### REST Endpoints

#### 1. Moderator Login
Authenticates a moderator and returns a JWT for WebSocket connection.
- **Endpoint**: `POST /auth/login`
- **Body**:
  ```json
  { "name": "moderator_name", "region": "Asia" }
  ```
- **Example**:
  ```bash
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"name": "Moksh", "region": "Asia"}'
  ```

#### 2. Fetch Dashboard Events
Fetches the initial events for the moderator's dashboard, including open events for their region and their claimed/resolved events.
- **Endpoint**: `GET /events`
- **Headers**:
  ```
  Authorization: Bearer <JWT_TOKEN>
  ```
- **Example**:
  ```bash
  curl -X GET http://localhost:3000/events \
    -H "Authorization: Bearer <your-jwt-token>"
  ```

#### 3. Ingest Event
Ingests a new moderation event into the system.
- **Endpoint**: `POST /events`
- **Body**:
  ```json
  { "region": "Asia", "payload": { "type": "chat", "message": "hello" } }
  ```
- **Example**:
  ```bash
  curl -X POST http://localhost:3000/events \
    -H "Content-Type: application/json" \
    -d '{"region": "Asia", "payload": {"text": "Inappropriate content detected"}}'
  ```

### WebSocket API
Connect to `ws://localhost:3000/ws?token=<JWT_TOKEN>`.

**Client Messages:**
- `claim`: `{"type": "claim", "eventId": "uuid"}` - Attempts to lock an event.
- `acknowledge`: `{"type": "acknowledge", "eventId": "uuid"}` - Resolves the event and releases the lock.

---

## ● Design Decisions, Assumptions, or Tradeoffs



---

## ● Loom Video
