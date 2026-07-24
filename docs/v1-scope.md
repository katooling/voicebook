# V1 scope

The v1 boundary is accepted. Its purpose is to prove that a small, explicitly curated Voice Core makes occasional Codex-assisted Slack drafts sound more like a careful version of the Voice Owner.

## Included

- A reusable public product whose local workspace represents one Voice Owner
- A Codex skill backed by a local Voicebook CLI
- Slack import through the existing Codex Slack connector
- A twelve-month seed import from selected work channels and individually opted-in DMs
- Local SQLite storage
- A local browser interface with Inbox and Core sections
- Explicit curation of verbatim Core Messages
- A Codex-generated Voice Profile
- Draft Runs that return a ready-to-use Draft Brief and retain the proposed Draft Record
- Later comparison between Draft Records and synchronized Source Messages
- Manual copy and paste into Slack
- A portable manual export of the Voice Core and Voice Profile
- A blind ten-scenario comparison against normal Codex drafting

## Excluded

- A dedicated Slack app, Slack token, background listener, or continuous event hooks
- Automatic Slack sending
- MCP
- Hosting, multiple Voice Owners in one workspace, or cloud synchronization
- Embeddings or vector search
- Permanent historical attachment downloads or OCR
- A separate model API inside Voicebook
- General settings and tuning controls
- Automatic cloud backup

Anything excluded is a possible later version only after v1 passes its success test.
