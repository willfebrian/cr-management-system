# Release Operation Status Design

## Objective

Make SAP transport release a single-click operation whose UI remains in progress until SAP confirms success, a terminal failure occurs, or the confirmation timeout expires. A successful release queues the existing incremental CR synchronization in the background; synchronization does not delay or change the release outcome.

## User Flow

1. The user confirms **Release Request** once.
2. The modal enters `Release in progress`; release, close, and duplicate submission actions are disabled.
3. The UI shows the current phase: releasing child tasks, releasing the parent, or verifying SAP status.
4. The operation ends as one of:
   - `Released successfully` after SAP confirms the parent status is released.
   - `Release failed` with the failed request/task, SAP return code, and explanation.
   - `Release confirmation timed out` when SAP does not reach a terminal status within the configured limit.
5. On success, the modal reports success immediately and queues CR synchronization in the background. The UI may state that synchronization is running, but it must not keep the release operation pending.

## SAP RFC Behavior

- Keep the release order child tasks first, then parent.
- After every `TR_RELEASE_REQUEST` call, verify the request in `E070` even when the function returns a non-zero code that may accompany an asynchronous export.
- Treat `R` and `N` as confirmed release states.
- Stop before the parent if a child is not confirmed released.
- Preserve the SAP return code and stage in the RFC result when confirmation fails.
- Treat a request that became released during an earlier attempt as an idempotent success rather than an `ALREADY_RELEASED` error.
- Use bounded polling; never wait indefinitely.

## Backend Operation Tracking

- Create one release operation per target system and parent request.
- Return the existing active operation for duplicate submissions instead of starting another SAP release.
- Track `queued`, `releasing_children`, `releasing_parent`, `verifying`, `succeeded`, `failed`, and `timed_out` states.
- Expose operation status for frontend polling.
- Persist the final SAP task rows and diagnostic message.
- Use a timeout long enough to cover sequential child and parent verification.

## Background Synchronization

- Once SAP confirms release success, mark the release operation `succeeded` first.
- Queue the existing incremental synchronization for `DEV`, `QA`, and `PRD` with its current three-day lookback.
- Synchronization failure must be logged separately and must not convert a successful SAP release into a failed release.
- Refresh/remove the released request from the Release candidate list when synchronized DEV data becomes available.

## Frontend

- Preserve the current page and modal layout.
- Disable repeated release and modal-close actions while the operation is active.
- Poll operation status approximately every two seconds.
- Display the active phase and one terminal notification.
- On success, close or reset the release selection after acknowledging the result and refresh the candidate list.
- On failure or timeout, retain the selected request and test-run details so the user can diagnose the result.

## Verification

- Unit-test RFC result classification, idempotent already-released handling, operation transitions, duplicate submissions, timeout handling, and background sync isolation.
- Test frontend polling and terminal notification behavior.
- Deploy and syntax-check the RFC on DEV AIX and DEV NC.
- Verify a fresh transport release with one click and confirm that SAP, backend state, UI notification, and the later background sync agree.
