# Release Object Status Design

## Goal

Show the SAP objects belonging to every child task and parent request in the Release test-run result, while retaining request-level status and supporting object-level validation returned by SAP.

## Contract

`ZRFC_TRANSPORT_REQUEST_RELEASE` keeps its existing task rows and may append object rows to `ET_RESULTS` using these backward-compatible line formats:

```text
TASK|TRKORR|TRFUNCTION|DESCRIPTION|STATUS|MESSAGE|SEQUENCE
OBJECT|TRKORR|PGMID|OBJECT_TYPE|OBJECT_NAME|STATUS|MESSAGE|SEQUENCE
```

The backend continues to accept the existing six-column task format. When SAP does not yet return object rows, the backend loads E071 objects from the synchronized `cr_objects` table and gives them the owning task's status with `statusSource = "TASK"`. SAP-returned object rows use `statusSource = "SAP"` and override matching synchronized objects.

## Behaviour

- Test Run displays `request/task -> objects`.
- Object failures make the owning task and overall test run erroneous.
- Release remains disabled when any task or object has `ERROR`.
- During execution, child failure stops processing and the parent is returned as `SKIPPED`.
- SAP messages are shown unchanged; the UI adds a short English explanation only for known codes.
- Empty object lists remain valid and render an informative empty state.

## Scope

Implement the backward-compatible application contract, local E071 fallback, nested Release UI, and automated tests. The SAP function module must emit `OBJECT` rows for genuine per-object validation; until that ABAP change is deployed, object statuses are explicitly labelled as inherited from the task.
