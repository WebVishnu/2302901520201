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


**Fixes:**

- Keep pagination on list (already in Stage 1 API)
- Indexes above for `user_id + created_at` and unread filter
- Archive or delete notifications older than 90 days (cron job moves to `notifications_archive` or hard delete)
- For mark-all-read, update in batches if needed
- Optional: cache unread count in Redis per user, refresh on write

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
