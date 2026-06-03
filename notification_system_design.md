# Stage 1

## Core actions

1. List notifications (paginated, optional unread filter)
2. Get unread count
3. Get notification by ID
4. Mark one notification as read
5. Mark all notifications as read
6. Delete a notification
7. Receive new notifications in real time (WebSocket)

---

## Notification object schema

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "order_shipped",
  "title": "Your order has shipped",
  "body": "Order #12345 is on the way.",
  "data": {
    "orderId": "12345",
    "deepLink": "/orders/12345"
  },
  "read": false,
  "createdAt": "2026-06-03T10:15:00.000Z"
}
```


| Field       | Type              | Description                          |
| ----------- | ----------------- | ------------------------------------ |
| `id`        | string (UUID)     | Unique notification ID               |
| `type`      | string            | Machine-readable category            |
| `title`     | string            | Short headline                       |
| `body`      | string            | Message text                         |
| `data`      | object            | Optional payload for routing/actions |
| `read`      | boolean           | Read state                           |
| `createdAt` | string (ISO 8601) | Created timestamp                    |


---

## REST endpoints

### 1. List notifications

`GET /notifications`

**Query parameters:**


| Name         | Type    | Default | Description             |
| ------------ | ------- | ------- | ----------------------- |
| `page`       | integer | `1`     | Page number             |
| `limit`      | integer | `20`    | Items per page (max 50) |
| `unreadOnly` | boolean | `false` | If `true`, only unread  |


**Response `200`:**

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "order_shipped",
      "title": "Your order has shipped",
      "body": "Order #12345 is on the way.",
      "data": { "orderId": "12345" },
      "read": false,
      "createdAt": "2026-06-03T10:15:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

### 2. Unread count

`GET /notifications/unread-count`

**Response `200`:**

```json
{
  "count": 5
}
```

---

### 3. Get notification by ID

`GET /notifications/{notificationId}`

**Response `200`:** single notification object (schema above)

**Response `404`:**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Notification not found"
  }
}
```

---

### 4. Mark one as read

`PATCH /notifications/{notificationId}/read`

**Request body:** none (or empty `{}`)

**Response `200`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "read": true,
  "readAt": "2026-06-03T11:00:00.000Z"
}
```

---

### 5. Mark all as read

`PATCH /notifications/read-all`

**Request body:** none

**Response `200`:**

```json
{
  "updatedCount": 12
}
```

---

### 6. Delete notification

`DELETE /notifications/{notificationId}`

**Response `204`:** no body

**Response `404`:** error object (see Overview)

---

## Real-time notifications

### Mechanism: WebSocket

Persistent connection after login so the server can push new notifications without the client polling.

**Endpoint:** `wss://api.example.com/v1/notifications/ws`

**Connection headers:**


| Header          | Value                   |
| --------------- | ----------------------- |
| `Authorization` | `Bearer <access_token>` |


**Server → client event (new notification):**

```json
{
  "event": "notification.created",
  "payload": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "type": "message_received",
    "title": "New message",
    "body": "You have a new message from Alex.",
    "data": { "conversationId": "abc" },
    "read": false,
    "createdAt": "2026-06-03T10:20:00.000Z"
  }
}
```

**Server → client event (unread count update, optional):**

```json
{
  "event": "notification.unread_count",
  "payload": {
    "count": 6
  }
}
```

**Client → server (optional heartbeat):**

```json
{
  "action": "ping"
}
```

**Server response:**

```json
{
  "action": "pong"
}
```

**Frontend flow:**

1. User logs in → obtain access token.
2. Open WebSocket with `Authorization`.
3. On `notification.created`, prepend to list and bump unread count.
4. On disconnect, reconnect with backoff; use `GET /notifications` to reconcile missed items.

**Fallback:** if WebSocket is unavailable, poll `GET /notifications/unread-count` and `GET /notifications?unreadOnly=true` on an interval (e.g. 30s).

---

## Naming conventions

- Resource collection: `/notifications`
- Sub-resources: `/notifications/{notificationId}/read`
- Collection actions: `/notifications/read-all`, `/notifications/unread-count`
- Plural nouns in paths, camelCase in JSON
- Version prefix: `/v1`

---

# Stage 2

## Database choice

**PostgreSQL**

Notifications are tied to a user, filtered by read state, sorted by date, and updated often (mark read, delete). That fits a relational table with indexes. PostgreSQL also gives `JSONB` for the optional `data` field from Stage 1, and transactions help when marking many rows read at once.

MongoDB would work too, but for this API we mostly need simple filters and counts. SQL is enough and easier to keep consistent.

---

## Schema

```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  type        VARCHAR(100) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id, read)
  WHERE read = FALSE;
```

`user_id` comes from the logged-in user (JWT). Every query scopes by `user_id` so users only see their own notifications.

---

## Problems as data grows


| Problem           | What happens                                     |
| ----------------- | ------------------------------------------------ |
| Table gets huge   | List and count queries slow down                 |
| Hot users         | One user with millions of rows slows their inbox |
| Mark all read     | Large `UPDATE` locks many rows                   |
| Old notifications | Storage cost keeps rising                        |


---

## Queries (mapped to Stage 1 APIs)

`$1` = `user_id` from auth. `$2`, `$3` etc. are route/query params.

### GET /notifications

```sql
SELECT id, type, title, body, data, read, created_at
FROM notifications
WHERE user_id = $1
  AND ($2::boolean IS FALSE OR read = FALSE)
ORDER BY created_at DESC
LIMIT $3 OFFSET ($4 - 1) * $3;
```

```sql
SELECT COUNT(*)::int AS total
FROM notifications
WHERE user_id = $1
  AND ($2::boolean IS FALSE OR read = FALSE);
```

`$2` = unreadOnly, `$3` = limit, `$4` = page.

---

### GET /notifications/unread-count

```sql
SELECT COUNT(*)::int AS count
FROM notifications
WHERE user_id = $1 AND read = FALSE;
```

---

### GET /notifications/{notificationId}

```sql
SELECT id, type, title, body, data, read, created_at
FROM notifications
WHERE id = $1 AND user_id = $2;
```

---

### PATCH /notifications/{notificationId}/read

```sql
UPDATE notifications
SET read = TRUE, read_at = NOW()
WHERE id = $1 AND user_id = $2 AND read = FALSE
RETURNING id, read, read_at;
```

---

### PATCH /notifications/read-all

```sql
UPDATE notifications
SET read = TRUE, read_at = NOW()
WHERE user_id = $1 AND read = FALSE;
```

Return `updatedCount` from the driver (`rowCount` / `affected rows`).

---

### DELETE /notifications/{notificationId}

```sql
DELETE FROM notifications
WHERE id = $1 AND user_id = $2;
```

---

### WebSocket (insert on new notification)

```sql
INSERT INTO notifications (user_id, type, title, body, data)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, type, title, body, data, read, created_at;
```

Push the returned row to the client over WebSocket, then run the unread count query if you send `notification.unread_count`.

---

# Stage 3

## Is the query accurate?

Yes, for "give me every unread row for this student, oldest first." The filters are correct.

What's off for a real API:

- `SELECT *` pulls columns you may not need (bigger reads, more memory).
- No `LIMIT` / pagination. A student with thousands of unread rows returns all of them in one shot.
- `ORDER BY createdAt ASC` is valid but most inboxes show newest first (`DESC`). Only wrong if product wants oldest on top.

---

## Why is it slow?

You have ~5M rows across 50k students. Without a good index, the database scans a huge slice of the table to find `studentID = 1042 AND isRead = false`, then sorts the matches.

Even with an index on `studentID` only, you still filter `isRead` and sort by `createdAt` as extra work. `SELECT *` makes each matched row heavier.

One active student with many unread rows makes the sort step costly.

---

## What I would change

**Query:**

```sql
SELECT id, notificationType, title, body, createdAt
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC
LIMIT 20 OFFSET 0;
```

**Index (partial, matches the filter):**

```sql
CREATE INDEX idx_notifications_student_unread_created
ON notifications (studentID, createdAt DESC)
WHERE isRead = false;
```

**Likely cost after fix:**

- Before: often O(n) table or large index scan on millions of rows, plus sort on many rows.
- After: O(log n) index seek on `studentID` within the partial index, then read only unread rows for that student, sort a smaller set (or avoid big sort if the index order matches). With `LIMIT 20`, work is roughly O(log n + 20).

---

## Index on every column?

No. Bad default advice.

- Writes get slower (every insert/update touches many indexes).
- Disk and memory go up for little gain.
- The planner can pick a worse index when many overlap.

Index columns (or small combinations) that match real `WHERE`, `JOIN`, and `ORDER BY` patterns. Here: `studentID`, `isRead`, `createdAt`, and sometimes `notificationType` for reporting queries.

---

## Students with a Placement notification in the last 7 days

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL '7 days';
```

If this runs often, add:

```sql
CREATE INDEX idx_notifications_type_created
ON notifications (notificationType, createdAt DESC);
```

---

# Stage 4

## What I would do ?

### 1. Stop loading notifications on every page

Only fetch when the user opens the bell dropdown or the notifications page. Other pages show just the unread badge if needed.

**Tradeoff:** Less DB load and faster pages. Badge count still needs one light call unless you cache it (see below).

---

### 2. Cache per student (Redis)

Store unread count and the latest N notifications (e.g. 20) keyed by `studentID`. On read, serve from cache. On new notification / mark read / delete, update or invalidate cache.

**Tradeoff:** Big drop in DB reads. You add Redis ops and must handle stale data if invalidation is wrong. Short TTL (30-60s) reduces risk.

---

### 3. Use WebSocket (already in Stage 1) instead of re-fetching

After login, connect once. New notifications push to the client. Update local state. Do not re-query the DB on each route change.

**Tradeoff:** Live updates without polling. More moving parts (connection drops, reconnect, auth on WS). Still need a one-time or occasional REST fetch to sync after offline.

---

### 4. Client-side cache (React Query / SWR)

Cache API responses in the browser for a few minutes. `staleTime` so navigating between pages does not refetch.

**Tradeoff:** Free reduction in duplicate calls. User on another device or tab may see old data until refresh or WS event.

---

# Stage 5

## Shortcomings of the original approach

- **Sequential loop:** 50,000 students one by one. HR waits forever. One slow email blocks everyone behind it.
- **No idempotency:** Click "Notify All" twice and students get duplicates.
- **All or nothing mindset:** If `send_email` fails at student 25,001, you have no clear record of who succeeded. In-app and DB may be ahead of email or behind.
- **Tight coupling:** Email, DB, and push in one loop. One channel failing does not mean you should skip or roll back the others blindly, but the code gives you no per-student status.
- **No retries:** Transient SMTP errors lose those students unless someone runs it again manually.
- **Single process:** No queue, no workers, no rate limit. Email provider may throttle or ban you.

---

## send_email failed for 200 students midway. What now?

With the original code you cannot tell easily:

- Which 200 failed (unless you logged each `student_id`).
- Whether DB save and push already ran for those 200

---

## Should DB save and email happen together?

**No, not in one synchronous step.**

They are different systems with different failure modes. Tie them in one function and a slow or down email API blocks DB writes for everyone, or a DB outage blocks email for everyone.

**Better pattern:**

1. Record the campaign and enqueue one job per student (or per batch).
2. Workers handle email, DB insert, and push as separate steps with retries.
3. Student still gets in-app notification even if email is delayed. Email can retry without re-inserting the row if you use idempotency keys.

---

## Revised pseudocode

```
function notify_all(student_ids, message, campaign_id):
    create_campaign(campaign_id, message, total = len(student_ids))

    for batch in chunk(student_ids, size=500):
        enqueue_jobs(campaign_id, batch, message)

    return { campaign_id, status: "queued" }


worker_process(job):
    if job_already_done(job.idempotency_key):
        return

    # in-app first: user sees it even if email lags
    save_to_db(job.student_id, job.message, job.campaign_id)
    mark(job, "db_saved")

    push_to_app(job.student_id, job.message)
    mark(job, "pushed")

    try:
        send_email(job.student_id, job.message)
        mark(job, "email_sent")
    catch error:
        mark(job, "email_failed", error)
        schedule_retry(job, backoff)   # max 3 attempts
        if retries_exhausted(job):
            move_to_dead_letter(job)
            alert_ops(job.student_id)

    mark_campaign_progress(job.campaign_id)


function retry_failed_emails(campaign_id):
    for job in get_jobs(campaign_id, status="email_failed", retries_left):
        worker_process(job)   # skips db/push if already done via idempotency_key
```

**Flow in plain terms:**

1. HR clicks Notify All. Server creates a campaign and pushes 100 batch jobs (500 students each) to a queue. HR gets `queued` immediately.
2. Many workers run in parallel (respect email rate limits).
3. Each student: DB + push first, then email with retry.
4. 200 email failures: stay marked `email_failed`, retry worker or `retry_failed_emails` without touching students who already have in-app.
5. Admin dashboard reads campaign status from job table.

---

# Stage 6

## Code

`priority_inbox/priority_inbox.mjs`

- Fetches from `GET /evaluation-service/notifications`
- Inserts each notification into a size-10 min-heap
- Prints the top 10 sorted for display

Run:

```bash
set EVALUATION_SERVICE_TOKEN=your_token
node priority_inbox/priority_inbox.mjs
```

Screenshots go in `priority_inbox/screenshots/`.

---

## Keeping top N efficient as new items arrive

Do not re-sort the full list on every new notification.

Use a **min-heap of size N**:

- Heap stores the current top N by score.
- The root is the weakest among those N.
- New notification: if its score beats the root, replace the root (`heapreplace`).
- Cost per insert: O(log N). For N=10 that is effectively constant.

On each WebSocket `notification.created`, call `inbox.add(row)` and refresh the UI from `inbox.top()`.

