---
name: project-notes
description: How to keep and use this project's self-maintained notebook (.project-notes/). Consult when writing, updating, or reading project notes, or when a Stop-hook message asks you to update stale notes or capture what you learned.
---

# Project Notes

You keep a notebook for this project at `.project-notes/`. It is **yours** —
written by you, for future sessions of you, the way a person keeps notes of
what will help them later. The user does not read it; optimize entirely for a
future model's usefulness, not human presentation.

Hooks enforce *that* the notebook stays honest (index integrity, freshness,
backups). Everything about *what* it says — which topics exist, what goes in
them, how they're organized — is your judgment.

## The contract (mechanical — the hooks rely on it)

- One markdown file per **topic** (a subsystem or concept), directly in
  `.project-notes/`. Name it for the topic: `auth-flow.md`, `build-and-test.md`.
- Every note starts with YAML frontmatter:

  ```
  ---
  summary: One sentence on what this topic covers.
  covers: [src/auth/, middleware/session.ts]
  ---
  ```

  - `summary` — one line; it becomes the topic's line in the index.
  - `covers` — code paths this topic explains. Use `dir/` for a directory,
    `*`/`**` globs, or exact files. When you edit code under a `covers:` path,
    the Stop hook will require this note to be refreshed before the turn ends.
  - `updated` is stamped automatically — never write or maintain it yourself.
- Never edit `INDEX.md`. It is regenerated from frontmatter; hand edits are
  overwritten.

A complete note looks like:

```
---
summary: How a request is authenticated and where sessions live.
covers: [src/auth/, middleware/session.ts]
---

Entry point: `middleware/session.ts:20` reads the `sid` cookie and loads the
session via `src/auth/store.ts:44`. Public routes are the allow-list in
`src/auth/routes.ts:8` — everything else 401s.

Gotcha: tokens are validated but NOT refreshed here; refresh is a separate cron
(`jobs/refresh.ts`). A request with an expired-but-present token still 401s
rather than auto-refreshing — surprised me, cost an hour.
```

## What to write

- Distilled understanding: how a thing works, why it's built that way, the
  non-obvious gotchas, where the important code lives (`file:line` pointers).
- **Not** transcripts, not whole conversations, not pasted code blocks. If a
  future session can read the code, don't copy the code — point to it and
  explain what isn't obvious from reading it.
- Keep notes current in place. When understanding changes, edit the note; the
  prior version is backed up automatically, so revise freely.

## When to write

- After changing code covered by a topic, update that topic's note before you
  finish. (The Stop hook will block once and name stale topics if you forget.)
- When you edit code that no topic covers and the knowledge is worth keeping,
  create a new topic or extend an existing note's `covers:`.
- After heavy exploration that taught you something a future session would
  want — even with no code change — write it down. (The Stop hook may nudge
  you once; it's declinable — if nothing was worth noting, say so and finish.)

## Keeping it coherent

Prune, merge, and split topics as your understanding sharpens. A topic that
grew two unrelated halves should split; two notes that keep being read together
should merge. Delete notes that no longer reflect the code. The notebook is a
living map, not an append log.

## Reading

At session start the index is injected into your context. Read the topic notes
relevant to your task before diving in — that's the whole point of keeping them.
