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

The system uses a **RESTful API** approach for event ingestion, optimized for persistence and real-time distribution:

- **Source of Truth**: All ingested events are immediately stored in the **PostgreSQL** `events` table with an initial status of `open`. This ensures no data is lost even if the application layer restarts.
- **Relational Integrity**: Events are linked to specific `regions` (Asia, Europe, US), allowing for strict isolation and regional moderation policies.
- **Real-Time Dispatch**: As soon as an event is successfully persisted in the DB, the system broadcasts it via **WebSockets** to all moderators currently connected to that specific region's topic.
- **Payload Flexibility**: Events use a `JSONB` column to store heterogeneous event data (e.g., chat logs, image URIs, user metadata) without requiring schema migrations for new event types.

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

#### 2. Ingest Event
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

### 1. Hybrid Storage (Postgres + Redis)
- **Decision**: Use Postgres for persistent state and Redis for transient locks.
- **Rationale**: Postgres provides strict ACID compliance for the event lifecycle. Redis provides a high-performance, atomic way to handle short-lived "claims" (locks), preventing race conditions where multiple moderators handle the same event.

### 2. Distributed Locking with TTL
- **Decision**: Redis locks have a configurable TTL (e.g., 15 minutes).
- **Assumption**: If a moderator doesn't resolve an event within the TTL, it's assumed they are offline or stuck.

### 3. Automated Recovery (Keyspace Notifications)
- **Decision**: Use Redis `notify-keyspace-events` to listen for lock expirations.
- **Tradeoff**: This adds a dependency on Redis configuration (`Ex`), but enables the system to automatically revert "claimed" events back to "open" state instantly when a lock expires, ensuring no event remains orphaned.

### 4. Regional Isolation
- **Decision**: Moderators are strictly bound to a single region.
- **Tradeoff**: While this limits cross-region help, it simplifies compliance (data residency) and optimizes WebSocket broadcasting by only sending events to relevant staff.

### 5. Startup Rehydration
- **Decision**: On server start, a `rehydrate` service checks for "claimed" events in Postgres that don't have matching Redis locks and re-opens them.
- **Rationale**: Ensures system consistency if the server crashes or Redis state is lost.

---

## ● Loom Video
(Leave this as blank for now)