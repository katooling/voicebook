# Voicebook v1 ticket plan

The tickets below are tracer-bullet slices. Each delivers a demonstrable path through every layer it needs and is sized for one fresh implementation context.

## 1. Curate one Candidate into the Voice Core

**Blocked by:** None — can start immediately.

**What to build:** The smallest working Voicebook path: import one synthetic normalized Source Message through the CLI, review it in the local Inbox, and curate it into the searchable Voice Core.

**Acceptance criteria:**

- [ ] A normalized Source Message can be imported into a fresh local workspace and appears as a Candidate in the browser.
- [ ] Inbox displays verbatim message text, separate Slack Context, and ordered Material metadata.
- [ ] The Voice Owner can accept, reject, mark sensitive, or pin with no mandatory tag entry.
- [ ] Core supports search and explicit removal.
- [ ] Acceptance creates a stable verbatim Core Message; later simulated source changes do not mutate it.
- [ ] The black-box harness drives import through browser-visible curation against a temporary workspace.
- [ ] The browser binds to loopback, rejects non-local Host and Origin values, and protects state-changing requests against cross-origin request forgery.
- [ ] Fixtures are synthetic, runtime state lives outside the worktree, and no credentials or attachment bytes are stored.

## 2. Seed Voicebook from Slack through Codex

**Blocked by:** Ticket 1.

**What to build:** Asking Codex to synchronize Voicebook uses the existing Slack connector and Voicebook skill to populate Candidates without a dedicated Slack app, token, listener, or background process.

**Acceptance criteria:**

- [ ] The skill supports a twelve-month initial import from selected work channels and individually opted-in DMs while honoring sensitive exclusions.
- [ ] Connector results are normalized and passed to the CLI idempotently.
- [ ] Interleaved messages from other authors may be retained only as Slack Context; author validation prevents them from becoming Candidates or Core Messages.
- [ ] Later synchronizations resume safely and reconcile source edits or deletions that the connector can discover.
- [ ] Imported records preserve separate Slack Context and ordered Material metadata without retaining attachment bytes.
- [ ] Partial results and resumable progress are reported without duplicating Candidates.
- [ ] Automated integration uses synthetic connector results; any real connector smoke test keeps private data outside the repository.

## 3. Surface a diverse Suggested Queue

**Blocked by:** Ticket 2.

**What to build:** Inbox becomes a manageable recurring review surface while the complete eligible Candidate history remains searchable.

**Acceptance criteria:**

- [ ] Voicebook surfaces a small, diverse Suggested Queue instead of requiring review of every Candidate.
- [ ] Explanations, questions, disagreements, links, and screenshot evidence are favored.
- [ ] Acknowledgements, logs, code-only items, and near-duplicates are deprioritized but searchable.
- [ ] Suggested contextual tags never block acceptance and can be corrected on Core Messages.
- [ ] Ranking uses local, simple methods without embeddings or a vector database.
- [ ] A fixed synthetic fixture produces deterministic queue results and demonstrates retrieval of a deprioritized Candidate through search.

## 4. Refresh an inspectable Voice Profile through Codex

**Blocked by:** Ticket 2.

**What to build:** Voice Core changes can produce a new disposable Voice Profile through Codex without adding a model API or model credential to Voicebook.

**Acceptance criteria:**

- [ ] Core mutations mark the Voice Profile stale.
- [ ] A later Codex-assisted Voicebook operation obtains only accepted Core Messages and submits a refreshed profile through the CLI.
- [ ] The active profile and stale/current state are inspectable locally.
- [ ] Refresh failure preserves the previous usable profile and never blocks access to Core Messages.
- [ ] Tests exercise stale → submitted → active behavior with synthetic profile text and do not test model internals.

## 5. Draft one Slack message with the Voicebook skill

**Blocked by:** Tickets 3 and 4.

**What to build:** In a normal Codex conversation, the Voice Owner requests a Slack draft, receives Voicebook-grounded guidance, receives a proposal, and retains manual control over sending.

**Acceptance criteria:**

- [ ] The skill begins a Draft Run from an objective plus optional audience, situation, constraint, destination, thread, and current Material hints.
- [ ] Voicebook returns one ready-to-use Draft Brief containing the active Voice Profile and a small relevant selection of Core Messages.
- [ ] Candidate and Slack Context text is never used as voice evidence.
- [ ] The opaque Draft Run preserves the effective evidence and configuration even if the Voice Core changes.
- [ ] Codex records the exact proposed text as a Draft Record associated with the run.
- [ ] The skill and CLI expose no Slack send path.
- [ ] A black-box contract test proves Draft Run → Draft Brief → Draft Record receipt.

## 6. Reconcile normal and Voicebook-assisted Source Messages

**Blocked by:** Tickets 2 and 5.

**What to build:** A later synchronization distinguishes normal workflow from the minority of Source Messages in which Voicebook participated.

**Acceptance criteria:**

- [ ] A Source Message with no eligible Draft Record match is labelled Manual for Voicebook's purposes.
- [ ] An exact match after documented harmless source-format normalization is labelled Agent automatically.
- [ ] A near match is shown with a diff and matching evidence as a Mixed suggestion.
- [ ] Only the Voice Owner can confirm Mixed.
- [ ] Ambiguous or weak competing matches remain Unknown.
- [ ] Time, destination, thread, and ordered Material signals refine matching when available.
- [ ] Agent and Mixed Messages never enter the Voice Core automatically.
- [ ] End-to-end synthetic tests cover manual, exact, near, ambiguous, and false-positive cases.

## 7. Export the portable Voicebook safely

**Blocked by:** Ticket 4.

**What to build:** One manual export produces a useful, human-readable copy of the curated Voicebook without exposing replaceable or sensitive operational data.

**Acceptance criteria:**

- [ ] Export includes verbatim Core Messages, contextual tags, Material metadata, and the active Voice Profile.
- [ ] Export is labelled as a sensitive private backup rather than a sanitized sharing bundle.
- [ ] Export excludes Candidates, Slack Context, previews, attachment bytes, Draft Runs, Draft Records, Slack source references outside message content, credentials, and database internals.
- [ ] Output is deterministic enough for inspection and portability.
- [ ] Generated exports and runtime state are ignored by the public repository.
- [ ] A black-box export test validates required inclusions and forbidden-data exclusions using synthetic content.

## 8. Run the blind ten-scenario success test

**Blocked by:** Ticket 5.

**What to build:** A local evaluation determines whether Voicebook improves voice fidelity rather than merely adding machinery.

**Acceptance criteria:**

- [ ] Ten locally held situations receive one baseline Codex draft and one Voicebook-assisted draft.
- [ ] The evaluation randomizes sides and hides provenance until all choices are recorded.
- [ ] The Voice Owner chooses which draft sounds more like them and compares clarity.
- [ ] Results report whether assisted drafts win at least seven of ten comparisons without reducing clarity.
- [ ] Situations, drafts, and results remain local and are excluded from the public repository.
- [ ] Synthetic fixtures test randomization and scoring.

## Dependency frontier

- Initially: Ticket 1.
- After Ticket 1: Ticket 2.
- After Ticket 2: Tickets 3 and 4.
- After Ticket 4: Ticket 7.
- After Tickets 3 and 4: Ticket 5.
- After Ticket 5: Tickets 6 and 8.
