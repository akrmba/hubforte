# Hubforte App Integration Guide

Connect any external application to Hubforte using API key authentication and standard REST endpoints.

---

## App Registration

### Step 1 — Register your app in Hubforte

1. Log in to Hubforte as an Admin or above.
2. Navigate to **Admin → Connected Apps**.
3. Click **Register New App**.
4. Enter your app name, URL, webhook URL, and select the scopes your app needs.
5. Click **Register App**.

You will be shown your **API Key** and **Webhook Secret** once. Copy them immediately and store them securely — they cannot be retrieved again.

---

## API Key Authentication

All requests to `/api/v1/` must include the API key in the request header:

```
X-Hubforte-App-Key: yck_your_api_key_here
```

No session cookie or JWT is required. The API key identifies your app and its tenant.

### Example (curl)

```bash
curl https://your-hubforte-domain.com/api/v1/contacts?search=07700900000 \
  -H "X-Hubforte-App-Key: yck_your_api_key_here"
```

### Example (JavaScript / fetch)

```javascript
const response = await fetch('/api/v1/contacts?search=07700900000', {
  headers: {
    'X-Hubforte-App-Key': process.env.HUBFORTE_API_KEY,
  },
});
const { data } = await response.json();
```

---

## Standard Endpoints

All endpoints are under `/api/v1/` and require the `X-Hubforte-App-Key` header.

### Contacts

#### Search contacts
```
GET /api/v1/contacts?search=<query>&limit=20
```
Returns up to 20 contacts matching the search query (name, email, or phone).

**Required scope:** `contacts.read`

**Response:**
```json
{
  "data": [
    {
      "id": "ctr_abc123",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com",
      "phone": "07700900000",
      "status": "active",
      "organizationId": "org_xyz"
    }
  ],
  "count": 1
}
```

#### Get contact by ID
```
GET /api/v1/contacts/:id
```
**Required scope:** `contacts.read`

---

### Organizations

#### Get organization by ID
```
GET /api/v1/organizations/:id
```
**Required scope:** `organizations.read`

---

### Activities

#### Log an activity
```
POST /api/v1/activities
```
**Required scope:** `activities.write`

**Body:**
```json
{
  "contactId": "ctr_abc123",
  "type": "call",
  "subject": "Inbound call",
  "notes": "Discussed programme enrolment",
  "duration": 180
}
```

Supported `type` values: `call`, `email`, `meeting`, `note`, `task`, `other`

---

### Notes

#### Create a note
```
POST /api/v1/notes
```
**Required scope:** `notes.write`

**Body:**
```json
{
  "contactId": "ctr_abc123",
  "content": "Call transcript: ..."
}
```

You can use `organizationId` instead of `contactId` to attach the note to an organization.

---

### Deals

#### List deals
```
GET /api/v1/deals?limit=20
```
**Required scope:** `deals.read`

---

## Webhook Setup

When you register an app with a **Webhook URL**, Hubforte will POST events to that URL when things happen in the CRM.

### Verifying webhook signatures

Every webhook request includes an `X-Hubforte-Signature` header. Verify it using your **Webhook Secret**:

```javascript
const crypto = require('crypto');

function verifyWebhook(body, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return `sha256=${expected}` === signature;
}
```

### Webhook event payload

```json
{
  "event": "contact.created",
  "tenantId": "ten_abc",
  "timestamp": "2026-04-27T10:00:00Z",
  "data": {
    "id": "ctr_abc123",
    "firstName": "Jane",
    "lastName": "Smith"
  }
}
```

---

## Available Scopes

| Scope | Description |
|-------|-------------|
| `contacts.read` | Read contacts |
| `contacts.write` | Create and update contacts |
| `organizations.read` | Read organizations |
| `organizations.write` | Create and update organizations |
| `activities.read` | Read activities |
| `activities.write` | Log activities |
| `deals.read` | Read deals/funding opportunities |
| `deals.write` | Create and update deals |
| `notes.read` | Read notes |
| `notes.write` | Create notes |
| `lms.read` | Read LMS student data |

---

## Voice Agent Quick-Start

Connect a voice agent to Hubforte in 3 steps.

### Step 1 — Register your voice agent app

In Hubforte Admin → Connected Apps, register a new app with these scopes:
- `contacts.read`
- `activities.write`
- `notes.write`

### Step 2 — Look up the caller when a call starts

```javascript
// When a call comes in with caller ID +447700900000
const response = await fetch(
  `/api/v1/contacts?search=${encodeURIComponent(callerPhoneNumber)}&limit=5`,
  { headers: { 'X-Hubforte-App-Key': process.env.HUBFORTE_API_KEY } }
);
const { data: contacts } = await response.json();
const contact = contacts[0]; // best match
```

### Step 3 — Log the call when it ends

```javascript
// When the call ends
await fetch('/api/v1/activities', {
  method: 'POST',
  headers: {
    'X-Hubforte-App-Key': process.env.HUBFORTE_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    contactId: contact.id,
    type: 'call',
    subject: `Inbound call from ${callerPhoneNumber}`,
    notes: callTranscript,
    duration: callDurationSeconds,
  }),
});
```

That's it — the call is logged in CRM automatically.

---

## Attachment Tracker Example

Track when a shared document is opened.

```javascript
// When a tracked link is opened, log it as an activity
await fetch('/api/v1/activities', {
  method: 'POST',
  headers: {
    'X-Hubforte-App-Key': process.env.HUBFORTE_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    contactId: contactId,
    type: 'other',
    subject: `Document opened: ${documentName}`,
    notes: `Opened at ${new Date().toISOString()}. Time on page: ${timeOnPageSeconds}s`,
  }),
});
```

---

## Error Handling

All endpoints return standard HTTP status codes:

| Status | Meaning |
|--------|---------|
| `200` / `201` | Success |
| `400` | Bad request — check your request body |
| `401` | Missing or invalid API key |
| `403` | Scope not granted for this operation |
| `404` | Record not found |
| `500` | Server error — contact support |

Error responses always include a human-readable `error` field:

```json
{ "error": "Scope required: contacts.write" }
```

---

## Support

For integration support, contact your Hubforte administrator or refer to the error knowledge base at `/super-admin/knowledge-base`.
