# Hermes clients

The web UI and the mobile app in this repo are clients for a Hermes gateway. They let a person chat with their Hermes agent and answer it when it needs them. The words below match the Hermes desktop app's UI.

## Language

### Connecting

**Gateway**:
One Hermes installation a client connects to, known by its URL.
_Avoid_: Server, dashboard, backend, host

**Profile**:
A separate Hermes configuration served by the same gateway, with its own sessions and settings.
_Avoid_: Account, workspace

### Conversations

**Session**:
One saved conversation on a gateway.
_Avoid_: Chat, conversation, thread

**Live session**:
The copy of a session that the gateway has loaded to run turns. It appears when a client opens or starts a session, and it is dropped some time after no client is attached.
_Avoid_: Runtime session, active session

**Turn**:
One message from the person and everything Hermes does in response, until it finishes, fails or is stopped.
_Avoid_: Run, exchange, request

**Outbox**:
Messages the person wrote while the gateway couldn't be reached, waiting on their device to be sent in order. If a turn is still running when one is sent, it becomes a queued message.
_Avoid_: Queue, pending messages, drafts

**Queued message**:
A message the person wrote while a turn was running, waiting on their device until that turn ends. While it waits, the person can edit it, delete it, or steer with it.
_Avoid_: Outbox, pending message, draft

**Steer**:
Sending a note into a running turn. Hermes reads it at its next step. It doesn't start a new turn and isn't shown as the person's message.
_Avoid_: Redirect, interject, nudge

**Retry**:
Running the person's last message again, replacing Hermes's reply to it.
_Avoid_: Regenerate, rerun

**Stop**:
Ending a running turn early, at the person's request.
_Avoid_: Interrupt, cancel, abort

### Hermes asking the person

**Approval**:
Hermes asking permission to run a command during a turn. The person answers Run, Allow this session, Always allow, or Reject.
_Avoid_: Permission prompt, confirmation

**Question**:
Hermes asking the person one to five questions during a turn and waiting for the answers.
_Avoid_: Clarify, clarify request, prompt

**Needs input**:
The state of a session whose turn is waiting on an approval or a question.
_Avoid_: Blocked, waiting, pending
