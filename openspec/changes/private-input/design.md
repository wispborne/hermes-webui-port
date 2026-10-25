## Context

Protocol: `mobile/GATEWAY_PROTOCOL.md`, section 9. The facts below were checked in the gateway source on the `upstream/main` snapshot of 2026-10-24 (`tui_gateway/agent_callbacks.py`, `tui_gateway/server.py` `_ask`, `tui_gateway/contracts/server_requests.py`, `tui_gateway/server_requests.py`).

- All five requests are server requests answered with `{value: <string>}`. An empty string means the person refused or skipped. A timeout, a cancel or an error response also gives the tool an empty string.

  | Request | Params | What the value is | Empty value | Timeout |
  | --- | --- | --- | --- | --- |
  | `sudo` | `command` (redacted by the gateway, may be empty) | The sudo password | sudo fails, the command doesn't run | 120 s |
  | `secret` | `env_var`, `prompt`, optional `metadata` | The value for that environment variable. The gateway saves it in its own `.env`. | Skipped | 300 s |
  | `vault.unlock_prompt` | `backend`, `display_name` (for example "1Password") | The password manager's master password | The manager stays locked | 120 s |
  | `vault.save_login` | `origin`, `site` | A JSON string `{"identifier", "password"}` | The login isn't saved | 180 s |
  | `vault.code` | `site`, `hint` | A one-time code | Skipped | 180 s |

- They follow the same rules as Approvals and Questions. They come back in `open_requests` after a reconnect, with the same id. A timeout or a cancel sends `request.cancel {id, method, reason}`. A second answer is dropped. The gateway doesn't tell other clients when one client answers.
- While any of them waits, `session.active_list` reports the session as `waiting`, so the other-session watch already notices them.
- `display.install.sudo` is a different request. The gateway sends it with no session, only to the desktop window where the person clicked Install for the Bot Screen. The phone never needs to answer it.
- The desktop shows each one as a dialog (`apps/desktop/src/components/prompt-overlays.tsx`). Closing the dialog in any way sends an empty value, so silence is never taken as consent.

Today the phone declines all five with code 4404. That has two bad results:
- When only the phone is attached, the decline settles the request at once, and the tool fails.
- When the phone attaches to a session from another device to alert the owner (the other-session alerts change), it declines the request, gets no card, and detaches. No alert is raised.

## Goals / Non-Goals

**Goals:**
- Answer all five from the phone, with the desktop's wording and the same answers.
- Nothing the person types is kept on the phone after it's sent.
- Keep letting the laptop answer the same request. The first answer wins.

**Non-Goals:**
- `display.install.sudo`, and the requests only the desktop can answer (`preview.*`, `terminal.read`, `window.read`, `tour`, `theme.*`, `setup_beat`). They're still declined.
- Answering from a notification. The person opens the session to answer.
- Managing saved logins or authenticator keys. That's in the desktop's Settings.
- Blocking screenshots while a card is shown.

## Decisions

### One card for all five
They're one kind of card, a Private input card, with a different title, description, fields and buttons per request. Like Approvals and Questions, it's pinned above the message box, not shown as a dialog. A dialog would cover the transcript and the turn's tool rows, which the person may need to read to decide. Several Private inputs in one session form a stack: the oldest shows, with "1 of 2", as for Approvals.

| Request | Title | Description | Fields | Buttons |
| --- | --- | --- | --- | --- |
| `sudo` | Administrator password | The desktop's, then the command in monospace, or the desktop's "did not provide the command" line | Password | Cancel, Send |
| `secret` | The variable name, or "Secret required" | The prompt, or "Hermes needs a credential to continue." | Value | Cancel, Send |
| `vault.unlock_prompt` | Unlock {name} | The phone's own line (see Wording) | Master password | Keep locked, Unlock |
| `vault.save_login` | Save your {site} login? | The phone's own line | Email or username, Password | Don't save, Save & sign in |
| `vault.code` | Verification code for {site} | The desktop's | Code | Skip, Enter code |

Send stays disabled until the field has something, except for `sudo`, where the desktop allows an empty password. Save & sign in needs both fields. The code has spaces and dashes taken out before it's sent, as on the desktop.

### Fields
- Passwords, the master password and secret values are hidden as they're typed. An eye button shows them. They start hidden every time.
- Android autofill is allowed. The password fields offer the phone's password manager. The code field asks for SMS code autofill. The secret field turns autofill, autocorrect and capitals off, since it's usually an API key.
- The field doesn't take focus when the card appears. A card can arrive while the person is typing a message, and taking focus would send their next keystrokes into the card.
- Typing in the message box never fills a Private input card. This is unlike a Question, where it fills the free-text answer.

### Keeping what's typed off the phone
- The typed text lives only in the card's own component state. It isn't put in a store, so nothing else can read or save it.
- The text is cleared when it's sent and when the card goes away.
- It's never written to SQLite, the Outbox, the transcript, a notification or the log.
- The card's own details (the title, the command, the site) aren't saved either. After a restart they come back from the gateway's `open_requests`.

### Answering
- Send responds to the live request with `{value}`. The cancel button responds with `{value: ""}`.
- While the connection isn't open, the buttons are disabled and the field keeps what's typed. A reconnect delivers the same request id again, so the same card stays and can then be sent. Nothing is queued for later.
- A failed send shows the desktop's "Could not send …" line for that request, and keeps the card.

### Clearing stale cards
The same rules as the other cards:
- `request.cancel` with its id removes it. No note is added on a timeout. The tool's own result in the transcript shows what happened.
- A resume's `open_requests` without it removes it.
- `message.complete` removes every card of the session.
- **Answered elsewhere:** when the turn moves on after the card arrived, the app resumes the session and drops cards that are no longer open. This is the check Questions already use.

### Wording
The desktop's strings are exported under `prompts`, and used for titles, labels, buttons and errors. Four don't fit the phone:
- `vaultUnlockDesc` and `vaultSaveDesc` say "on this machine". On the phone, that machine is the gateway's computer. The app has its own lines that say "the gateway's computer".
- `vaultSaveFootnote` and `vaultCodeFootnote` point at the desktop's Settings, which the app doesn't have. They're left out.

### Notification
A Private input card raises "Input needed — {session}", like a Question, with no buttons. The body is the desktop's: "Hermes is waiting for your response." for `sudo`, the prompt or variable name for `secret`, and the card's title for the vault requests. A notification has no hidden text field, and the person should read the description before answering, so there's no Send button. Tapping it opens the session.

### Sessions on other devices
When the phone attaches to a waiting session from another device, a Private input now arrives as a card and raises the notification above. The detach check counts every kind of card, so the phone stays attached until the Private input is settled.

## Risks / Trade-offs

- [The password goes over the phone's connection to the gateway] → It's the same connection the sign-in password uses. On an `http://` gateway it relies on Tailscale's encryption, as sign-in does.
- [Android may offer to save a typed password in the phone's password manager] → That's the person's choice, and it's how they'd fill it next time. The app doesn't save it.
- [A shown password can appear in the recent apps screen] → It's hidden unless the person taps the eye button. Blocking screenshots would also block the emulator screenshots this change needs, so it's left out.
- [A card answered on the laptop stays until the turn moves on] → Same as Questions. A late answer from the phone is dropped by the gateway.
- [The phone and the laptop both show the card, and the person types on both] → The first answer wins. The other card disappears at the next check.
