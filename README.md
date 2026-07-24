# Voicebook

Voicebook is a locally stored, explicitly curated record of how a person communicates. It helps Codex draft occasional Slack messages in the Voice Owner's style without changing their normal Slack workflow.

Voicebook is currently in specification. V1 is intentionally local, single-owner, Codex-first, and review-driven.

“Local” describes where Voicebook persists its runtime data; it does not mean offline processing. Selected Slack content passes through the configured Slack connector, and Codex processes accepted Core Messages and Draft Briefs under those services' data policies.

## Core idea

1. Import the Voice Owner's Slack messages through the existing Codex Slack connector.
2. Review Candidates in a local browser and explicitly accept representative Core Messages.
3. Derive a disposable Voice Profile from the accepted Voice Core.
4. Give Codex a ready-to-use Draft Brief containing relevant, truthful examples.
5. Record the proposed draft for later comparison while the Voice Owner sends or edits it manually.

The Voice Core—not generated drafts or the derived profile—is the source of truth.

## Documentation

- `CONTEXT.md` — canonical domain language
- `docs/v1-scope.md` — accepted v1 boundary
- `docs/v1-decisions.md` — resolved product and design decisions
- `docs/adr/` — durable architectural decisions
- `docs/agents/` — issue tracker, triage, and domain-document conventions

## Status

The v1 specification and eight-ticket tracer-bullet plan are complete. Implementation has not begun.
