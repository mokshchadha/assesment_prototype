# Assessment Prototype: Moderation System

A high-performance real-time moderation system prototype built with **Bun**, **Elysia**, **PostgreSQL**, and **Redis**.

## High-Level Architecture

The system is designed for high-concurrency event moderation across multiple regions:

- **Bun & Elysia**: Provides a fast JavaScript runtime and a type-safe web framework.
- **PostgreSQL**: Serving as the source of truth for all persistent data including regions, moderator accounts, and the event lifecycle.
- **Redis (Locks)**: Implements distributed locking for events. When a moderator claims an event, a Redis lock is acquired with a specific TTL (e.g., 900s) to prevent race conditions and ensure only one moderator handles an event at a time.
- **Redis (Keyspace Notifications)**: Monitors lock expirations (`Ex`). If a lock expires before an event is resolved, the system automatically reopens the event in the database for other moderators.

---

## Route & Event Behavior

The system utilizes a hybrid approach of REST for management and WebSockets for real-time operations.

### REST API Routes
- **`POST /auth/login`**: Authenticates moderators by `name` and `region`. Returns a JWT used for WebSocket authentication.
- **`POST /events`**: A system-level endpoint for ingesting new events into the system. Automatically publishes new events to connected WebSocket clients in the relevant region.

### WebSocket Events
Connection requires authentication via JWT passed as a query parameter. Once connected, clients are subscribed to region-specific topics.

**Client -> Server Messages:**
- `claim`: Attempts to lock a specific `eventId` for the moderator.
- `acknowledge`: Resolves the event and releases the associate Redis lock.

**Server -> Client Messages:**
- `available_events`: Sent on connection; provides the current state of open, claimed, and resolved events for the moderator.
- `claim_success` / `claim_failed`: Response to a claim attempt.
- `ack_success` / `ack_failed`: Response to an acknowledgment attempt.

---

## Database Schema

The PostgreSQL schema is optimized for regional segmentation and event tracking:

### `regions`
- `id`: Primary Key (e.g., `Asia`, `Europe`, `US`).

### `moderators`
- `id`: Primary Key.
- `name`: Unique username.
- `region_id`: Foreign Key referencing `regions`.

### `events`
- `id`: UUID Primary Key.
- `region_id`: Foreign Key referencing `regions`.
- `payload`: JSONB storage for flexible event data.
- `status`: Enum (`open`, `claimed`, `resolved`, `expired`).
- `claimed_by`: Foreign Key referencing `moderators`.
- `claimed_at`, `resolved_at`, `expired_at`: Metadata timestamps.

---

## Unit Testing

The project uses Bun's built-in test runner for high-speed verification:

- **DB Tests**: Located in `tests/postgres.test.ts`, these verify the event lifecycle, regional filtering, and moderator isolation.
- **Locking Tests**: Located in `tests/redis.test.ts`, these focus on the distributed locking mechanism, TTL behavior, and keyspace notification triggers.
- **Services Tests**: Located in `tests/services.test.ts`, these verify the business logic of the application.

### Running Tests
Ensure your environment variables are configured in `.env`, then run:
```bash
# Run all tests
bun test

# Run a specific test file
bun test tests/redis.test.ts
```