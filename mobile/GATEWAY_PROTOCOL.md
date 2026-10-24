# Hermes gateway protocol for a mobile client

This is the part of the Hermes dashboard API a phone app needs to sign in, list chats, send messages, show streamed replies, and answer approvals and questions.

It describes Hermes **v0.22.4** (upstream commit `4d04303818`), the version in [`desktop-web/UPSTREAM_VERSION`](../desktop-web/UPSTREAM_VERSION).
It was checked against the desktop app's source in this repo and the Hermes Python source at that commit.
Where a fact comes from one file, the file is named so it can be checked again after an update.

## Contents

1. [Which protocol this is](#1-which-protocol-this-is)
2. [Server setup the app depends on](#2-server-setup-the-app-depends-on)
3. [Signing in](#3-signing-in)
4. [REST calls](#4-rest-calls)
5. [The WebSocket](#5-the-websocket)
6. [Sessions](#6-sessions)
7. [Sending a message](#7-sending-a-message)
8. [Streamed events](#8-streamed-events)
9. [Approvals and questions](#9-approvals-and-questions)
10. [Disconnects and reconnecting](#10-disconnects-and-reconnecting)
11. [Notifications when the app is closed](#11-notifications-when-the-app-is-closed)
12. [Keeping up with Hermes updates](#12-keeping-up-with-hermes-updates)
13. [Not covered here](#13-not-covered-here)

## 1. Which protocol this is

The dashboard serves JSON-RPC 2.0 over a WebSocket at `/api/ws`, plus a REST API under `/api`.

The WebSocket has two method sets:

- **The standard set.** This is what the web UI in this repo uses, and what this document describes.
- **The canonical set** (`hermes-gateway-v1`). The Electron desktop app uses it only on its private connection to a gateway on the same machine. That connection is marked with a `native_dial` URL parameter and a ticket that only a local process can get. A remote client can't use it. See `apps/desktop/src/api/client.ts` (`this.canonical = ...has('native_dial')`).

Every method, parameter, result and event payload is defined by Python models in Hermes (`tui_gateway/contracts/`).
Two files are generated from them and checked into this repo:

- [`apps/shared/src/gateway-contract.openrpc.json`](../apps/shared/src/gateway-contract.openrpc.json): OpenRPC 1.3. The `methods` list is the standard set, `x-server-requests` lists requests the server sends to the client, and `x-notifications` lists events. `x-canonical-methods` is the canonical set, which you can ignore.
- [`apps/shared/src/gateway-contract.generated.ts`](../apps/shared/src/gateway-contract.generated.ts): the same thing as TypeScript types.

The mobile app imports the TypeScript types from `@hermes/shared` directly (see `docs/adr/0001-react-native-for-the-mobile-app.md`).
The tables below give the fields that matter for a first version; the contract files have the rest.

**Parameters are strict.** The server rejects any parameter it doesn't know with error code `4000` (`tui_gateway/contracts/base.py`). Send only the fields listed for a method. Results and event payloads can gain new fields at any time, so ignore fields you don't know.

## 2. Server setup the app depends on

The README covers this for the web UI. The same settings apply to the app:

- **Login turned on.** Password or OAuth. With login on, the dashboard is "gated" and every non-public route needs a session.
- **`dashboard.public_url` set.** The dashboard only accepts requests whose `Host` header matches that host (and the WebSocket also checks `Origin` if one is sent). The app must use exactly that address. If you reach the server over Tailscale or a LAN address that isn't the public URL, requests are refused.
- **Same Hermes version.** Method shapes change between releases (see [section 12](#12-keeping-up-with-hermes-updates)).

`GET /api/status` is public. It returns `version`, `auth_required` and `auth_providers`. Use it to check the address and the server version before showing a login screen.

## 3. Signing in

`GET /api/auth/providers` (public) lists the sign-in options:

```json
{ "providers": [ { "name": "basic", "display_name": "Password", "supports_password": true } ] }
```

A server with no providers answers `503`.

There are two ways for an app to sign in. Start with option A if the server uses a password.

### Option A: password login with cookies

This is the simplest path. It only works for providers with `supports_password: true`.

```http
POST /auth/password-login
Content-Type: application/json

{ "provider": "basic", "username": "you", "password": "..." }
```

Success is `200 {"ok": true, "next": "/"}` and sets these cookies:

| Cookie | What it holds |
| --- | --- |
| `hermes_session_at` | Access token. Its max age matches the token's lifetime. |
| `hermes_session_rt` | Refresh token. Lasts 30 days. |
| `hermes_session_provider` | Which provider signed you in. |

Over HTTPS the names may carry a `__Host-` or `__Secure-` prefix (`hermes_cli/dashboard_auth/cookies.py`). Store and send them as-is.

Errors: `401` wrong username or password, `404` unknown provider, `429` too many attempts, `503` the password store couldn't be reached.

Keep the cookies in a persistent cookie jar and send them on every REST call.
**The server refreshes the session for you.** When the access token has expired and the refresh token is still good, the server serves the request and sets new cookies on the response (`hermes_cli/dashboard_auth/middleware.py`). Save the new cookies.
When the refresh token is also dead, REST calls answer `401`. Show the login screen again.

`GET /api/auth/me` returns the signed-in user, or `401`. Use it to check a saved session at app start.

`POST /auth/logout` clears the cookies and revokes the refresh token.

### Option B: native app login with bearer tokens (OAuth or password)

The Electron app uses this flow, and it is the only way to sign in with OAuth from an app. It follows RFC 8252 (OAuth for native apps) with PKCE. The routes are in `hermes_cli/dashboard_auth/routes.py`.

1. Make a PKCE verifier and its S256 challenge, and a random `state`.
2. Open the system browser (Custom Tabs on Android, `ASWebAuthenticationSession` on iOS) at:
   ```
   GET /auth/native/authorize?code_challenge=<cc>&code_challenge_method=S256&redirect_uri=<uri>&state=<state>[&provider=<name>]
   ```
   With one provider, `provider` can be left out. With several, the server shows a chooser page.
3. The user signs in in the browser. Password providers get the normal `/login` form.
4. The server redirects to `redirect_uri?code=<code>&state=<state>`.
5. Exchange the code within 2 minutes:
   ```http
   POST /auth/native/token
   Content-Type: application/json

   { "code": "<code>", "code_verifier": "<verifier>" }
   ```
   The answer is `{"access_token", "refresh_token", "token_type": "Bearer", "expires_at", "provider", "user_id"}`. No cookies are set.
6. Send `Authorization: Bearer <access_token>` on every REST call.
7. When a call answers `401`, refresh:
   ```http
   POST /auth/native/refresh
   Content-Type: application/json

   { "refresh_token": "<rt>", "provider": "<provider>" }
   ```
   This returns the same shape as step 5 with new tokens. A `401` with `{"error": "session_expired"}` means sign in again. A `503` means the provider couldn't be reached; keep the tokens and try later.

**The catch for phones:** `redirect_uri` must be `http://127.0.0.1:<port>/...` or `http://[::1]:<port>/...`. Custom URL schemes and `localhost` are refused. So the app has to run a small HTTP listener on the loopback address while the browser sign-in is open. That works on Android and iOS while the app stays in the foreground, but `ASWebAuthenticationSession` won't close itself on an `http` redirect. The app has to close it once its listener receives the code. This flow hasn't been tried on a phone.

### Without login

A dashboard with login turned off only accepts connections from the same machine, using a token it puts into its own web page. It isn't usable from a phone. Turn login on.

## 4. REST calls

- Base URL: the dashboard's public URL.
- Auth: the cookies from option A, or `Authorization: Bearer` from option B.
- JSON in and out. Errors are a non-2xx status with a text or JSON body.
- **Profiles.** Hermes can serve several profiles from one server. Most REST routes take `?profile=<name>`. With no profile the server uses its default. A first version can ignore profiles.

The REST routes a first version is likely to use:

| Route | What it does |
| --- | --- |
| `GET /api/status` | Server version and auth settings (public). |
| `GET /api/auth/me` | The signed-in user, or `401`. |
| `GET /api/sessions?limit=40&offset=0&min_messages=0&archived=exclude&order=recent` | Saved sessions, newest first. |
| `GET /api/sessions/{stored_id}/messages` | A saved session's transcript, in pages. See `getLatestSessionMessages` and `getOlderSessionMessages` in `apps/desktop/src/api/sessions.ts` for the paging parameters. |
| `GET /api/sessions/search?q=...` | Search sessions. |

The WebSocket can also list sessions and return transcripts (see [section 6](#6-sessions)), so REST is optional for these.

## 5. The WebSocket

### Opening it

The socket needs its own credential, separate from the REST login.

**With cookies (option A):** get a one-time ticket, then connect with it.

```http
POST /api/auth/ws-ticket
```

The answer is `{"ticket": "...", "ttl_seconds": 30}`. A ticket works once and expires after 30 seconds, so get a new one for every connection and every reconnect.

```
wss://<host>/api/ws?ticket=<ticket>
```

The server also accepts the ticket as a WebSocket subprotocol instead of a URL parameter: offer both `hermes-gateway-v1` and `hermes-gateway-ticket.<ticket>`. This keeps the ticket out of URLs and logs.

**With bearer tokens (option B):** skip the ticket and put the access token in the URL:

```
wss://<host>/api/ws?token=<access_token>
```

The server checks the token the same way it checks the REST bearer header (`hermes_cli/web_server_chat.py`, `_ws_auth_reason`).

Close codes before or right after the upgrade:

| Code | Meaning |
| --- | --- |
| `4401` | Bad or missing credential. Get a new ticket, or refresh the token. |
| `4403` | Chat is turned off on the server, or the `Host`/`Origin` header doesn't match `public_url`. |
| `1013` | The gateway is starting up, restarting or shutting down. Retry with backoff. |
| `1011` | The server failed to load the dashboard. |

### Frames

Every frame is one JSON object in a text message. There are four kinds.

**1. Your request, and the server's response.** Use a unique `id` for each request.

```json
{ "jsonrpc": "2.0", "id": "r1", "method": "session.list", "params": { "limit": 40 } }
{ "jsonrpc": "2.0", "id": "r1", "result": { "sessions": [ ... ] } }
{ "jsonrpc": "2.0", "id": "r1", "error": { "code": -32601, "message": "..." } }
```

Error codes you'll see: `-32700` the frame wasn't valid JSON, `-32601` unknown method, `-32603` the server crashed handling it, `4000` a parameter the server doesn't accept. Some errors carry a `data` object with a `reason` field.

**2. Events.** These are notifications with no `id`. The method is always `event`.

```json
{ "jsonrpc": "2.0", "method": "event",
  "params": { "type": "message.delta", "session_id": "<runtime id>", "seq": 42, "payload": { "text": "Hel" } } }
```

`seq` counts up per session. It is missing on events that belong to no session. See [section 8](#8-streamed-events).

**3. Server requests.** The server asks the client something and waits for the answer. These have an `id` and a method other than `event`.

```json
{ "jsonrpc": "2.0", "id": "a7f...", "method": "approval", "params": { ... } }
```

**4. Your response to a server request.** Use the same `id`.

```json
{ "jsonrpc": "2.0", "id": "a7f...", "result": { "choice": "once" } }
```

Answer every server request, even ones the app can't handle. For those, send a "not shown here" decline (error code `4404`), so that another client can still answer. See [section 9](#9-approvals-and-questions).

### The first frames

1. The server's first frame is a `gateway.ready` event:
   ```json
   { "type": "gateway.ready",
     "payload": { "skin": { ... }, "change_events": true, "heartbeat": true, "replay_epoch": "..." } }
   ```
   Save `replay_epoch`. It identifies this server process. It is used on reconnect ([section 10](#10-disconnects-and-reconnecting)).
2. **Right after `gateway.ready`, send `client.capabilities`:**
   ```json
   { "jsonrpc": "2.0", "id": "r1", "method": "client.capabilities", "params": { "server_requests": true } }
   ```
   The answer lists the request kinds the server can send, and `declines_not_shown`: `{"server_requests": ["approval", "clarify", ...], "declines_not_shown": true}`.
   Without this, the server treats the client as an old build that can't answer server requests. **It then fails every approval and question at once** (`apps/shared/src/json-rpc-channel.ts`, `advertiseCapabilities`).

### Heartbeat

When `gateway.ready` has `heartbeat: true`, send this every 15 seconds:

```json
{ "jsonrpc": "2.0", "id": "p1", "method": "gateway.ping", "params": {} }
```

The server answers `{"result": {"ok": true}}`. The desktop treats any incoming frame as proof the connection is alive. If nothing arrives for 45 seconds, it closes the socket and reconnects (`DEFAULT_HEARTBEAT_INTERVAL_MS` and `DEFAULT_HEARTBEAT_DEADLINE_MS` in `apps/shared/src/json-rpc-channel.ts`). The server also uses incoming frames to know a client is still there.

## 6. Sessions

### Two ids per session

A session has two ids, and mixing them up is the easiest mistake to make:

- The **stored id** names the saved conversation in the database. Session lists and REST routes use it.
- The **runtime id** names the live copy loaded in the server's memory. `prompt.submit`, `session.interrupt`, `approval.respond` and every event's `session_id` use it.

`session.create` and `session.resume` return both. Keep a map between them. A runtime id stops working once the server drops the live copy ([section 10](#10-disconnects-and-reconnecting)). Resuming the stored id again gives a working runtime id.

### List saved sessions

```json
{ "method": "session.list", "params": { "limit": 40 } }
```

Optional params: `profile`, `title` (find by exact title), `include_hidden`.
The result is `{"sessions": [row, ...]}`, newest first. Each row has:

| Field | Notes |
| --- | --- |
| `id` | Stored id. |
| `title` | |
| `preview` | Start of the conversation. |
| `started_at` | Unix seconds. |
| `message_count` | |
| `source` | Where it was started, for example `gui` or `cron`. |

`GET /api/sessions` returns richer rows (archived, pinned, token counts, working folder). Use it if the list needs more than this.

### Open a saved session

```json
{ "method": "session.resume", "params": { "session_id": "<stored id>" } }
```

`session_id` can also be an exact title.
Useful optional params: `omit_messages: true` (skip the transcript when you already have it), `defer_history: true`, `profile`.

The result includes:

| Field | Notes |
| --- | --- |
| `session_id` | **Runtime id.** Use it from now on. |
| `stored_session_id` | |
| `messages` | Transcript rows (below). Empty when `omit_messages` was set. |
| `running` | A turn is in progress. |
| `inflight` | When a turn is running: `{user, assistant, streaming, ...}`, the text so far, so the app can redraw the reply in progress. |
| `queued` | A message waiting behind the running turn. |
| `pending_approval` | An approval that is waiting. |
| `open_requests` | Server requests still waiting for an answer, as `[{id, method, params}]`. Handle each one exactly like a live server request ([section 9](#9-approvals-and-questions)). |
| `info` | Model, provider, working folder, title and other settings. |

If the session is already loaded on the server, resume attaches to the existing live copy. It doesn't start a second one.

Transcript rows (`TranscriptMessage`):

| Field | Notes |
| --- | --- |
| `role` | `user`, `assistant` or `tool`. |
| `text` | Display text. |
| `timestamp` | Unix seconds. |
| `row_id` | Database row id. |
| `reasoning` | Assistant reasoning, when kept. |
| `name`, `tool_call_id`, `args`, `context`, `content` | On tool rows. |

### Start a new session

```json
{ "method": "session.create", "params": {} }
```

Every param is optional: `title`, `model`, `provider`, `reasoning_effort`, `cwd`, `profile` and others (`SessionCreateParams`). Leave model and provider out to use the server's defaults.

The result has `session_id` (runtime), `stored_session_id`, `messages` and `info`.
The session is only written to the database when the first message is sent.

### Close a session

`session.close {session_id: <runtime id>}` unloads the live copy. The saved conversation stays.
An app doesn't need to call it. The server unloads idle sessions after the client disconnects ([section 10](#10-disconnects-and-reconnecting)).

### Other session methods

`session.title` (read or set the title), `session.archive`, `session.delete`, `session.history` (the saved transcript, with row ids).

## 7. Sending a message

```json
{ "method": "prompt.submit", "params": { "session_id": "<runtime id>", "text": "Hello" } }
```

The response arrives quickly and only confirms the message was accepted:

| `status` | Meaning |
| --- | --- |
| `streaming` | A turn started. Events follow. |
| `queued` | A turn was already running. This message waits behind it. |
| `steered` | Added to the running turn as guidance. |
| `redirected` | Replaced the running turn's direction. |

The reply itself comes as events. **The turn ends with `message.complete`, not with the response to `prompt.submit`.**
The desktop waits up to 30 minutes for the response (`PROMPT_SUBMIT_REQUEST_TIMEOUT_MS`), because a busy server can be slow to confirm. Don't show an error after a short timeout.

Don't send `submission_id` or other fields the desktop's canonical path uses. The server answers them with `4000`.

**Stop a running turn:**

```json
{ "method": "session.interrupt", "params": { "session_id": "<runtime id>" } }
```

The result is `{"status": "interrupted" | "not_interrupted"}`. The turn then ends with `message.complete` and status `interrupted`.

**Images:** `image.attach_bytes` sends an image as base64 to attach to the next message. See `ImageAttachBytesParams`.

**Slash commands:** `commands.catalog` lists them and `slash.exec` runs one. See the notes in `apps/desktop/src/AGENTS.md` under "Slash commands".

## 8. Streamed events

Every event looks like this:

```json
{ "type": "<name>", "session_id": "<runtime id>", "seq": 17, "payload": { ... } }
```

Save the highest `seq` seen for each session. It is used on reconnect.

### One turn, in order

A normal turn produces roughly this sequence. Tool calls and reasoning are optional and can repeat.

```
message.start
  reasoning.delta ...                  (if the model streams reasoning)
  message.delta ...                    (reply text)
  message.interim                      (text written before a tool call, closed off as its own block)
  tool.generating
  tool.start
  tool.progress ...
  tool.complete
  message.delta ...                    (more reply text)
message.complete                       (always last)
```

### Events a first version should handle

| Event | Payload | What to do |
| --- | --- | --- |
| `message.start` | Usually empty. | Start a new assistant bubble. |
| `message.delta` | `{text}` | Append `text`. `text: null` marks a break between reply blocks. |
| `message.interim` | `{text, already_streamed}` | Close the current bubble with `text` as its final text, and start a new bubble for what follows. The text was usually streamed already through `message.delta`. |
| `reasoning.delta` | `{text}` | Append to a collapsible reasoning section. |
| `reasoning.available` | `{text}` | A whole reasoning block at once, from models that don't stream it. |
| `tool.generating` | `{name}` | The model is still writing a tool call. It has no `tool_id`, so don't make a row from it: nothing will match it later. |
| `tool.start` | `{tool_id, name, args, context, preview}` | Show a tool row as running. |
| `tool.progress` | `{tool_id, name, progress, total, percent, message}` | Update the row. |
| `tool.complete` | `{tool_id, name, summary, result_text, duration_s, inline_diff}` | Mark the row done. |
| `message.complete` | `{text, status, usage, error, warning, reasoning}` | The turn ended. `status` is `complete`, `error` or `interrupted`. Use `text` as the bubble's final text. |
| `status.update` | `{kind, text}` | A short status line, for example while compacting. |
| `error` | `{message}` | A session failure outside a turn. |
| `session.title` | `{session_id, title}` | The session was named automatically. `session_id` here is the stored id. |
| `session.info` | Session settings. | Refresh the model name and similar. |
| `todo.updated` | The full todo list. | Optional. |
| `thinking.delta` | `{text}` | A short "thinking" status, often empty. Hermes 0.22.4 sends it next to `reasoning.delta`. Safe to ignore. |

In a saved transcript, a tool row (`role: "tool"`) has only the result and `tool_call_id`. The arguments are on the assistant row before it, in `tool_calls[].function.arguments` (a JSON string).
| `approval.cancelled` | `{session_id, stored_session_id, reason, request_ids}` | Remove these approval cards. They were dropped and counted as denied. |
| `request.cancel` | `{id, method, reason}` | The server withdrew a server request. Remove its card. |

Events that belong to no session:

| Event | What to do |
| --- | --- |
| `sessions.changed` | The saved session list changed. Reload it. |
| `gateway.ready` | First frame of a connection ([section 5](#5-the-websocket)). |
| `notification.show` / `notification.clear` | Show or remove a keyed notice. Optional. |

Ignore event types you don't know. The full list is `x-notifications` in the OpenRPC file. Many are only for the desktop (pets, voice, browser preview, themes).

## 9. Approvals and questions

### Approvals

When the agent wants to run a command that needs permission, the server sends a server request:

```json
{ "jsonrpc": "2.0", "id": "<request id>", "method": "approval",
  "params": {
    "session_id": "<runtime id>",
    "request_id": "<approval queue id>",
    "command": "rm -rf build/",
    "description": "delete a folder",
    "choices": ["once", "session", "always", "deny"],
    "allow_permanent": true,
    "smart_denied": false
  } }
```

Show the command and the choices. `allow_permanent: false` means hide "always".
Answer with the request's `id`:

```json
{ "jsonrpc": "2.0", "id": "<request id>", "result": { "choice": "once" } }
```

| Choice | Meaning |
| --- | --- |
| `once` | Allow this one time. |
| `session` | Allow for the rest of this session. |
| `always` | Allow permanently. |
| `deny` | Refuse. |

Add `"all": true` to the result to answer every approval waiting in that session the same way.

**If the server request is gone** (the socket dropped and the card came back from `approval.pending`), answer with a method call instead. It uses the approval's `request_id` from the params, not the frame `id`:

```json
{ "method": "approval.respond",
  "params": { "session_id": "<runtime id>", "request_id": "<approval queue id>", "choice": "once" } }
```

The result is `{"resolved": <count>}`. Answering twice is harmless; the second answer resolves 0.

`approval.pending {session_id}` lists every approval still waiting in a session, as `{approvals: [...]}`.

**Timeout:** an unanswered approval is denied after `approvals.timeout` in the server's config. The default is 300 seconds (`tools/approval_context.py`). The desktop keeps its own `approval.respond` call open for 330 seconds so it doesn't give up before the server does.

### Questions (clarify)

The agent's clarify tool asks 1 to 5 questions:

```json
{ "jsonrpc": "2.0", "id": "<request id>", "method": "clarify",
  "params": {
    "session_id": "<runtime id>",
    "questions": [
      { "qid": "q0", "question": "Which branch?", "choices": ["main (recommended)", "dev"], "multi_select": false },
      { "qid": "q1", "question": "Anything else?", "choices": null, "multi_select": false }
    ]
  } }
```

Answer all questions in one response, keyed by `qid`:

```json
{ "jsonrpc": "2.0", "id": "<request id>", "result": { "answers": { "q0": "main", "q1": "No" } } }
```

- A choice answer is the choice text. The server strips the "recommended" label itself.
- A `multi_select` answer is a list of choice texts.
- Free text is allowed for any question.
- `null` for a question means skipped.
- A result with no `answers` cancels all the questions.

The server waits 3600 seconds by default. The setting is `agent.clarify_timeout` in the server config (`tools/clarify_gateway.py`, `resolve_clarify_timeout`). When it runs out, the agent gets the answers locked in so far.
After a reconnect, a replayed clarify request may include `answers` for questions already locked in.

### Other server requests

The server can also send `sudo` (a sudo password), `secret` (a value for an environment variable), `vault.unlock_prompt`, `vault.code`, `vault.save_login`, and several that only make sense on the desktop (`preview.*`, `terminal.read`, `window.read`, `tour`, `theme.*`, `setup_beat`).
Don't answer these with an error. An error response settles the request at once, even when another client (the web UI on a laptop) could have answered it.
Decline them instead, with error code `4404` ("not shown here"). The shared channel's `request.decline()` sends it.
A decline only settles the request once every attached client that answers requests has declined (`tui_gateway/server_requests.py`, `_decline`).
The gateway reports that it counts declines with `declines_not_shown: true` in the `client.capabilities` answer. Without that, answer `-32601`.
`sudo` and `secret` are answered with `{"value": "<text>"}` if the app supports them later.

The gateway doesn't tell other clients when one client answers a request. A card answered elsewhere stays until the app notices the turn has moved on.

### After a reconnect

Requests that were still waiting come back in `open_requests` on the `session.resume` and `session.events.since` results. The same `id` is reused, so a card the app already shows is the same request. Answering a request twice does nothing the second time.

## 10. Disconnects and reconnecting

Phones drop connections all the time: the app goes to the background, the network changes, the screen locks. This is the part to get right.

### What the server does when the socket closes

From `tui_gateway/session_lifecycle.py` (`_close_sessions_for_transport`, `_schedule_ws_orphan_reap`):

- **Another client still has the session open** (for example the web UI on a laptop): nothing changes. The turn keeps running for that client.
- **No client is left and the session is idle:** after a 20-second grace period, the live copy is unloaded. The saved conversation is kept. Resuming the stored id loads it again.
- **No client is left and a turn is running:** the turn keeps running and its events are buffered. Every 20 seconds the server checks for activity. If the turn has done nothing for 10 minutes, the server stops it. So a long agent task survives the phone going to sleep.
- **An approval or question comes up while no client is connected:** the server keeps it open and hands it to the next client that attaches, in `open_requests` (`tui_gateway/session_transports.py`). It waits for its own timeout: 300 seconds for an approval, after which it is denied, and 3600 seconds for a question. The server can't reach a phone that is asleep, so this matters. See [section 11](#11-notifications-when-the-app-is-closed).

Server config settings that change this, under `dashboard:` in `config.yaml`:

| Setting | Default | What it does |
| --- | --- | --- |
| `ws_orphan_reap_grace_s` | 20 | Seconds before an abandoned session is checked. `0` keeps abandoned sessions loaded forever. |
| `ws_orphan_activity_stale_s` | 600 | Seconds without activity before an abandoned running turn is stopped. |

### Reconnect steps

1. Get a new ticket (cookies) or check the access token (bearer), and open a new socket. The desktop retries with backoff; see `apps/shared/src/reconnect-backoff.ts`.
2. Wait for `gateway.ready`. Send `client.capabilities` again. Start the heartbeat again.
3. **Compare `replay_epoch` with the saved one.** If it changed, the server process restarted. Every saved `seq` is meaningless, and nothing can be replayed. Go to step 5 for each open session.
4. If the epoch is the same, catch up on each session the app has open:
   ```json
   { "method": "session.events.since", "params": { "session_id": "<runtime id>", "last_seen": 17 } }
   ```
   The result is `{events, latest_seq, truncated, count, epoch, open_requests}`.
   - Apply `events` in order, skipping any `seq` you already have. Live events can arrive while this request is in flight. Hold them until the replay is applied, then drop duplicates by `seq`. See `fetchSessionReplay` in `apps/shared/src/json-rpc-gateway.ts`.
   - Handle `open_requests` as server requests.
   - If `truncated` is true, events were lost. Go to step 5 for this session.
   - If the call fails because the session is gone, go to step 5.
5. Reload the session with `session.resume {session_id: <stored id>}`. Take the new runtime id, and redraw from `messages`, `running` and `inflight`. This always works and is the fallback for every case above.

The server keeps the last 512 events (up to 4 MB) per session, for at most 64 sessions (`tui_gateway/event_replay.py`). A long gap or a busy turn can overflow that, which is what `truncated` reports.

A simple first version can skip step 4 and always do step 5 on reconnect. It's slower and loses the in-progress tool rows, but it's never wrong.

## 11. Notifications when the app is closed

The dashboard has no way to wake a phone. While the app is in the background with its socket closed, it receives nothing. An approval that comes up then is denied after 5 minutes by default, unless the app reconnects and answers it first.

Ways to handle this, from least to most work:

- **Raise `approvals.timeout`** in the server config. Waiting approvals then survive longer while you open the app.
- **Keep the connection open in the background** with an Android foreground service. iOS doesn't allow this for long.
- **Run a small helper next to the server** that keeps its own WebSocket open and sends a push through ntfy, Firebase or APNs when it sees an `approval` or `clarify` server request or a `message.complete` event. Things to know before building it:
  - Events and server requests only go to clients attached to that session, so the helper has to `session.resume` each session it watches.
  - The helper must send `client.capabilities {server_requests: true}`. If it is the only client attached and it hasn't, the server fails every approval at once.
  - The helper must not answer the requests. The app answers them after it reconnects and gets them from `open_requests`. A second answer to a request that is already settled is ignored (`tui_gateway/server_requests.py`).
  - While the helper is attached, the server never treats the session as abandoned, so a running turn is never stopped for lack of a client.

## 12. Keeping up with Hermes updates

The protocol changes between Hermes releases. When this repo moves to a new Hermes version:

1. The sync updates `apps/shared/src/gateway-contract.openrpc.json`. Diff it against the previous version. Regenerate the app's models from it.
2. Check the files this document cites for changed behaviour, mainly `apps/shared/src/json-rpc-gateway.ts`, `apps/shared/src/json-rpc-channel.ts`, `desktop-web/src/bridge/gateway.ts` and `apps/desktop/src/app/session/hooks/use-message-stream/gateway-event/server-requests.ts`.
3. Update the version at the top of this document.

The app should read `version` from `GET /api/status` and warn when it doesn't match the version it was built for.

## 13. Not covered here

- The canonical protocol (`hermes-gateway-v1`, `session.mutate`, `execution_generation`). The desktop uses it only on its private local connection.
- Profiles beyond the default one. Most methods take an optional `profile`, and REST routes take `?profile=`.
- Message editing, regenerating and branching (`prompt.submit` truncation fields, `session.branch`).
- Cron jobs, skills, settings, plugins, files and the other REST areas the desktop uses. `apps/desktop/src/api/` has a file per area.
- Voice.
