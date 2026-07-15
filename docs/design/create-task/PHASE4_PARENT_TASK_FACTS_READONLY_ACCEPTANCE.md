# `create_task` Phase 4 Parent Facts Read-Only Acceptance

> Status: P4-A2 real read-only probe and P4-A3 privacy-safe acceptance passed on 2026-07-15<br>
> Scope: fixed-script Parent facts capability only<br>
> Mutation calls: 0

## Authorization and boundary

The user separately authorized P4-A2 after reviewing the Phase 4 architecture revisions, then
authorized P4-A3 after the real read-only matrix completed. This checkpoint proves only that an
unreachable fixed script can read bounded Parent identity, status, hierarchy, containing Project,
and Folder facts from user-approved exact Task IDs.

It does not authorize or publish a Parent destination, handler/service route, feature flag,
mutation primitive, App Refresh, Canary, Tunnel change, or production enablement. The public
`create_task` contract remains V3 and continues to support only explicit Inbox or exact Active
Project placement, optionally with existing validated Tags.

## Probe implementation

The P4-A2 artifacts are deliberately unreachable from MCP runtime:

- `src/utils/omnifocusScripts/probeParentTaskFacts.js`: fixed Omni Automation read script;
- `src/tools/primitives/probeParentTaskFacts.ts`: no-shell local harness with strict Zod envelopes;
- `src/tools/primitives/probeParentTaskFacts.test.ts`: deterministic privacy/static tests;
- `src/tests/integration/parent-facts-readonly.test.ts`: opt-in real-library zero-write gate.

The harness accepts 1–8 user-approved exact IDs through a temporary `0600` JSON file. Raw IDs are
not placed in process arguments or returned evidence, and the temporary file is removed in a
`finally` path. The fixed script performs `Task.byIdentifier` roundtrip, direct/effective
completion and drop reads, bounded parent-chain traversal, Project-root consistency, Project
status mapping, and bounded Folder-chain traversal. It returns only case labels, enums, booleans,
and counts.

No server, Tool definition, handler, service, Ledger, audit, feature flag, or public Schema imports
these artifacts.

## Deterministic and build evidence

Validation after the real API-shape correction passed:

- 59 test files / 836 tests;
- `npm run build`;
- TypeScript no-emit check;
- JXA/JavaScript syntax check;
- strict static checks for exact-ID-only lookup, bounded hierarchy reads, no mutation constructors,
  no collection writes, and no server registration;
- `git diff --check` and untracked-file whitespace checks.

The opt-in integration test also requires the caller-provided case file to have no group/other
permissions and compares pre/post Ledger directory, audit file, and mutation-lock signatures.

## Real read-only matrix

Only privacy-safe facts are retained here. No real name, canonical ID, Project/Folder path, raw
payload, or raw script output is recorded.

| Case | Result | Privacy-safe evidence |
| --- | --- | --- |
| Direct Inbox action | passed | `action`, Available, direct Inbox, no parent, no Project, no completion/drop |
| Project leaf action | passed | `action`, Available, direct Project-root parent, Active Project, two Active Folder ancestors |
| Existing action group | passed | `action_group`, Blocked, two children, one-level Project-root chain, Active Project, two Active Folder ancestors |
| Project root | passed | `project_root`, Blocked, no ordinary parent, Active containing Project relation, two Active Folder ancestors |
| Effective-completed action | passed | Completed, direct completion=false, effective completion=true, completed ancestor=true, two-level chain |
| Folder-backed Task | passed | containing Project present, Project/root relation consistent, Folder depth=2, Active folders=2, Dropped folders=0 |
| Stale synthetic ID | passed fail-closed | exact lookup returned `not_found`; no fallback or alternate search |
| Dropped/effectively dropped Task | unavailable | user-supplied candidate had completion/current-active facts rather than drop facts; full read-only Dropped query returned count=0 |

Every successful facts case reported canonical roundtrip=true and Project-chain consistency=true.
Repeated gated reads returned identical privacy-safe evidence.

The unavailable Dropped case is not treated as synthetic production evidence. The accepted design
made this case conditional on safe availability; P4-B deterministic tests must still simulate
direct drop, inherited/effective drop, dropped ancestor, Dropped Project, and Dropped Folder facts
before any later publication gate.

## Real API-shape finding

The first action-group probe failed closed as `schema_drift`. A privacy-safe type-only diagnostic
showed that Omni Automation exposes `task.children` as a collection object with `length` and `map`,
not as a native JavaScript Array.

The probe adapter was narrowed to require:

```text
children is a non-null object
children.length is a non-negative integer
children.map is a function
```

After this correction, the same user-approved action-group case and the complete available matrix
passed. This matches existing repository scripts that already treat OmniFocus task children as a
collection. It does not require an ADR amendment and does not justify a permissive generic
collection adapter.

## Zero-write and privacy proof

For every gated real-library run:

- `create_task` calls=0;
- mutation constructors and mutation APIs loaded by the probe=0;
- Ledger signature before/after=unchanged;
- audit signature before/after=unchanged;
- mutation-lock signature before/after=unchanged;
- runtime registration, Resources, Tool count, flags, Tunnel, and LaunchAgent changes=0.

Exact IDs existed only in caller-approved reads and ephemeral `0600` input files. The harness
strictly rejects expanded output fields and checks that returned evidence does not contain any
requested ID. Temporary probe and diagnostic files were removed after execution.

## Accepted conclusion and next gate

P4-A2 proves that the real library can expose enough bounded facts to proceed with a separately
reviewed, unpublished P4-B Parent facts reader and eligibility validator. In particular, the read
boundary can distinguish ordinary actions, existing action groups, Project roots, direct Inbox,
Project-root ancestry, effective completion, Active Project state, Folder ancestry, and exact
not-found without mutation or identity leakage.

P4-A3 is accepted for the currently available real-library matrix. This acceptance does not make
an existing `action` eligible as a Parent; Phase 4 first implementation remains frozen to existing
`action_group` only. It also does not resolve the single-stage versus prepare/commit decision,
which remains a P4-C Acceptance gate after a fail-closed V4 Schema publication.

P4-B remains independently gated. It may begin only after explicit implementation authorization
and must remain unpublished and unreachable, preserve V2/V3 Inbox/Project/Tag behavior, separate
facts read from eligibility validation, keep Parent+Tag prevalidation atomic, and implement all
unavailable/unknown/drop/orphan cases deterministically before P4-C can be considered.
