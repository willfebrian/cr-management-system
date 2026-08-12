# ZRFC_TRANSPORT_REQUEST_RELEASE Object Results

The RFC is deployed with the same interface on DEV NC and DEV AIX. `ET_RESULTS` remains `ABAPTXT255`; only the line contract is extended.

```text
TRKORR|TRFUNCTION|DESCRIPTION|STATUS|MESSAGE|SEQUENCE
OBJECT|TRKORR|PGMID|OBJECT_TYPE|OBJECT_NAME|STATUS|MESSAGE|SEQUENCE
```

Task rows retain the legacy six-column format for backward compatibility. Object rows are emitted immediately after their owning task.

During `TEST_RUN`, the function reads each task with `TR_READ_REQUEST`, validates it with `TR_CHECK_REQUEST`, and maps `CTSGERRMSG` entries to E071 objects through `K_PGMID`, `K_OBJECT`, and `K_OBJNAME`. Error messages set the object and task to `ERROR`; warnings set them to `WARNING` unless an error already exists.

During `RELEASE`, object rows inherit the actual task release result. A child error prevents the parent release. The application also merges synchronized E071 data as an explicitly labelled fallback when an older RFC response has no object rows.
