# Voicebook

Voicebook is a local, explicitly curated record of how a person communicates.
It helps Codex draft occasional Slack messages in the Voice Owner's style
without changing their normal Slack workflow.

The Voice Core—not generated drafts or the derived profile—is the source of
truth. Messages enter it only when the Voice Owner accepts them.

## What v1 does

1. Codex retrieves selected Slack history through its existing Slack connector.
2. Voicebook imports only the Voice Owner's normalized messages into a local
   workspace.
3. A loopback-only browser app suggests a small, varied review queue.
4. The Voice Owner accepts representative messages into the Voice Core.
5. Codex derives an inspectable Voice Profile from that Core.
6. Voicebook builds a small, relevant Draft Brief when the Voice Owner asks for
   help writing a message.
7. Codex records its exact proposal; the Voice Owner copies, edits, and sends it
   normally.
8. Later syncs conservatively label messages as Manual, Agent, Mixed, or
   Unknown based only on known Voicebook participation.

Voicebook has no Slack credentials, background listener, sending permission,
model API key, or model call of its own.

## Requirements

- Node.js 24.2 or newer
- npm
- Codex with access to the Slack connector for real synchronization

## Get started

```bash
git clone https://github.com/katooling/voicebook.git
cd voicebook
npm ci
npm run test:install-browser
npm test
```

Launch the local review app:

```bash
node --experimental-strip-types src/cli.ts review
```

By default, runtime data is stored outside the repository:

- macOS: `~/Library/Application Support/Voicebook`
- Linux: `$XDG_DATA_HOME/voicebook` or `~/.local/share/voicebook`

Use `--workspace PATH` or `VOICEBOOK_WORKSPACE` to select another local
workspace.

## Use it from Codex

The repository includes the [`voicebook` skill](skills/voicebook/SKILL.md).
Make that skill available to Codex using your normal local skill installation
method, then ask Codex to seed, sync, refresh, draft, or evaluate with
Voicebook.

The skill owns the connector-assisted workflow. The stable local commands are:

| Command | Purpose |
| --- | --- |
| `sync status` / `sync --stdin` | Resume or apply a normalized Slack sync page |
| `review` | Open the local Inbox and Voice Core |
| `profile status\|prepare\|submit` | Refresh the derived Voice Profile through Codex |
| `draft start\|finish --stdin` | Build a grounded Draft Brief and record one exact proposal |
| `origin status --source-key KEY` | Inspect known Voicebook participation |
| `evaluate create\|prepare\|submit\|status` | Run the private ten-scenario blind test |
| `export` | Write a private, human-readable backup outside Git worktrees |

Machine-oriented commands read and write JSON. See the skill for the complete
envelopes, retry rules, and privacy boundaries.

## Privacy and trust boundaries

- Runtime databases, evaluations, exports, previews, logs, and credentials are
  ignored by Git.
- Slack Context helps review a Candidate but never becomes voice evidence.
- Historical attachment bytes, previews, and OCR are not stored.
- Private exports contain accepted message text and selected Material metadata;
  they are backups, not sanitized sharing bundles.
- Exact origin matches may be labelled Agent automatically. Edited near matches
  remain suggestions until the Voice Owner confirms Mixed.
- Agent and Mixed messages never enter the Voice Core automatically.
- The blind evaluation remains valid only if the Voice Owner does not watch
  generation payloads or inspect its private evaluation file before finishing.

“Local” describes where Voicebook persists runtime data. Selected Slack content
still passes through the configured Slack connector, and Codex processes
accepted Core Messages and Draft Briefs under those services' data policies.

## Development

```bash
npm test
npm run typecheck
```

Tests exercise the real CLI, isolated temporary workspaces, and the real local
browser UI using synthetic data. No real messages, identifiers, links,
profiles, drafts, or evaluations belong in the repository or its history.

## Documentation

- [`CONTEXT.md`](CONTEXT.md) — canonical domain language
- [`docs/spec.md`](docs/spec.md) — complete v1 product specification
- [`docs/v1-scope.md`](docs/v1-scope.md) — accepted v1 boundary
- [`docs/v1-decisions.md`](docs/v1-decisions.md) — resolved product decisions
- [`docs/adr/`](docs/adr/) — durable architectural decisions
- [`docs/ticket-plan.md`](docs/ticket-plan.md) — tracer-bullet delivery plan

## License

[MIT](LICENSE)
