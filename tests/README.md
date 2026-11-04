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

Performance checks verify that a 200-event typing burst makes no synchronous
manuscript copies and reuses one deferred capture for history and autosave.
Typing is grouped after 500 ms idle; autosave prepares its payload after 800 ms.
Undo remains immediate, stores reversible deltas, and limits retained history
to 100 states / a 16 MiB estimated text budget (at least one undo step).
Additional checks cover Unicode, history trimming, page hiding and IME input.

Rich-text regression checks load 10,000 nested formatting spans and verify
compaction, exact text, typography, autosave and undo/redo. Relative font sizes,
semantic markers, links and layout styles are preserved. Repeated rich
copy/paste must not grow wrapper chains. Set `GUION_PROFILE=1` to compare native
typing, style/layout and deferred-save work before/after compaction using CDP.
Only synthetic text is used by these checks and benchmarks.

`database/guion-save-guard.sql` removes the prior recovery feature and its copies
without modifying the active document. It retains an empty-overwrite guard.

`tests/guion-database.sql` must run inside `BEGIN` / `ROLLBACK`, never committed.
It checks empty-write rejection, absence of recovery storage and authenticated
saving. Unconfirmed edits remain pending in the open tab until a save succeeds;
connection failures remain visible and navigation is guarded.

