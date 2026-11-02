# Guión recovery regression checks

These browser checks use synthetic stories and an in-memory Supabase substitute.
They never authenticate to a real account or modify the author's manuscript.

```sh
npm ci
npx playwright install chromium
npm test
```

An existing Chromium can be used with `CHROMIUM_EXECUTABLE=/path/to/chromium npm test`.
The tests cover genre isolation; collapsed deletion boundaries; cut, paste and
selection replacement; stale bullet selections; cursor placement; keyboard and
button undo/redo; redo invalidation; empty-manuscript protection; offline retries;
concurrent tabs; recovery preview/restoration; reload; edits during a save; and
session loss.

`database/guion-revisions.sql` provisions immutable recovery snapshots and a
server-side guard against an empty-string overwrite. It seeds the existing
manuscript without modifying it. Deploy it once, before the updated editor.
No retention cleanup is performed automatically. The editor lists the latest
50 versions; older snapshots remain in the database.

`tests/guion-database.sql` validates the deployed database protections, including
owner-only RLS and client write denial. Run it inside `BEGIN` / `ROLLBACK`:
it deliberately changes rows *inside that rolled-back transaction*. It must
never be committed. Successful tests preserve the current document and publication.

Normal undo/redo is session-local. Version recovery survives reloads and operates
on confirmed server saves. Edits that have not reached the server remain pending
in the open tab; connection errors are shown and navigation is guarded.
