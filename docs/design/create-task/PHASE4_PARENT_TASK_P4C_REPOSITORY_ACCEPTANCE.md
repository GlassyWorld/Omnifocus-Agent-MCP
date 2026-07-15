# `create_task` Phase 4 P4-C Fail-Closed Repository Acceptance

> Status: REPOSITORY PASS (2026-07-15)<br>
> Runtime/deployment status: NOT DEPLOYED; production remains V3<br>
> Client/App acceptance: NOT RUN

## 1. Result

The repository-side P4-C implementation is complete. The registered `create_task` source contract
is now V4 with one strict three-way destination union:

```text
inbox | exact Project canonical ID | exact ordinary Parent Task canonical ID
```

Parent placement is guarded by `OMNIFOCUS_CREATE_TASK_PARENT_ENABLED`, which fails closed unless
its value is exactly lowercase `true`. No production environment, LaunchAgent, Tunnel profile, or
loaded process was changed in this phase.

This document records local repository and in-memory MCP evidence only. It does not claim that the
deployed ChatGPT/App-visible Tool has refreshed from V3 to V4.

## 2. Public Contract Evidence

Local in-memory MCP `tools/list` confirms:

- `create_task` input remains a strict object with required `name`, `destination`, and
  `idempotencyKey`;
- destination has exactly three strict variants: `inbox`, `project`, and `parentTask`;
- the Parent variant requires only `kind` and `parentTaskId` and rejects Project fields, names,
  paths, aliases, and extras;
- output location has exactly three compact variants;
- Parent output contains `parentTaskId`, `parentTaskName`, and nullable containing
  `projectId/projectName`, but no Folder path or parent chain;
- optional `tagIds` remains bounded to 1-5 canonical IDs;
- Tool annotations are unchanged;
- personal-production remains exactly five read Tools plus the existing `create_task`, with
  Resources absent and no new mutation Tool.

## 3. Fail-Closed Routing Evidence

The handler order is frozen and tested as:

```text
strict V4 parse
  -> effective idempotency key
  -> pure canonicalization
  -> global flag
  -> Project flag OR Parent flag, according to destination
  -> Tag flag, when tagIds is present
  -> branch-specific service
```

Evidence includes:

- absent/empty/non-lowercase Parent flag returns
  `write_disabled.parent_placement_disabled`;
- disabled Parent requests return `mayHaveWritten=false` and `retrySafe=false`;
- disabled Parent+Tag checks Parent before Tag;
- Parent inside a Project does not require the Project placement flag;
- disabled Parent paths do not call the service, facts reader, Ledger, lock, JXA executor, or
  readback;
- privacy-safe audit output contains only the existing allowlist and the reason-qualified result;
- Parent no-tag, Parent-tagged, existing no-tag, and existing tagged responses use separate strict
  runtime success parsers.

## 4. Agent and UI Contract

Registration description and personal-production instructions now require:

- a fresh exact `get_task` result in the same user intent;
- canonical Parent ID only;
- existing `action_group` only for the first version;
- immediate restatement of Parent name/kind, containing Project/available Folder context, and
  available distinguishing parent-chain context;
- no leaf Action, Project root, name/path lookup, fuzzy match, guessed ID, or fallback;
- no edit, move, reparent, complete, delete, batch, repeat, notification, or generic CRUD;
- existing Tag discovery, full-path confirmation, and ancestor-active semantics remain unchanged.

These instructions are not evidence that the real client UI binds the displayed context to the
opaque Parent ID correctly. That decision remains reserved for disabled App/UI acceptance.

## 5. Validation

- 66 test files / 923 tests: PASS;
- `npm run build`: PASS;
- `npx tsc --noEmit`: PASS;
- all JXA files compiled with `osacompile -l JavaScript`: PASS;
- `git diff --check`: PASS;
- local MCP wire-schema inspection: PASS.

No Parent JXA script was executed against OmniFocus. No `create_task` call was made. No OmniFocus
object, Ledger/audit/lock runtime state, feature-flag configuration, Tunnel process, or Accepted ADR
was modified. No commit or push was made.

## 6. Subsequent P4-C Acceptance Gate

This repository record stopped before deployment. The later separately authorized gate required:

1. deploy/refresh only with Parent flag absent or false;
2. verify the live Tool remains six Tools, Resources absent, and the wire Schema is V4;
3. run the disabled App/UI target-binding scenarios;
4. prove `write_disabled.parent_placement_disabled` and zero Ledger/lock/JXA/mutation on the live
   path;
5. record whether the user can reliably associate the restated Parent context with the exact ID.

That later gate passed and is recorded in
[P4-C Disabled Client Acceptance](./PHASE4_PARENT_TASK_P4C_DISABLED_CLIENT_ACCEPTANCE.md).
Single-stage exact-ID flow remains the candidate for a separately authorized P4-D Canary; this
historical repository acceptance still does not authorize that Canary or formal enablement.
