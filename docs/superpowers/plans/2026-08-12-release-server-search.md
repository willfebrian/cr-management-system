# Release Candidate Server Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Release to find eligible CRs outside the first 50 candidates.

**Architecture:** Filter eligible candidates in PostgreSQL before limiting results. Debounce frontend search requests and ignore stale responses.

**Tech Stack:** React, TypeScript, Express, PostgreSQL, Node test runner.

## Global Constraints

- Preserve the existing target-change and post-sync refresh behavior.
- Search only eligible outstanding parent requests for the selected source system.
- Keep the initial unfiltered response limited to 50 rows.

---

### Task 1: Server-side candidate search

**Files:**
- Modify: `scripts/transport-release-candidate-system.test.ts`
- Modify: `src/server/routes/transportReleaseRoutes.ts`
- Modify: `src/client/api/transportReleaseApi.ts`
- Modify: `src/client/components/crTransport/CrTransportRelease.tsx`

**Interfaces:**
- Produces: `fetchReleaseCandidates(targetSystem, limit, query)`.

- [ ] Add a failing boundary test proving the database search condition is applied before LIMIT.
- [ ] Add the normalized `q` route parameter and parameterized ILIKE conditions.
- [ ] Pass the search query through the client API.
- [ ] Replace local-only filtering with a debounced, sequence-guarded candidate request.
- [ ] Run focused tests, production build, and verify `TRDK905650` in the browser.

