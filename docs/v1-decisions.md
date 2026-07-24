# V1 decisions

## Product shape

- The public product and repository are named Voicebook and contain no person-specific names in product interfaces, fixtures, or architecture.
- Each local v1 workspace represents one Voice Owner and one Voice Core. Different people can run separate local workspaces without adding multi-user scope.
- There is one voice per workspace, with contextual tags used to select relevant examples.
- Voicebook is local, review-driven, and Codex-first.

## Voice and curation

- Historical Source Messages remain verbatim. Filtering is the curation mechanism.
- Only explicit acceptance adds a Candidate to the Voice Core.
- Tags are suggested automatically and never block one-click acceptance.
- A Core Message remains stable if its original Source Message later changes or disappears.
- The Voice Core is the source of truth; the Voice Profile is derived and disposable.
- Codex imitates intentional tone, directness, structure, vocabulary, questioning style, uncertainty, links, and evidence use while correcting accidental mistakes and ambiguity.

## Seed and review

- The initial import covers twelve months of selected public and private work channels.
- DMs are individually opted in, and sensitive channels are excluded.
- The initial target is roughly 30–50 varied Core Messages.
- Eligible Manual Messages remain searchable while a small, diverse Suggested Queue prioritizes substantive examples.
- The local browser interface has Inbox and Core sections.

## Context and Materials

- Slack Context is separate and never eligible as voice evidence.
- Voicebook retains Material kind, order, role, labels, relevant links, and source references.
- Historical attachment bytes, OCR output, and permanent previews are not retained.
- Codex can inspect current Materials while drafting when they are available.

## Composition Origin

- An unmatched Source Message is `manual` for Voicebook's purposes.
- An exact canonical match with a Draft Record is automatically `agent`.
- A near match is suggested as `mixed` and requires Voice Owner confirmation.
- Ambiguous matches remain `unknown`.
- Composition Origin records Voicebook participation, not generalized AI detection.
- Agent and Mixed Messages never enter the Voice Core automatically.

## Drafting and integration

- Existing Codex conversations perform drafting; Voicebook has no chat interface.
- A Codex skill and local CLI are the only agent integration required in v1.
- The existing Codex Slack connector performs on-demand synchronization.
- Voicebook has no dedicated Slack credentials, background listener, or continuous hooks.
- A Draft Run returns one ready-to-use Draft Brief and records the exact proposed draft.
- The Voice Owner manually copies or edits the proposal and sends it through normal Slack.
- Voicebook does not send Slack messages.

## Profile and configuration

- Codex generates and refreshes the Voice Profile; Voicebook calls no model directly.
- A refreshed profile becomes active automatically and remains inspectable.
- V1 has no general Settings screen.
- User-facing setup is limited to import scope and sensitive exclusions.
- Ranking, example limits, matching thresholds, queue size, and refresh behavior remain internal defaults.

## Storage, export, and validation

- SQLite is the local source of truth, and credentials are never stored in it.
- Normal local filesystem protection is sufficient for v1.
- Manual export includes Core Messages, tags, Material metadata, and the active Voice Profile.
- Export excludes Candidates, Slack Context, previews, Draft Runs, Draft Records, and credentials.
- No automatic cloud backup is provided.
- V1 is evaluated with ten blind baseline-versus-assisted comparisons and succeeds when assisted drafts are preferred at least seven times without reducing clarity.
