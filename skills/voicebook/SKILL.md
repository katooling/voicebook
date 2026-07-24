---
name: voicebook
description: Synchronize selected Slack history into a local Voicebook and refresh its Voice Profile through Codex and the Voicebook CLI. Use when asked to seed, import, update, sync, resume, generate, or refresh Voicebook; this includes choosing Slack scope, importing only the Voice Owner's messages, and deriving a profile only from accepted Core Messages.
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
- verbatim `text`;
- `context` items containing only `position`, `authorLabel`, and `text`;
- ordered `materials` containing only `ordinal`, `kind`, `role`, and optional `label`, `url`, or `sourceReference`.

Never pass raw connector payloads, attachment bytes, previews, OCR, tokens, credentials, reactions, or unrelated profile data. Include a deletion only when the connector supplies an explicit tombstone for a Source Message already seen in this sync stream. Never infer deletion from absence.

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

## Refresh the Voice Profile

Check whether the saved profile still reflects the accepted Core Messages:

```bash
node --experimental-strip-types src/cli.ts profile status
```

If the status is `missing` or `stale`, prepare a bounded snapshot:

```bash
node --experimental-strip-types src/cli.ts profile prepare
```

Derive a concise profile from only the returned `coreMessages`. Do not add Source Messages, surrounding Slack Context, Materials, pending Candidates, credentials, or facts that are not present in that snapshot. Voicebook performs no model call; Codex does this reasoning.

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
