# Issue tracker: GitHub

Issues and product specifications for this repository live in GitHub Issues at `katooling/voicebook`. Use the `gh` CLI for issue operations.

## Pull requests as a triage surface

External pull requests are not treated as incoming feature requests by the automated triage workflow. Issues are the request surface; pull requests are reviewed through the normal contribution workflow.

## Conventions

- Create, read, comment on, label, and close issues with `gh issue`.
- Infer the repository from the configured Git remote when possible.
- When a skill says to publish to the issue tracker, create a GitHub issue.
- Publish blocking edges with GitHub's native issue dependencies when available; otherwise include explicit `Blocked by` references in the issue body.
