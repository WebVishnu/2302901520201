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

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique notification ID |
| `type` | string | Machine-readable category |
| `title` | string | Short headline |
| `body` | string | Message text |
| `data` | object | Optional payload for routing/actions |
| `read` | boolean | Read state |
| `createdAt` | string (ISO 8601) | Created timestamp |

---

## REST endpoints

### 1. List notifications

`GET /notifications`

**Query parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Items per page (max 50) |
| `unreadOnly` | boolean | `false` | If `true`, only unread |

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

| Header | Value |
|--------|--------|
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
