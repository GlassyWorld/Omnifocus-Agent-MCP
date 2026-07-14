# `create_task` Phase 2B Project Placement Acceptance

Status: passed and formally enabled on 2026-07-14. Implementation, disabled client gate, isolated production Canary, manual cleanup, fail-closed public enablement, and final health/capability verification all passed.

## Authorization and scope

- The user separately approved Phase 2B implementation after the Phase 2A design review.
- The accepted write surface is one explicitly requested Task at the top level of one exact, read-side-discovered Active Project.
- The mutation contract accepts only an opaque canonical Project ID. Project names never enter mutation resolution.
- Parent Task placement, Tag, batch, repeat, notification, update, complete, delete, Project creation, and Inbox fallback remain prohibited.
- `OMNIFOCUS_CREATE_TASK_PROJECT_ENABLED` is independent of the existing global `OMNIFOCUS_CREATE_TASK_ENABLED` gate and fails closed before Ledger, lock, resolver, or executor access.

## Implementation evidence

Phase 2B was implemented in `edfccd0` (`feat: add guarded project placement for create_task`). The implementation includes:

- explicit `destination` in the V2 wire contract;
- `create_task:v2` fingerprint namespace while retaining the shared Ledger key index;
- exact canonical Project ID resolution and real-time Active/Dropped-ancestor validation;
- transient no-write validation failures that do not consume the idempotency key;
- deterministic destination failures that create terminal prewrite tombstones;
- an independent `createTaskInProject` primitive with no Inbox fallback;
- destination-specific write readback and current-eligibility warnings;
- a Project-specific feature flag and fully unreachable disabled path;
- strict published Tool Schema and Agent instructions for explicit destination confirmation.

Validation before the final Canary amendment:

- full test suite passed;
- TypeScript build passed;
- `git diff --check` passed;
- public Tool surface remained exactly five Tools with no Resources and one mutation Tool.

## Disabled client gate

With the public Project-specific flag disabled, the client successfully read one exact Active Project and associated its path, status, and canonical ID with the intended write request. The subsequent single `create_task` attempt returned:

- `write_disabled`;
- `mayHaveWritten=false`;
- no retry;
- no created Task.

This proved the refreshed client could supply the explicit Project destination while the server still failed closed before mutation.

## First isolated Canary and discovered hierarchy contract

The first separately authorized isolated Canary enabled the Project-specific flag only inside a one-shot `personal-production` process. The public Tunnel flag remained disabled.

- Project preflight confirmed the exact canonical ID, Active state, expected Project identity, and unused unique Task name.
- Exactly one `create_task` call was issued.
- The response was `partial_success`, `mayHaveWritten=true`; no retry was attempted.
- ID/name reads found exactly one Task in the requested Project with no Inbox fallback or duplicate.
- OmniFocus readback exposed `hierarchy.parentId` as the requested Project root Task ID rather than `null`.
- Ledger recorded `verification_failed` / `partial_success`; audit and permission checks passed and no mutation lock remained.
- The user manually deleted the Task; final ID/name reads both returned `not_found`.

This was a verifier contract error, not a placement failure. The Canary correctly stopped on an unknown post-write result instead of retrying.

## Accepted hierarchy amendment

The user accepted the following Project top-level placement contract:

```text
actual.location.inInbox === false
actual.project.id === requestedProjectId
actual.hierarchy.parentId === requestedProjectId
```

OmniFocus exposes the Project root Task ID as the canonical Project ID. A direct child action therefore uses that same ID for both `project.id` and `hierarchy.parentId`. This is Project top-level placement, not Phase 4 ordinary parent Task placement.

Commit `e3fc05b` (`fix: verify project placement against root task hierarchy`) amended ADR-006, the Phase 2A design, verifier logic, semantic helper, and tests. It explicitly rejects:

- `parentId=null` for a Project destination;
- a different Project root ID;
- an ordinary Task ID;
- inconsistent `project.id` and `hierarchy.parentId`.

The canonical ID Schema and opaque-ID policy were not changed.

Post-amendment validation passed:

- 43 test files / 690 tests;
- `npm run build`;
- `git diff --check`.

## Second isolated Canary result

The user separately authorized one new Canary after the amendment. It used a new unique Task name, UUID idempotency key, and isolated state directory. The public Project-specific flag remained disabled.

- Exact Project preflight: passed; canonical ID matched and current state was Active.
- Exact-name preflight: `not_found`.
- `create_task` calls: exactly one; no retry.
- Service result: `success`.
- Returned destination: Project, with exact requested Project ID and expected read-side Project name.
- Task ID hash: `b7b240de4f14`.
- Same-session ID/name readback: exact single Task.
- Independent persisted ID/name readback after server shutdown: one result each, resolving to the same Task.
- `inInbox=false`.
- `project.id` matched the requested canonical Project ID.
- `hierarchy.parentId` matched the same requested Project root Task ID.
- Name and default fields matched; no Tag, repeat, estimate, flag, note, or dates were added.
- Ledger: `verified` / `success`; Task ID matched.
- Ledger directories: `0700`; Ledger record: `0600`.
- Audit: one allowlisted record, `success`, mode `0600`, args/effective key hashes matched.
- Audit contained no Task name, Project ID, idempotency key, or Task ID.
- Mutation lock: absent.

## Manual confirmation and cleanup

The user confirmed and manually deleted the second Canary Task. Final MCP read verification passed:

- original Task ID: `not_found`;
- exact Task name: `not_found`;
- permanent Ledger record remained `verified` / `success` and preserved the original Task ID;
- Ledger record and audit modes remained `0600`;
- audit remained privacy-safe;
- mutation lock remained absent.

## Formal public enablement

After the isolated Canary and cleanup passed, the user explicitly approved both temporary-evidence cleanup and formal public Project placement enablement.

Pre-enable gates passed again:

- 43 test files / 690 tests;
- `npm run build`;
- `git diff --check`;
- main LaunchAgent and watchdog configuration valid;
- main service running, watchdog loaded, Tunnel process present;
- `healthz=live` and `readyz=ready`;
- existing global create flag exactly `true`;
- Project-specific flag absent before enablement.

A fail-closed controller then:

1. preserved the original main LaunchAgent plist with no Project flag;
2. staged and linted a plist with `OMNIFOCUS_CREATE_TASK_PROJECT_ENABLED=true`;
3. unloaded watchdog and main jobs so launchd could load the new environment;
4. bootstrapped the main job with bounded retry and waited for `live` / `ready`;
5. restored the watchdog;
6. verified both plist and loaded LaunchAgent values;
7. retained automatic rollback to the original disabled plist for any failure before final acceptance.

Enablement result:

- `PLIST_GLOBAL_FLAG=true`;
- `PLIST_PROJECT_FLAG=true`;
- `LOADED_GLOBAL_FLAG=true`;
- `LOADED_PROJECT_FLAG=true`;
- `healthz=live`;
- `readyz=ready`;
- watchdog loaded.

An independent post-enable Tunnel status check returned `STATUS_RESULT=healthy`, with valid configuration, running main service, loaded watchdog, present process, and `live` / `ready` endpoints.

A fresh MCP protocol session against the enabled build confirmed:

- exactly five Tools: `create_task`, `get_task`, `get_project`, `get_completed_since`, and `get_lean_snapshot`;
- Resources capability absent;
- `create_task.required` contains `name`, `destination`, and `idempotencyKey`;
- `additionalProperties=false`;
- existing Schema/handler tests accept exactly the Inbox and Project destination variants and reject omitted or out-of-scope destinations.

No Task was created during configuration enablement or post-enable capability checks.

## Final production boundary

Phase 2B Project placement is now formally enabled on the public `personal-production` path.

Current production boundary:

- global `create_task` and the independent Project-specific flag are both exactly `true` in the plist and loaded LaunchAgent;
- each authorized call creates at most one Task in explicit Inbox or at the top level of one exact Active Project;
- Project placement still requires a canonical read-side Project ID, prewrite real-time validation, exact root hierarchy readback, and no Inbox fallback;
- parent Task placement and every other excluded mutation remain unavailable.
