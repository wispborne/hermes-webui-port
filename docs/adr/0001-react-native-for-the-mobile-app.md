# React Native for the mobile app

The mobile app uses React Native with Expo, not Flutter, even though the owner has more Flutter experience. React Native can import `apps/shared` (the gateway client with heartbeat, server requests and reconnect replay, plus the generated contract types) and the desktop app's English strings without a rewrite. Those are the parts most likely to change when Hermes updates. In Flutter they would have to be ported by hand and ported again after every upstream change.

## Consequences

- Upstream code in `apps/shared` runs on the phone. An upstream sync can start using a browser feature that type-checks but is missing on the phone. The upstream sync runs the mobile app's tests to catch this.
- The desktop's chat logic (stores, event handlers) is too tied to desktop-only code to import. It is copied into the app and trimmed. Copying TypeScript to TypeScript keeps the port close to the original.
