# Persistent Login Implementation Plan

> **Goal:** Keep authenticated users signed in without idle or seven-day automatic expiry, while preserving explicit logout and administrative session revocation.

**Architecture:** Add an explicit persistent-session policy to server configuration. Persistent sessions are stored with PostgreSQL `infinity` as `expires_at`, and the browser cookie is renewed to a configurable, browser-compatible 400-day lifetime on every authenticated request. The legacy idle and absolute lifetime policy remains available when persistent mode is disabled.

**Tech Stack:** TypeScript, Express, PostgreSQL, Node test runner.

---

### Task 1: Persistent session policy

- [x] Add failing tests for persistent and legacy cookie lifetime calculation.
- [x] Implement the pure session policy helper.
- [x] Add persistent-session environment configuration.

### Task 2: Authentication integration

- [x] Store new persistent sessions with an infinite database expiry.
- [x] Upgrade only currently valid sessions during refresh; never revive expired or revoked sessions.
- [x] Renew the browser cookie using the persistent policy on login and authenticated requests.

### Task 3: Verification

- [x] Run the focused authentication tests.
- [x] Run the full test suite and production build.
- [x] Check formatting and review the final diff.
