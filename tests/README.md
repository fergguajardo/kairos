# Guión save regression checks

Browser tests use synthetic stories and an in-memory Supabase substitute. They
never authenticate to a real account or modify the author's manuscript.

```sh
npm ci
npx playwright install chromium
npm test
```

An existing Chromium can be used with `CHROMIUM_EXECUTABLE=/path/to/chromium npm test`.
Checks cover genre isolation, deletion boundaries, cut/paste, stale selections,
cursor position, undo/redo, empty-write protection, connection loss, concurrent
tabs, reload, in-flight saves and session loss. No recovery copies are created.

`database/guion-save-guard.sql` removes the prior recovery feature and its copies
without modifying the active document. It retains an empty-overwrite guard.

`tests/guion-database.sql` must run inside `BEGIN` / `ROLLBACK`, never committed.
It checks empty-write rejection, absence of recovery storage and authenticated
saving. Unconfirmed edits remain pending in the open tab until a save succeeds;
connection failures remain visible and navigation is guarded.
