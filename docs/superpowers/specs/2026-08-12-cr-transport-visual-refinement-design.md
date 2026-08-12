# CR Transport Visual Refinement Design

**Date:** 2026-08-12

## Goal

Improve the Create and Release pages while preserving the application's current visual language and release workflow.

## Approved changes

- Use more of the available content width on both pages.
- Keep the existing teal action colors.
- Match Release control typography with Create and Report, and make compact tables easier to read.
- Increase only the selected-row background contrast; do not add a new selection border or additional emphasis.
- Make the Release empty states and Step 2 guidance more informative, in English.
- Show the latest successful SAP synchronization time beside Refresh.
- Display target-system options consistently as `Description · CODE`.
- Use the shared `UIModal` confirmation pattern for Release, matching Create.
- Improve responsive stacking and horizontal table overflow on smaller screens.

## Release confirmation behavior

The confirmation summarizes the parent request, child-task count, and target system. Confirming continues to use the existing child-first release orchestration. A child failure remains a hard stop and is surfaced by the existing release result/error handling.

