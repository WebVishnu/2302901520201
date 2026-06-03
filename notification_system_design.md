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