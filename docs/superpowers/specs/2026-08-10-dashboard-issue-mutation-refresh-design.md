# Dashboard Issue Mutation Refresh Design

## Goal

Keep Dashboard Issue metrics synchronized immediately after an Issue is saved, cancelled, or deleted, including when the mutation originated from a Dashboard drill-down.

## Design

- The existing `/api/dashboard` endpoint remains the source of truth.
- Successful Issue mutations invalidate the client Dashboard snapshot by calling `loadDashboardData()` alongside the existing Issue-list refresh.
- Entering the Dashboard triggers an immediate refresh before the existing 60-second polling interval begins.
- Refresh failures continue through the existing application error state; successful mutation feedback is unchanged.

## Scope

- No API, database, or dashboard-query changes.
- Preserve the 60-second polling fallback.
- Apply the same invalidation behavior to save, cancel, and delete so Dashboard aggregates cannot become stale through another Issue mutation path.

## Verification

- A source regression contract proves that Dashboard entry fetches immediately and all successful Issue mutations refresh Dashboard data.
- Run the focused regression test and production build.

