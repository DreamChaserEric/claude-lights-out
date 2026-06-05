# claude-lights-out

[English](README.md) | [中文](README-zh.md)

**Lights-out development. One sentence in, production code out.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> "Lights-out manufacturing" — a factory so automated it runs with the lights off. No humans needed.

A [Claude Code dynamic workflow](https://docs.anthropic.com/en/docs/claude-code) that enforces a rigorous, non-negotiable software engineering pipeline. No phase can be skipped. No shortcut is possible. Every artifact is reviewed by an independent agent before proceeding.

Give it one sentence. It executes the full lifecycle — spec, design, architecture, consistency review, test design, TDD implementation, QA, three-dimensional verification — and hands you production-ready code with persistent documentation that survives across sessions.

## Before / After

**Without structure** (typical Claude Code usage):
```
You: "Build a URL shortener"
Claude: *immediately starts coding*
Result: Code works but... no docs, no design decisions recorded,
        no test strategy, no review, inconsistent architecture.
        Next session starts from zero.
```

**With lights-out**:
```
You: /lightsout Build a URL shortener with Express and Redis
Pipeline: Spec → Design → Arch → Review → Test Design → Code (parallel TDD) → QA → Verify
Result: Production code + spec.md + design.md + architecture.md + test-cases.md
        All reviewed. All tested. All consistent. Persistent across sessions.
```

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/DreamChaserEric/claude-lights-out/main/install.sh | bash
```

## Usage

```
/lightsout Build a CLI that converts CSV to JSON with streaming support
/lightsout Add rate limiting to the existing API endpoints
/lightsout Fix: search returns stale results after cache invalidation
```

Simple requests run immediately. Complex requests get a quick clarification prompt (you choose: discuss details, pick from options, or just let it go).

## What Happens

```
/lightsout <your request>
     │
     ▼
[Clarity Gate] ─── Simple? Run immediately. Complex? Quick brainstorming.
     │
     ▼  (fixed 8-phase pipeline — every phase runs, agents self-calibrate depth)
[Spec Writer → Spec Reviewer] ─── independent agents, adversarial review
     │
     ▼
[UX Designer → Design Reviewer] ── each reviewer is a fresh agent with no
     │                                writer bias (not self-review)
     ▼
[Architect → Arch Reviewer] ─────── technical architecture + ADRs
     │
     ▼
[Consistency Reviewer] ──────────── cross-document contradiction detection + fix
     │
     ▼
[Test Case Designer] ────────────── design tests BEFORE writing code
     │
     ▼
[Code Orchestrator] ─────────────── parallel TDD implementation
     │
     ▼
[QA Engineer → Bug Fixer] ──────── test + fix loop (max 5 rounds)
     │
     ▼
[Final Check → Fixer] ──────────── 3D verification + fix loop (max 5 rounds)
     │
     ▼
✓ Done: code + 4 ground-truth documents + git commits
```

## Key Design Decisions

| Decision | Why |
|----------|-----|
| Writer ≠ Reviewer (independent agents) | Self-review has blind spots. Fresh eyes catch what the author misses. |
| Documents before code | Prevents "build first, think later." Architecture decisions are explicit. |
| Test cases before implementation | TDD without a test plan is just "write tests after." We design tests first. |
| Fixed pipeline, no skipping | All 8 phases always run. Agents self-calibrate depth (bug fix = "no changes needed" for docs). |
| Max 5 fix rounds | All check+fix loops (review, QA, final) have a hard 5-round cap to prevent infinite loops. |
| Ground-truth documents persist | `docs/` files survive across sessions. No re-explaining context. |
| Structured schema between agents | Reviewers output `{approved, issues[]}`, QA outputs `{all_passed, issues[{file, error, fix_hint}]}` — downstream agents can execute without parsing prose. |

## Status

Early release. The pipeline runs end-to-end on small-to-medium projects (CLI tools, libraries) with zero human intervention. Larger projects and formal benchmark results (SWE-bench) coming soon.

## Customization

Each agent's behavior is defined in `~/.claude/lights-out/prompts/*.md`. Edit any file to customize:

```
prompts/
├── spec-writer.md         # PRD structure and rules
├── spec-reviewer.md       # What the spec reviewer checks
├── ux-designer.md         # Design document structure
├── design-reviewer.md     # Design review criteria
├── architect.md           # Architecture + ADR format
├── arch-reviewer.md       # Architecture review criteria
├── consistency-reviewer.md # Cross-doc and doc-vs-code checks
├── test-case-designer.md  # Test case format and coverage rules
├── task-splitter.md       # How work is decomposed
├── code-agent.md          # TDD enforcement rules
├── qa-engineer.md         # Verification procedures
└── bug-fixer.md           # Debugging strategy escalation
```

## Methodology Sources

Built on proven open-source practices (not reinvented):

| Source | What we took |
|--------|-------------|
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | ADR format, adversarial review with forced-finding mandate, stakes calibration |
| [Superpowers](https://github.com/obra/superpowers) | TDD iron law ("no code without failing test"), brainstorming gate pattern |
| [GSD](https://github.com/open-gsd/gsd-core) | Task splitting with file ownership, structured planning modes |
| [Harper Reed](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/) | Discrete-loop philosophy, minimal doc count |

## How It Works (Technical)

- `lightsout.md` — Claude Code **command** (interactive, runs in main session)
- `lightsout-workflow.js` — Claude Code **workflow** (background execution, non-interactive)

The command handles brainstorming/clarification (interactive), then launches the workflow (background, fully automated).

## Requirements

- Claude Code CLI (with workflow support)
- git (for installation and worktree isolation)

## Uninstall

```bash
rm -rf ~/.claude/lights-out ~/.claude/workflows/lightsout-workflow.js ~/.claude/commands/lightsout.md
```

## Contributing

PRs welcome. The best contributions are improvements to individual prompt files — if you find a better spec-writing approach or a more effective review strategy, bring it in.

## License

MIT
