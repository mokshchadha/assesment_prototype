# Assessment Prototype: Moderation System

A real-time moderation system prototype designed for high-concurrency event handling across multiple regions, built with **Bun**, **Elysia**, **PostgreSQL**, and **Redis**.

## ● Setup Instructions

### Prerequisites
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) - for docker compose

- If you want to run tests then you will need Bun(for unit and integration) as well as k6 (load testing)

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
   docker-compose up
   ```
   note sometimes u might see "Container assesment_prototype-backend-1 Error dependency backend failed to start" - ignore it

4. **Run Tests:** 

unit testing
   ```bash
   bun test
   ```
load testing
   ```
    k6 run tests/load_tests/k6-test.js 
   ```

---

## ● Event Ingestions Approach


I have created a seed-events.ts (this is a part of docker compose) - this send events to the server for ingestion at a rate of 0-10 events/sec randomly.

and the /events route to ingest all the events that come in and they are directly stored in Postgres. we publish event to UI so that moderators can see latest events with out refreshing the page.
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

From highlevel the design looks something like the diagram below.
<img src = "https://i.ibb.co/jZTn04z3/Screenshot-2026-04-18-at-6-12-01-PM.png" alt="high_level_design">


**Assumptions**
My main assumption is to give a smooth UX for moderators hence claim and acknowledge of events are routed via sockets and not routes for the real time experience.

I have created the server to handle a load of 2911 req/sec and handle upto 1000-1500 virtual users interacting with my system via websockets.(handling close to 13 million messages per min)

Above stats are provided on the basis of load testing done inside docker on a Mac. We can safely assume the numbers to be on higher side on linux because of epoll and less syscall overheads. Even inside docker this will be faster on linux than macos.

**Tradeoffs**

1. Having websockets make the app stateful and can add sticky session maintaince over head if needed to spin multiple instances. (redis can help here but it is still a maintaince overhead later.)

2. As the scale of data grows it would make sense to store Acknowledge events in a seperate table (around 100 million+ records)

3. As of now the events on the UI are sent via the events route - this can lead to bloat as the number of events per region increases during my load testing when the open moderation events reach 50K+ slowness on UI becomes visible, a better approach would be to have hybrid websocket + rest api approch with paginated events or archieve too old events based on buisness use case.

4. For now the events of all status are kept in 1 table acknowledged events can be moved to a seperate table, if acknowledged table need not be refreshed real time we can use background job like bun.cron to clean up.

** DB SCHEMA ** 
<img src="https://i.ibb.co/Lh8jcRTs/Screenshot-2026-04-18-at-3-34-06-PM.png" alt="dbschema">
 

---

## ● Loom Video
