# Agent guidance

Read `CONTEXT.md` before naming domain concepts, and read relevant records under `docs/adr/` before changing architecture.

Never commit real or derived-from-real Slack messages, surrounding conversation, channel or user identifiers, permalinks, private links, attachment metadata, screenshots, Voice Profiles, Draft Records, evaluation scenarios, local databases, exports, credentials, caches, or logs. Clearly synthetic fixtures for these domain shapes are allowed and required for tests.

## Agent skills

### Issue tracker

Work is tracked in GitHub Issues for `katooling/voicebook`; external pull requests are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` labels. See `docs/agents/triage-labels.md`.

### Domain docs

Voicebook uses a single domain context with root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
