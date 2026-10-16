# NexoDesk backend

Node.js/Express REST API for NexoDesk using PostgreSQL through `pg`.

## Requirements

- Node.js 20 or newer
- A PostgreSQL database (Render PostgreSQL is supported)
- For non-Render databases that require TLS, set `DATABASE_SSL=true`.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to the database connection URL and set `ADMIN_PASSWORD`
   to the initial support user's password. Keep `.env` local; it is ignored by
   Git.
3. Install packages and initialize the schema:

   ```sh
   npm install
   npm run db:init
   ```

4. Start the API:

   ```sh
   npm start
   ```

The initializer creates the `users`, `tickets`, `tasks`, and `messages` tables
and indexes without dropping existing data. It creates the initial support
account when absent and reuses it when it already has the support role. If the
specified email exists with another role, initialization stops rather than
silently changing that account.

For local development with Render, use the external database URL. When the
backend is deployed on Render, set `DATABASE_URL` to the database's internal
connection URL in the service's environment variables.

## API

All successful resource responses use `{ "data": ... }`; errors use
`{ "error": "..." }`.

| Method | Endpoint | Access |
| --- | --- | --- |
| GET | `/health` | Public; checks PostgreSQL |
| POST | `/api/auth/register` | Public; always creates a `client` |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Authenticated |
| GET, POST | `/api/tickets` | Authenticated |
| GET, PATCH | `/api/tickets/:id` | Authenticated; ticket changes are support-only |
| GET, POST | `/api/tickets/:id/messages` | Authenticated ticket participants |
| GET | `/api/tickets/:id/tasks` | Authenticated ticket participants |
| POST | `/api/tickets/:id/tasks` | Support |
| PATCH | `/api/tasks/:id` | Support |

Send protected requests with `Authorization: Bearer <token>`. Clients can only
access their own tickets and their associated messages and tasks. Support can
access all tickets. Ticket listing supports `status`, `priority`, and `search`
query parameters.

## Professor chat project inspection and migration

The supplied `chat-api 1.zip` was inspected as-is. It contains exactly three
files: `package.json`, `server.js`, and `index.html`; it has no separate model
or route files.

The original app uses Express 4, Mongoose 9, and CORS. `server.js` defines
inline Mongoose models: `Usuario` has a unique `username` and a plaintext
`password`; `Mensaje` has `de`, nullable `para`, `mensaje`, and `fecha`.
MongoDB is connected directly from that server file. Its endpoints are:

| Original endpoint | Behavior |
| --- | --- |
| `POST /registro` | Accepts `{ username, password }`, stores the password as supplied, and returns `{ ok: true }`; errors return status 500 and `{ error: "Usuario ya existe" }`. |
| `POST /login` | Accepts `{ username, password }`, matches both fields in MongoDB, then returns `{ ok: true, username }`; invalid credentials return 401. No session or token is created. |
| `GET /usuarios` | Returns usernames only. |
| `GET /mensajes/:usuario` | Returns messages addressed to the username, sent by it, or global (`para: null`), sorted by `fecha` ascending. |
| `POST /mensaje` | Accepts `{ de, para, mensaje }`; a missing/falsy recipient means global, and the saved document is returned. |

The HTML page supplies the login/register form, a global-chat item, a username
sidebar for private chats, and the message view. It fetches messages for the
current username and filters them client-side to show either global messages
or the selected two-user conversation. It refreshes the view every second.
Requests trust client-supplied usernames and sender identities; the original
chat therefore does not authenticate or authorize message access. Its direct
HTML `innerHTML` rendering also does not escape message content.

Migration mapping:

| Original feature | NexoDesk adaptation |
| --- | --- |
| User registration | `POST /api/auth/register`, stores bcrypt password hashes and always assigns `client`. |
| Login | `POST /api/auth/login`, verifies bcrypt and returns a JWT; `GET /api/auth/me` resolves the current user. |
| Private conversation | Messages are scoped to `ticket_id`; access is checked against ticket ownership or the support role. |
| Message sender (`de`) | Derived from the authenticated user, never accepted from the request body. |
| Message recipient (`para`) | Replaced by the ticket context, with the ticket owner and support user as participants. |
| Message history and send | `GET` and `POST /api/tickets/:id/messages`, ordered oldest-first; HTTP polling/refresh is suitable for the later frontend. |
| Global chat | Excluded: messages belong to a customer-support ticket, so no global conversation is modeled. |
| Original HTML chat UI | Not migrated; this phase provides backend endpoints only. |
