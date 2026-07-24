# Voicebook

Voicebook defines a curated, truthful representation of one person's communication so an occasional Codex-assisted draft can sound like a careful version of that person.

## Language

**Voicebook**:
The collection and review system for a Voice Owner's writing voice.
_Avoid_: Training system, personality model

**Voice Owner**:
The person whose messages define a Voice Core and who decides which Candidates represent them.
_Avoid_: User, profile owner

**Source Message**:
A message published by the Voice Owner in a supported communication source.
_Avoid_: Slack record, Candidate

**Candidate**:
A Source Message available for review but not accepted into the Voice Core.
_Avoid_: Training example, raw sample

**Voice Core**:
The curated set of accepted, verbatim messages that represents the Voice Owner and serves as the source of truth.
_Avoid_: Corpus, training set, core corpus

**Core Message**:
A Candidate that the Voice Owner explicitly accepted into the Voice Core.
_Avoid_: Approved draft, generated example

**Suggested Queue**:
A small, diverse selection of Candidates surfaced for review while the remaining Candidates stay searchable.
_Avoid_: Entire inbox, training queue

**Voice Profile**:
A disposable summary of patterns derived from the Voice Core to help Codex generalize across situations.
_Avoid_: Source of truth, system prompt

**Draft Run**:
One attempt by Codex to draft a message using a specific view of the Voice Core and the communication situation.
_Avoid_: Session, commission

**Draft Brief**:
The ready-to-use writing guidance supplied to Codex for a Draft Run, including derived style guidance and relevant Core Messages.
_Avoid_: Raw context response, prompt fragments

**Draft Record**:
The exact message proposed by Codex for a Draft Run and retained for later comparison with a Source Message.
_Avoid_: Sent message, Core Message

**Composition Origin**:
The best known account of how a Source Message was composed: manual, agent, mixed, or unknown.
_Avoid_: Authorship, provenance

**Manual Message**:
A Source Message that does not match a recorded Voicebook draft.
_Avoid_: Guaranteed human-authored message

**Agent Message**:
A Source Message that exactly matches a recorded Voicebook draft after harmless source-format normalization.
_Avoid_: Core Message, AI-detected message

**Mixed Message**:
A Source Message the Voice Owner confirms was produced by editing a Voicebook draft.
_Avoid_: Automatically inferred edit

**Slack Context**:
Surrounding Slack conversation used to understand a Candidate but never treated as evidence of the Voice Owner's voice.
_Avoid_: Core Message, voice evidence

**Material**:
A link, image, file, or other item used alongside a message as evidence, reference, or instruction.
_Avoid_: Attachment blob, message text
