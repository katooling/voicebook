---
name: voicebook
description: Synchronize selected Slack history, refresh a Voice Profile, ground an occasional Codex draft, and run a blind local voice evaluation through the Voicebook CLI. Use when asked to seed, import, sync, refresh, draft, or evaluate with Voicebook; this includes importing only the Voice Owner's messages, deriving a profile only from accepted Core Messages, recording a proposal without sending it, and comparing baseline with Voicebook-assisted drafts.
---

# Voicebook

Synchronize on demand. Voicebook has no Slack credential, background listener, sending permission, or model call.

## Establish scope

1. Reuse an already confirmed scope. Otherwise ask for:
   - selected public or private work channels;
   - individually opted-in direct-message conversations;
   - sensitive conversations to exclude.
2. Default `windowStart` to exactly twelve months before the sync begins.
3. Resolve the Voice Owner's stable Slack user ID through the connector. Never use a display name as `voiceOwnerAuthorKey`.
4. Use one stable, non-secret `syncKey` for the Slack source stream. Reuse it across later catch-up synchronizations.

Before fetching, inspect persisted progress:

```bash
node --experimental-strip-types src/cli.ts sync status --sync-key SYNC_KEY
```

If the stream is not found, start with a null cursor. If status is `partial`, resume the connector from `resumeCursor` with the same scope. If status is `complete`, start a new generation with a null cursor; the new generation may use an updated scope.

## Fetch and normalize

Fetch connector results one page at a time. Preserve the connector continuation only as an opaque value. Pass it only between the connector and Voicebook's machine-readable JSON; never include it in human progress, prose, logs, or exports, and never place credentials in it.

Each root `sourceMessages` item must be authored by the Voice Owner. Put interleaved messages from other authors only in that item's `context`. Reject and rebuild the page if any root author differs.

Pass one JSON object to `voicebook sync --stdin`:

```json
{
  "schemaVersion": 1,
  "syncKey": "non-secret-run-key",
  "pageKey": "page-0001",
  "cursor": null,
  "nextCursor": "opaque-or-null",
  "voiceOwnerAuthorKey": "stable-owner-id",
  "scope": {
    "windowStart": "ISO-8601 timestamp",
    "selectedConversationKeys": ["selected-channel-id"],
    "optedInDirectMessageKeys": ["explicitly-opted-in-dm-id"],
    "excludedConversationKeys": ["excluded-conversation-id"]
  },
  "sourceMessages": []
}
```

For each Source Message, send only:

- `sourceKey`, `authorKey`, `publishedAt`, and optional `deleted: true`;
- `conversation: { key, kind }`, where `kind` is `channel` or `directMessage`;
- optional `threadKey` only when the connector provides a stable thread identifier comparable to the Draft Run's `thread`;
- verbatim `text`;
- `context` items containing only `position`, `authorLabel`, and `text`;
- ordered `materials` containing only `ordinal`, `kind`, `role`, and optional `label`, `url`, or `sourceReference`.

Never pass raw connector payloads, attachment bytes, previews, OCR, tokens, credentials, reactions, or unrelated profile data. Include a deletion only when the connector supplies an explicit tombstone for a Source Message already seen in this sync stream. Never infer deletion from absence.

Use the same stable conversation identifier for a Draft Run's `destination` and a synced Source Message's `conversation.key` when it is available. Do not compare display names with stable identifiers, derive a thread from `sourceKey`, or invent missing destination, thread, or Material metadata.

Keep mention text exactly as the connector supplies it. Voicebook does not normalize mentions because a display name cannot be safely inferred to represent the same stable person identifier.

Run from the Voicebook repository:

```bash
node --experimental-strip-types src/cli.ts sync --stdin
```

Keep each encoded page below 4 MiB. Keep the same `pageKey` and exact normalized page for a retry. Make every new `pageKey` unique within the stable sync stream, including across later generations. Use the status continuation for the next connector page. A null `nextCursor` completes the current generation.

## Handle receipts

- `partial`: keep `resumeCursor` in machine context, fetch, and submit the next connector page.
- `complete`: report aggregate counts and stop. A future on-demand sync may start a new generation on the same stream.
- Lost response: resubmit the exact same page; Voicebook returns its prior receipt without repeating effects.
- Failure: do not skip ahead. Correct the page and retry from the same continuation.

Report only aggregate receipt counts. Do not paste Source Messages, Slack Context, Materials, identifiers, or continuations into progress updates.

Synchronization also updates Composition Origin. `manual` means that no plausible recent Voicebook Draft Record matched; it is not a claim about other tools. One supported exact source-format match may become `agent`. A near match remains `unknown` until the Voice Owner reviews the visible diff and confirms `mixed` in the local browser. Never confirm Mixed on the Voice Owner's behalf.

## Refresh the Voice Profile

Check whether the saved profile still reflects the accepted Core Messages:

```bash
node --experimental-strip-types src/cli.ts profile status
```

If the status is `missing` or `stale`, prepare a bounded snapshot:

```bash
node --experimental-strip-types src/cli.ts profile prepare
```

Derive a concise profile from only the returned `coreMessages`, including their allowlisted ordered Material metadata when it demonstrates evidence-use patterns. Do not add Source Messages, surrounding Slack Context, attachment bytes, pending Candidates, credentials, or facts that are not present in that snapshot. Voicebook performs no model call; Codex does this reasoning.

Submit the finished text with the exact `coreRevision` returned by `profile prepare`:

```bash
node --experimental-strip-types src/cli.ts profile submit --stdin
```

```json
{
  "schemaVersion": 1,
  "basisRevision": "7",
  "text": "Concise description of the Voice Owner's demonstrated writing patterns."
}
```

If submission reports `CORE_CHANGED`, discard the generated text, run `profile prepare` again, and regenerate from the new snapshot. A failed generation or submission leaves the previously saved profile usable. Never overwrite it with a profile based on an older Core revision.

## Draft a message

Before drafting, run `profile status`. If the profile is `missing` or `stale`, follow the refresh steps above first. If refresh fails but a stale profile remains, Voicebook can still use that last usable profile.

Begin one Draft Run by passing the known situation through standard input:

```bash
node --experimental-strip-types src/cli.ts draft start --stdin
```

```json
{
  "schemaVersion": 1,
  "requestKey": "stable-non-secret-request-key",
  "objective": "Ask whether the copy is safe to run now.",
  "audience": "Service on-call",
  "situation": "A maintenance window may overlap the operation.",
  "constraints": ["one clear question"],
  "destination": "selected-channel",
  "thread": "known-thread",
  "currentMaterials": [
    {
      "kind": "image",
      "role": "evidence",
      "description": "Current screenshot showing the warning"
    }
  ]
}
```

Omit optional fields that are unknown. Reuse `requestKey` only to retry the exact same input. Treat the returned `draftBrief` as one complete instruction: do not fetch Candidates or Slack Context, add other voice examples, or assemble a second prompt from Voicebook internals. Current Materials describe this situation; they are not voice evidence.

Write one proposed Slack message in Codex. Then record its exact text, including line breaks:

```bash
node --experimental-strip-types src/cli.ts draft finish --stdin
```

```json
{
  "schemaVersion": 1,
  "runId": "opaque-run-id-from-draft-start",
  "text": "The exact proposed message."
}
```

An exact retry returns the original receipt. Never submit different text to an already finished run. Voicebook does not send or edit Slack messages. Show the proposal to the Voice Owner and tell them to copy or edit it manually before sending through normal Slack.

## Run the blind evaluation

Create one evaluation with exactly ten locally held scenarios:

```bash
node --experimental-strip-types src/cli.ts evaluate create --stdin
```

Pass `schemaVersion: 1`, a non-secret `evaluationKey`, a fresh random `seed`, and ten scenario objects using the Draft Run situation fields. Keep scenarios and command payloads local; never add them to the repository.

For each scenario, use `evaluate prepare --stdin` once with `variant: "baseline"` and once with `variant: "assisted"`. Generate each draft in a fresh, isolated Codex context, then record it with `evaluate submit --stdin`. Give both contexts the complete returned instruction and nothing else. Do not let the baseline context see the Voice Profile, Core Messages, assisted instruction, or assisted output.

```json
{"schemaVersion":1,"evaluationKey":"opaque-run-key","scenarioKey":"scenario-1","variant":"baseline"}
```

Submit the same fields plus `"text": "the exact generated draft"`. Use neutral, non-secret scenario keys. Exact preparation and submission retries are idempotent; never replace a pinned instruction or recorded draft.

The assisted preparation reuses Voicebook's production selector and Draft Brief renderer without recording an evaluation situation or proposal as a production Draft Run. Voicebook calls no model. During collection, do not show the Voice Owner either draft, its variant, or partial results.

After all twenty drafts are recorded, start the normal review server and open:

```bash
node --experimental-strip-types src/cli.ts review
```

```text
/evaluation?key=EVALUATION_KEY
```

Let the Voice Owner complete all ten neutral Side A/Side B comparisons. Report only the final revealed result. The evaluation passes when the assisted draft wins at least 7 of 10 voice choices and its mean clarity score is not below baseline.

Blindness depends on the Voice Owner not watching generation commands or inspecting private evaluation state in the local Voicebook database. If that happens, create a new evaluation rather than treating the run as blind.
