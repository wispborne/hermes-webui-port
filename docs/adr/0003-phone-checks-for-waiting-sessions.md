# The phone checks for waiting sessions instead of staying attached to them

To alert the person when a session on another device needs input, the phone asks the gateway for `session.active_list` every 10 seconds while Keep connected is on. It attaches to a session only once that session has been waiting for 30 seconds, and detaches again with `session.detach` once the request is settled. If the gateway can't detach one connection, the phone doesn't attach at all and raises a plain notification instead.

The gateway only sends Approvals and Questions to connections attached to that session, so staying attached to every Live session would have been the simplest way to hear them. It was rejected because the gateway never unloads a session while any connection is attached. A phone with Keep connected on would keep every session from every device loaded for as long as it stayed connected.

## Consequences

- An alert arrives 30 to 40 seconds after a session starts waiting, not at once.
- A request answered at the laptop within 30 seconds never reaches the phone.
- On a gateway that can't detach, the alert has no Run or Reject buttons. One tap opens the session, which shows them.
- The app must never send `session.close` for a session it is only watching. That would unload it for every device.
