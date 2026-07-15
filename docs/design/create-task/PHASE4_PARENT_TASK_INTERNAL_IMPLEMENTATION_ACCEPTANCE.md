# `create_task` Phase 4 P4-B Internal Implementation Acceptance

> Status: PASS (2026-07-15)<br>
> Scope: unpublished and unreachable Parent placement internals only<br>
> Production effect: none; public `create_task` remains V3 and rejects `parentTask`

## 1. Result

P4-B is complete at the internal review gate. The repository now contains a dedicated Parent
facts reader, eligibility validator, Parent-only canonical payload and split fingerprint,
Parent+Tag mutation primitive, placement verifier, and `CreateParentTaskService` with deterministic
Ledger/replay tests.

This acceptance does not authorize P4-C Schema publication, a Parent feature flag, handler or
registration routing, App Refresh, deployment, Tunnel changes, a Canary, or any OmniFocus write.

## 2. Implemented Boundary

- `createParentTaskSchemas.ts` defines an internal strict Parent-only input; it is not exported by
  the registered Tool.
- `createParentTaskCanonicalizer.ts` uses `create_task:v4:parent` and
  `create_task:v4:parent_tagged`; existing V2/V3 fingerprints are unchanged.
- `readParentTaskFacts.ts` and `readParentTaskFacts.js` implement the fixed exact-ID production
  facts boundary with a `0600` payload file and strict bounded result adapter.
- `parentDestination.ts` separates facts read from eligibility and makes only `query_failed`
  retryable for Parent validation.
- `createTaskUnderParent.ts` and `createTaskUnderParent.js` validate Parent, hierarchy,
  Project/Folder context, and all optional Tags before the local `writeStarted=true` boundary.
- `createParentTaskVerifier.ts` verifies ordinary Parent ID, `inInbox=false`, containing Project,
  canonical fields, and the exact Tag ID set when tagged.
- `CreateParentTaskService` owns Parent fingerprints, existing Ledger/global lock orchestration,
  exact readback, warnings, verified replay, and no-recreate recovery.

No generic placement resolver, generic mutation executor, prepare token, edit/move/reparent
primitive, fallback, or new Tool was introduced.

## 3. Deterministic Evidence

The P4-B tests cover:

- strict Parent-only destination and Parent/Project mutual exclusion;
- separate tagged and untagged Parent fingerprint namespaces;
- `action_group` eligibility, ordinary action and Project root rejection;
- direct/effective completion and drop, ancestor completion/drop, Project OnHold/Done/Dropped,
  dropped Folder ancestry, unknown status, cycle, orphan, malformed ID, and schema drift;
- known `Blocked` Parent eligibility when all completion/drop and ancestry checks remain valid;
- readable but ineligible facts remaining readable for replay;
- exact prewrite category/reason pairs and Tag category preservation;
- validation ordering before the only `new Task(payload.name, parent)` constructor;
- Project-backed and Inbox-backed ordinary Parent placement;
- Project-root top-level placement not being mistaken for ordinary Parent placement;
- tagged exact-set success and mismatch;
- unknown outcome, partial success, verification recovery, idempotency conflict, and replay-window
  semantics;
- replay of renamed/ineligible Parent and moved child without re-creation;
- fail-closed replay when current ordinary Parent context is unreadable.

The real library did not contain a Dropped Task during P4-A. P4-B therefore closes the accepted
conditional gate with deterministic direct/effective self-drop and ancestor-drop cases; it does not
claim a real Dropped-object acceptance result.

## 4. Unreachability Evidence

- `src/tools/definitions/createTask.ts`, `src/serverRegistration.ts`, and
  `src/serverInstructions.ts` do not import or route P4-B modules.
- Public MCP `tools/list` input/output schemas contain no `parentTask` variant.
- The current V3 handler rejects a Parent payload as `invalid_arguments`, with
  `mayHaveWritten=false`, before service dispatch.
- The personal-production surface remains exactly five read Tools plus one existing mutation Tool,
  with Resources absent.
- No Parent flag or environment/configuration surface exists yet.

## 5. Validation

Final local gates:

- 65 test files / 907 tests: PASS;
- `npm run build`: PASS;
- `npx tsc --noEmit`: PASS;
- all JXA files compiled with `osacompile -l JavaScript`: PASS;
- `git diff --check`: PASS.

P4-B did not execute either production Parent JXA script against OmniFocus. It did not call
`create_task`, create/modify/delete an OmniFocus object, touch Ledger/audit/lock runtime state,
change flags, restart Tunnel, deploy, commit, or push.

## 6. Review Gate

Stop at P4-C. A later, independent authorization is required to:

1. publish the V4 three-way destination and Parent output location;
2. add a Parent feature flag that defaults false;
3. add fail-closed handler routing after global and before Tag gates;
4. update registration/instructions and inspect the actual MCP wire Schema;
5. perform App Refresh and disabled client UI/target-binding acceptance with zero mutation.

Only that disabled P4-C client evidence may decide whether single-stage exact-ID flow is acceptable
or a narrowly scoped prepare/commit ADR amendment is required. Canary and enablement remain later,
separately authorized phases.
