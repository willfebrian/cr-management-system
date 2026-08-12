# Release Header Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse Create's Target System and Sync CR toolbar on the Release page.

**Architecture:** Render the existing Create toolbar branch for both Create and Release. Pass a refresh token into the Release workspace and increment it after a successful Sync CR operation launched from Release.

**Tech Stack:** React, TypeScript, CSS, Node test runner.

## Global Constraints

- Keep all interface copy in English.
- Preserve the existing release workflow and teal action color.
- Do not display a separate Refresh button or Last synced label.

---

### Task 1: Release header placement

**Files:**
- Modify: `scripts/transport-release-candidate-system.test.ts`
- Modify: `src/client/components/crTransport/CrTransportRelease.tsx`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`

**Interfaces:**
- Produces: `nextReleaseRefreshToken(current, view, syncSucceeded)` and the existing `refreshToken` prop.

- [x] Write a behavior test proving a successful sync from Release increments its candidate refresh token.
- [x] Run the focused test and confirm it fails because the refresh-token behavior is missing.
- [x] Reuse the Create toolbar branch for Release.
- [x] Increment the Release refresh token after successful Sync CR.
- [ ] Run focused tests and the production build.
- [ ] Verify the Create and Release header alignment in the browser without executing a release.
