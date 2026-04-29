# FitFix docs

Project knowledge that's not the code itself: research, lessons learned,
roadmap sketches. The code is the source of truth for *what is*; this
folder is the source of truth for *why* and *what we tried and learned*.

This file is the index AND the style guide. If you are an agent (human or
AI) about to add a doc here, read [§ How to write a doc](#how-to-write-a-doc)
first.

---

## Index

### `product/` — research, positioning, market context

Audience: anyone making product / scope decisions.

- [`product/competitor-research.md`](product/competitor-research.md) —
  landscape of FIT/TCX/GPX editors, where the gap is, what's a
  differentiator vs. table-stakes catch-up, demand signal from
  Reddit/forums.
- [`product/comparison.md`](product/comparison.md) — short, public-facing
  comparison: what FitFix covers and where to send users it deliberately
  doesn't serve.

### `engineering/` — lessons, post-mortems, architecture notes

Audience: contributors touching the code; future-you debugging the same
bug twice.

- [`engineering/perf-merge-2026-04.md`](engineering/perf-merge-2026-04.md)
  — closed perf investigation. Lessons on dev-mode React, React DevTools
  serialization cost, and why you should benchmark in Node and reproduce
  in `npm run preview` before optimizing app code.

### `roadmap/` — design sketches for work that hasn't started

Audience: contributors evaluating where to take FitFix next.

- [`roadmap/mcp-server.md`](roadmap/mcp-server.md) — `@fitfix/mcp-server`
  so Claude Desktop / Code (and other MCP clients) can drive FitFix edits
  via natural language.
- [`roadmap/garmin-connect.md`](roadmap/garmin-connect.md) — link a
  Garmin Connect account, pull activities into the editor, push fixes
  back, without the USB / Garmin Express round-trip.

---

## How to write a doc

### 1. Pick the right folder

| Folder | Lives here |
|---|---|
| `product/` | competitive research, positioning, demand signal, scope rationale |
| `engineering/` | post-mortems, perf investigations, architecture decisions, lessons from incidents |
| `roadmap/` | design sketches for not-yet-started initiatives that are too big for an inline TODO |

### 2. Pick the right status

Every doc here is one of four kinds. The status is the doc's *current
state*, not the topic's:

| Status | Meaning | Lifecycle |
|---|---|---|
| **research** | Informs scope or positioning. Not directly actionable. | Update or supersede when the landscape changes. |
| **lesson** | Captured after the fact. Helps future contributors avoid the same trap. | Permanent. Edit only to add follow-up incidents. |
| **open** | Design / backlog. Not started or mid-flight. | Move to `lesson` (or delete) once shipped. |
| **shipped** | Done. Kept for context on why the code looks the way it does. | Permanent. |

If a doc doesn't fit any of those four, it probably doesn't belong here —
see [§ What does NOT belong here](#what-does-not-belong-here).

### 3. Use the standard header

Every file in `docs/` (except this one) starts with:

```markdown
> **Status:** research / lesson / open / shipped
> **Audience:** who would benefit from reading this
> **TL;DR:** one-sentence summary, ideally answering "should I read this?"

# Title
```

Three lines, blockquote, no frontmatter. This is what makes the docs
scannable for both humans and AI agents — most readers read only the
header and decide whether to continue.

**Audience guidance:** be specific. "Future contributors" is too vague.
Better: "future contributors hitting 'merge is slow' symptoms" or
"anyone evaluating where to take FitFix next."

**TL;DR guidance:** give the takeaway, not the topic. Bad: "notes on the
perf investigation." Good: "the spike was dev-mode React, not the merge
algorithm — benchmark in Node before optimizing app code."

### 4. Naming

- Lowercase, kebab-case: `perf-merge-2026-04.md`, not `PERF_MERGE.md`.
- Prefix with date `YYYY-MM` only for time-bound investigations
  (post-mortems, perf hunts) where multiple may stack up.
- Don't put dates on research / roadmap / lesson docs — the header has
  `_Last updated:_` for that.

### 5. Length and form

- No fixed length. A 30-line lesson is fine; a 500-line research dump is
  fine if every section earns its space.
- Use H2 / H3 to make the doc scannable. The header's TL;DR + headings
  alone should let a reader decide whether to read deeper.
- Code samples and CLI snippets in fenced blocks with a language tag.
- Diagrams in fenced ASCII boxes are preferred over external image hosts.
- Internal links: relative paths (`../engineering/perf-merge-2026-04.md`),
  not absolute URLs to GitHub — they survive forks and offline reading.

### 6. Updating an existing doc

- For `lesson` and `shipped` docs, add a new dated section at the bottom
  rather than rewriting earlier content. The history *is* the value.
- For `open` (roadmap) docs, edit freely; once the work ships, demote to
  `lesson` or delete.
- For `research` docs, add `_Last updated: YYYY-MM-DD._` near the top
  when you refresh.

---

## What does NOT belong here

Don't put these in `docs/`:

- **Handoff notes between agents** ("here's where I left off, please
  continue"). Use a PR description or branch.
- **Test plans and TDD checklists** for in-flight work. Track them in
  the issue / PR.
- **Personal scratch notes, design rationale that's already in code
  comments, debugging logs.** They rot fast and dilute the signal.
- **Anything with secrets, real activity files, personal data.** This
  is a public repo.
- **CLAUDE.md / agent prompts.** Those go at the repo root or in
  `.claude/`.

The bar: would a contributor in 12 months still find this useful, or is
it ephemeral state of the current branch? If the latter, don't add it
here.

---

## Cross-references

- The repo-level [`AGENTS.md`](../AGENTS.md) is the *operational* onboarding
  guide — what FitFix is, the FIT format gotchas, dev commands, PR
  workflow. It points here for background reading.
- The repo-level [`README.md`](../README.md) is the *user-facing* entry
  point and links to roadmap items here.

If you add a new doc, update **both** the [Index](#index) above AND, if
relevant, the AGENTS.md "Background reading" section so future agents
discover it.
