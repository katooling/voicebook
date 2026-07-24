# Voicebook v1 specification

## Problem Statement

Most Slack messages are written manually, while Codex is used only occasionally for drafting. Generic Codex drafts do not consistently reflect the Voice Owner's intentional communication style: tone, directness, structure, vocabulary, questioning style, expression of uncertainty, and use of links or screenshot evidence.

The Voice Owner already has a truthful body of historical messages but no simple way to select the examples that genuinely represent them, retain just enough context and Material-use patterns to understand those examples, and make a small relevant subset available to Codex. Supplying an uncurated archive would introduce noise, privacy risk, and self-reinforcement from agent-generated text.

Voicebook must preserve the Voice Owner's normal Slack workflow, keep them in control of the source evidence, and help Codex draft occasional messages as a careful version of that person. The public project must support separate people running their own local single-owner workspaces without person-specific names or fixtures.

## Solution

Build Voicebook as a local, single-owner curation and retrieval application.

Local means that Voicebook persists its runtime state on the Voice Owner's machine. It does not mean offline processing: selected Slack content passes through the configured Slack connector, while accepted Core Messages and Draft Briefs are processed by Codex under those services' data policies.

A Codex skill uses the existing Slack connector to retrieve messages from selected work channels and individually opted-in direct-message conversations. The skill converts connector results into a generic import contract and passes them to the local Voicebook CLI. Imported Source Messages become Candidates.

A local browser interface presents a small, diverse Suggested Queue. The Voice Owner can accept a representative Candidate into the Voice Core, reject it, mark it sensitive, or pin it as especially representative. The complete eligible history remains searchable.

The Voice Core contains only explicitly accepted, verbatim Core Messages and remains the source of truth. Slack Context is retained separately for interpretation and never becomes voice evidence. Material metadata preserves how the Voice Owner uses links, images, and files without permanently storing historical attachment bytes.

Codex derives a disposable Voice Profile from the Voice Core. When drafting, the Codex skill begins a Draft Run through the CLI. Voicebook returns one ready-to-use Draft Brief containing the active Voice Profile and a small relevant selection of Core Messages. Codex records its exact proposal as a Draft Record, and the Voice Owner manually copies or edits it before posting through normal Slack.

A later synchronization compares Source Messages with recent Draft Records. Exact canonical matches are labelled `agent`; near matches are proposed as `mixed` for Voice Owner confirmation; unmatched messages are labelled `manual` for Voicebook's purposes; ambiguous cases remain `unknown`. No Agent or Mixed Message enters the Voice Core automatically.

## User Stories

1. As a Voice Owner, I want Voicebook to run locally, so that my communication history remains under my control.
2. As a Voice Owner, I want my workspace to represent only my voice, so that v1 remains understandable and private.
3. As a different Voice Owner, I want to create my own independent workspace, so that the public product is reusable without person-specific code.
4. As a Voice Owner, I want Voicebook to leave my normal Slack workflow unchanged, so that it does not become daily overhead.
5. As a Voice Owner, I want Codex to use Voicebook only when I request a draft, so that agent assistance remains occasional and intentional.
6. As a Voice Owner, I want one Voice Core rather than separate personas, so that the system stays coherent.
7. As a Voice Owner, I want contextual tags on Core Messages, so that one Voice Core can support different situations.
8. As a Voice Owner, I want to import the previous twelve months of my messages, so that I can create an initial Voice Core quickly.
9. As a Voice Owner, I want to select eligible public and private work channels, so that unrelated spaces are excluded.
10. As a Voice Owner, I want each direct-message conversation to require explicit opt-in, so that private conversations are not imported broadly.
11. As a Voice Owner, I want to exclude sensitive channels, so that their messages never become Candidates.
12. As a Voice Owner, I want only messages I published to become Candidates, so that another person's words are never mistaken for my voice.
13. As a Voice Owner, I want imported Source Messages to remain verbatim, so that accepted examples remain truthful evidence.
14. As a Voice Owner, I want Slack Context kept separate from Candidates, so that context helps interpretation without becoming voice evidence.
15. As a Voice Owner, I want links, images, and files represented as ordered Materials, so that Voicebook captures how I communicate with evidence.
16. As a Voice Owner, I want Material metadata to preserve type, order, role, label, relevant link data, and source reference, so that evidence-use patterns remain understandable.
17. As a Voice Owner, I want historical attachment bytes excluded from permanent storage, so that Voicebook minimizes privacy and storage risk.
18. As a Voice Owner, I want import to be repeatable, so that synchronizing again does not duplicate Candidates.
19. As a Voice Owner, I want later synchronizations to reconcile source changes that the connector can discover, so that pending Candidates remain current.
20. As a Voice Owner, I want accepted Core Messages to remain stable local copies, so that source changes do not silently alter my Voice Core.
21. As a Voice Owner, I want an Inbox in a local browser, so that reviewing messages, context, links, and Materials is comfortable.
22. As a Voice Owner, I want a small Suggested Queue instead of every message demanding review, so that curation remains manageable.
23. As a Voice Owner, I want explanations, questions, disagreements, links, and screenshot evidence prioritized, so that high-signal examples surface first.
24. As a Voice Owner, I want acknowledgements, code-only messages, pasted logs, and near-duplicates deprioritized but searchable, so that history remains available without overwhelming review.
25. As a Voice Owner, I want to accept a Candidate with one action, so that creating the Voice Core is fast.
26. As a Voice Owner, I want acceptance to require no manual categorization, so that tags never become friction.
27. As a Voice Owner, I want contextual tags suggested automatically, so that retrieval can improve without extensive data entry.
28. As a Voice Owner, I want to reject a Candidate, so that unrepresentative messages stay outside the Voice Core.
29. As a Voice Owner, I want to mark a Candidate sensitive, so that it is excluded from voice use.
30. As a Voice Owner, I want to pin an especially representative Core Message, so that its importance is explicit.
31. As a Voice Owner, I want to search all eligible Candidates, so that I can find useful messages outside the Suggested Queue.
32. As a Voice Owner, I want to search the Voice Core, so that I can inspect the system's source of truth.
33. As a Voice Owner, I want to remove a Core Message explicitly, so that I control what represents me.
34. As a Voice Owner, I want an initial target of roughly 30–50 varied Core Messages, so that v1 is useful without exhaustive curation.
35. As a Voice Owner, I want Codex to derive an inspectable Voice Profile, so that recurring patterns can guide drafting.
36. As a Voice Owner, I want the Voice Profile to be disposable and regenerable, so that it never replaces the accepted evidence.
37. As a Voice Owner, I want the previous usable profile and Core Messages to remain available if refresh fails, so that derived-data failure does not block drafting.
38. As a Voice Owner, I want Voicebook to require no separate model API key, so that Codex remains responsible for language reasoning.
39. As a Voice Owner, I want the Codex skill to begin a Draft Run with the objective and relevant situation, so that the guidance fits the current message.
40. As a Voice Owner, I want optional audience, conversation, destination, thread, constraint, and Material hints included when known, so that Voicebook can choose relevant examples.
41. As a Voice Owner, I want each Draft Run to use a stable view of its evidence and configuration, so that its Draft Record can be interpreted consistently later.
42. As Codex, I want one ready-to-use Draft Brief, so that I do not need to assemble Voicebook's internal profile and example fragments.
43. As Codex, I want only a small relevant set of Core Messages, so that drafting is grounded without loading the complete Voice Core.
44. As a Voice Owner, I want simple contextual retrieval before embeddings, so that v1 remains transparent and lightweight.
45. As a Voice Owner, I want Codex to imitate my intentional tone, directness, structure, vocabulary, questions, uncertainty, and evidence use, so that drafts sound like me.
46. As a Voice Owner, I want Codex to improve accidental typos, broken grammar, ambiguity, missing information, and unintended rudeness, so that it sounds like a careful version of me.
47. As Codex, I want to record the exact proposed message against its Draft Run, so that Voicebook can compare it with later Source Messages.
48. As a Voice Owner, I want to copy, edit, and paste the proposal manually, so that I retain final control and Voicebook needs no sending permission.
49. As a Voice Owner, I want messages written directly in Slack to require no Voicebook action, so that my usual workflow remains untouched.
50. As a Voice Owner, I want later synchronization to compare Source Messages with recent Draft Records, so that Voicebook can track whether it participated.
51. As a Voice Owner, I want harmless source-format differences normalized, so that a pasted draft can still be recognized.
52. As a Voice Owner, I want an exact canonical match automatically labelled `agent`, so that obvious Voicebook use requires no review.
53. As a Voice Owner, I want a near match suggested as `mixed`, so that edits to a Voicebook draft can be recognized.
54. As a Voice Owner, I want to confirm a `mixed` suggestion, so that Voicebook does not make subjective composition judgments without me.
55. As a Voice Owner, I want unmatched Source Messages labelled `manual` for Voicebook's purposes, so that my normal messages remain primary evidence.
56. As a Voice Owner, I want ambiguous matches labelled `unknown`, so that Voicebook does not overstate certainty.
57. As a Voice Owner, I want Composition Origin to describe Voicebook participation rather than generalized AI detection, so that the labels remain honest.
58. As a Voice Owner, I want Agent and Mixed Messages excluded from the Voice Core by default, so that Voicebook does not learn its own output.
59. As a Voice Owner, I want explicit acceptance to remain the only promotion path, so that Composition Origin and voice suitability remain separate judgments.
60. As a Voice Owner, I want on-demand synchronization through Codex, so that Voicebook needs no dedicated Slack app, token, listener, or background process.
61. As a Voice Owner, I want setup limited to import scope and sensitive exclusions, so that v1 has no unnecessary settings surface.
62. As a Voice Owner, I want ranking, thresholds, queue size, and refresh behavior to use internal defaults, so that I do not need to tune the system.
63. As a Voice Owner, I want a human-readable export of the Voice Core, tags, Material metadata, and Voice Profile, so that my curated work is portable.
64. As a Voice Owner, I want exports to omit Candidates, Slack Context, previews, Draft Runs, Draft Records, and credentials, so that exports minimize sensitive data.
65. As a Voice Owner, I want ten realistic situations evaluated blindly, so that I can test whether Voicebook improves voice fidelity.
66. As a Voice Owner, I want v1 to succeed only when assisted drafts win at least seven comparisons without reducing clarity, so that the product has a concrete threshold.
67. As a contributor, I want public fixtures and examples to be entirely synthetic, so that development never exposes a Voice Owner's private data.
68. As a contributor, I want runtime data stored outside the repository and ignored defensively, so that accidental publication is less likely.

## Implementation Decisions

- Voicebook is a reusable public product whose local v1 workspace represents one Voice Owner and one Voice Core.
- The Voice Core, not the Voice Profile or Draft Records, is the authoritative representation of the Voice Owner.
- Candidates become Core Messages only through explicit Voice Owner acceptance.
- Historical Source Messages remain verbatim. Curation filters truthful examples rather than maintaining edited historical variants.
- One Voice Core supports all situations. Contextual tags guide selection rather than creating separate profiles.
- Tags are suggestions and never block acceptance.
- Slack Context is represented separately and is never eligible for the Voice Core.
- Materials are represented separately from message text and preserve order, kind, role, label, relevant link metadata, and source references.
- Historical Material bytes, OCR results, and permanent previews are not stored.
- A generic normalized import contract separates Codex Slack synchronization from Voicebook's domain behavior.
- The existing Codex Slack connector is the only Slack integration in v1. The Codex skill retrieves accessible Slack data and supplies normalized import records to the CLI.
- Import is idempotent and reconciles known source changes by stable source identity.
- Reconciliation of edits and deletions is best effort because the connector may not expose every historical tombstone.
- A changed pending Candidate follows the latest state discoverable through synchronization. An accepted Core Message remains an independent local copy.
- The initial import covers twelve months, selected work channels, individually opted-in DMs, and sensitive exclusions.
- The Suggested Queue is a ranked, diverse view over eligible Candidates rather than a separate source of truth.
- Substantive explanations, questions, disagreement, links, and screenshot evidence are favored. Short acknowledgements, logs, code-only content, and near-duplicates are deprioritized.
- The local browser interface has Inbox and Core sections.
- The browser server binds to loopback by default, rejects non-local Host and Origin values, and protects every state-changing request against cross-origin request forgery.
- The CLI launches the review interface and supplies machine-readable commands for Codex integration.
- The tokenless browser cannot independently fetch private Slack data. Any transient preview must arrive through the connector-assisted synchronization flow; a source link and metadata are the fallback.
- Codex generates and refreshes the Voice Profile from Core Messages. Voicebook stores and exposes the active profile but calls no model.
- Core changes mark the profile stale. A later Codex-assisted Voicebook operation refreshes it; failure retains the previous usable profile.
- A Draft Run accepts an objective and optional audience, context, constraints, destination or thread hints, and current Material descriptions.
- A Draft Run pins the effective voice evidence and configuration through an opaque identifier.
- Voicebook renders one Draft Brief for Codex. Profile structure, example selection, ordering, and prompt assembly remain internal.
- Codex records the exact proposal as a Draft Record associated with the Draft Run.
- The Voice Owner manually copies or edits the proposal and sends it through normal Slack.
- Synchronization compares Source Messages with eligible recent Draft Records using author, time, destination or thread when known, Material shape, and text.
- Exact matching uses deterministic canonicalization for harmless whitespace, Unicode, and source-format differences. Mention-wrapper variants match only when they retain the same stable member ID. Labelled link wrappers match only when they retain both the exact URL and visible label; display-name identity is never inferred.
- Exact canonical matches are automatically classified as `agent`.
- Near matches are surfaced as `mixed` suggestions and require explicit confirmation.
- Unmatched messages are classified as `manual` for Voicebook's purposes; ambiguous cases remain `unknown`.
- Composition Origin records known Voicebook participation, not general AI authorship.
- Agent and Mixed Messages never enter the Voice Core automatically.
- Retrieval starts with contextual tags and deterministic lexical or metadata matching. Embeddings and vector storage are excluded.
- User-visible configuration is limited to source selection, per-DM opt-in, import range, and sensitive exclusions.
- Ranking weights, example limits, matching thresholds, Suggested Queue size, and refresh policy are internal defaults.
- Credentials are never stored in SQLite. Voicebook must avoid logging complete source payloads, private content, or secrets.
- Runtime data lives outside the Git worktree by default.
- Manual export is a private portable backup, not a sanitized sharing bundle. It includes Core Messages, contextual tags, Material metadata, and the active Voice Profile. It excludes Candidates, Slack Context, previews, Draft Runs, Draft Records, Slack source references outside message content, credentials, and database internals.
- Application-level database encryption and automatic cloud backup are excluded from v1.

## Testing Decisions

- The principal automated seam is the installed application boundary.
- One black-box acceptance harness runs the real CLI against an isolated temporary Voicebook workspace, supplies synthetic normalized source records, starts the real browser app over the same state, and observes CLI results, browser behavior, and exported artifacts.
- Tests assert externally meaningful state transitions and visible outcomes rather than SQLite tables, private classes, or ranking internals.
- Browser tests cover import visibility, Suggested Queue review, acceptance, rejection, sensitive exclusion, pinning, Core search, removal, and separate Material/context presentation.
- Browser boundary tests prove loopback-only binding, non-local Host and Origin rejection, and protection for state-changing requests.
- Process-level tests cover idempotent import, discoverable pending-message updates, stable accepted Core Messages, persistence across restart, and deterministic export.
- Drafting-flow tests cover Draft Run creation, Draft Brief delivery, Draft Record storage, stable run identity, and stale-profile fallback.
- Matching tests cover exact canonical matches, source-format normalization, near-match suggestions, ambiguity, unmatched Manual Messages, and explicit Mixed confirmation.
- Boundary tests prove that Slack Context, rejected or sensitive Candidates, Agent Messages, Mixed Messages, and other people's messages cannot enter the Voice Core automatically.
- Export tests prove both required inclusions and forbidden-data exclusions.
- Synthetic fixtures cover public channels, private channels, opted-in and excluded DMs, threads, edits, links, one image, ordered multiple images, and representative long and short messages.
- No real Slack content, identifiers, links, screenshots, tokens, company data, Voice Profiles, Draft Records, or evaluations may be used in fixtures or snapshots.
- The Codex skill is exercised through the stable machine-readable CLI contract. Tests do not assert exact model wording.
- Product success is measured separately through ten blind comparisons between normal and Voicebook-assisted Codex drafts.
- Voicebook passes the product test when assisted drafts are preferred at least seven times and do not reduce clarity.
- The implementation repository is empty, so no testing prior art exists. The first tracer slice establishes the black-box harness and synthetic fixture conventions.

## Out of Scope

- A dedicated Slack application or Slack credentials managed by Voicebook
- Socket Mode, continuous event hooks, background listeners, or automatic synchronization
- Sending or editing Slack messages through an API
- MCP integration
- Agent hosts other than Codex
- A Voicebook chat interface
- Multiple Voice Owners in one workspace
- Hosting, remote access, or cloud synchronization
- Embeddings, semantic-vector retrieval, or a vector database
- Permanent historical attachment downloads, previews, or OCR
- A separate model API or model key inside Voicebook
- General settings, ranking controls, threshold tuning, or prompt-template editing
- Automatic promotion into the Voice Core
- Generalized AI-text detection
- Application-level database encryption
- Automatic export scheduling or cloud backup
- A guarantee that every Slack edit or deletion is discoverable without a dedicated integration

## Further Notes

- Use the canonical language in `CONTEXT.md`; in particular, do not describe the Voice Core as a training set.
- `manual` means no matching Voicebook Draft Record, not proof that no other AI tool was involved.
- The initial target of 30–50 Core Messages and the Suggested Queue size are guidance, not hard limits.
- Current-Material understanding belongs to Codex during the live drafting situation. Voicebook primarily preserves historical Material-use patterns.
- Exports can still contain private message text and links. Voice Owners must treat them as sensitive local backups.
- Exact CLI envelopes, framework choices, canonicalization details, match windows, diversity heuristics, automatic-tagging mechanisms, local port selection, and export encoding are implementation judgments as long as they preserve this specification.
- The repository and its history must never contain real Source Messages, Slack Context, workspace identifiers, private links, attachment previews, Voice Profiles, Draft Records, evaluations, databases, exports, credentials, caches, logs, or absolute local paths.
- Any future change that expands the accepted v1 boundary requires a new product decision rather than silent implementation scope.
