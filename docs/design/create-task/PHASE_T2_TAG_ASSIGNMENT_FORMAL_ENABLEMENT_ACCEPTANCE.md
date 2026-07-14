# Phase T2 Tag Assignment Formal Enablement Acceptance

> Status: T2-E formal production enablement passed on 2026-07-15<br>
> Final loaded flags: global=true, Project=true, Tag=true<br>
> Additional public mutation Canary: not performed and not required for this configuration gate

## Scope and authorization

After T2-A/B/C/D had independently passed, the user explicitly approved formal Tag assignment
enablement and the previously reviewed three-commit publication plan. This checkpoint enabled only
the already published `create_task` V3 tagged branch. It did not add a Tool, Resource, Tag CRUD,
ordinary parent placement, batch operation, or generic mutation executor.

The T2-C App Refresh had already published the same Tool metadata and V3 Schema. T2-E changed only
the runtime Tag feature flag, so no additional client refresh was required. No public or isolated
mutation call was issued during enablement.

## Pre-enable gates

- T2-D tagged Inbox and tagged Project Canary cleanup loops were complete.
- Commit `a93a00c` contained the guarded T2-B internals.
- Commit `57a8c8f` contained the T2-C public `tagIds` contract and handler routing.
- 58 test files / 828 tests passed.
- `npm run build`, JXA syntax check, and `git diff --check` passed.
- Public Tunnel status was healthy with health=`live`, ready=`ready`, and watchdog=`loaded`.
- Initial plist and loaded flags were global/Project/Tag=`true/true/false`.
- Ledger records=`7`, audit lines=`11`, audit SHA-256 was
  `576c457c149f23075f97df9b101e7780747ccb30386366ede61b8d6aafc34388`, and no mutation lock
  existed.

## Fail-closed enablement

A one-time controller preserved the original LaunchAgent plist and retained automatic rollback
until final verification. It then performed two bounded reloads:

1. loaded global/Project/Tag=`false/true/true`;
2. verified the plist and loaded environment, main service, health/ready endpoints, and watchdog;
3. loaded the final global/Project/Tag=`true/true/true` configuration;
4. repeated the same exact configuration and runtime checks;
5. released rollback only after every final check passed.

The fail-closed stage and final enablement both passed. No `create_task` or other mutation call was
made by the controller or the acceptance probe.

## Final production verification

Final LaunchAgent and runtime evidence:

```text
PLIST_GLOBAL_FLAG=true
PLIST_PROJECT_FLAG=true
PLIST_TAG_FLAG=true
LOADED_GLOBAL_FLAG=true
LOADED_PROJECT_FLAG=true
LOADED_TAG_FLAG=true
STATUS_RESULT=healthy
MAIN_SERVICE=running
WATCHDOG=loaded
TUNNEL_PROCESS=present
HEALTH=live
READY=ready
```

A fresh MCP capability session against the same built server and final environment confirmed:

- exact six Tools: `create_task`, `get_completed_since`, `get_lean_snapshot`, `get_project`,
  `get_task`, and `search_tags`;
- Resources capability absent;
- `create_task` remained the sole mutation Tool;
- exact required input fields: `name`, `destination`, and `idempotencyKey`;
- `additionalProperties=false`;
- optional `tagIds` published with `minItems=1` and `maxItems=5`;
- tagged output readback publishes `created.tagIds`;
- annotations remained readOnly/destructive/idempotent/openWorld=`false/false/true/false`;
- mutation calls made by the capability probe=`0`.

Runtime validation continues to reject duplicate IDs before service dispatch; the wire description
also states uniqueness without using a refined top-level registration Schema that MCP SDK 1.29
would serialize incorrectly.

## Zero-write and privacy proof

Pre/post configuration evidence was identical:

```text
ledgerRecordsBefore=7
ledgerRecordsAfter=7
auditLinesBefore=11
auditLinesAfter=11
auditHashBefore=576c457c149f23075f97df9b101e7780747ccb30386366ede61b8d6aafc34388
auditHashAfter=576c457c149f23075f97df9b101e7780747ccb30386366ede61b8d6aafc34388
lockPresentBefore=false
lockPresentAfter=false
```

Audit remained mode `0600`; Ledger and records directories remained `0700`. The LaunchAgent plist
remained owned by the user with mode `0644`. No real Tag identity, name, path, or Task payload was
written to acceptance logs or documents.

## Accepted production boundary

`create_task` V3 is now formally enabled for exactly one explicitly requested Inbox or exact Active
Project Task, optionally with 1–5 freshly discovered existing Active Tag canonical IDs. The server
still performs real-time canonical-ID resolution, complete ancestor-active validation, duplicate
and mutual-exclusion checks, exact Tag ID-set readback, Ledger/idempotency protection, audit, and
the global mutation lock.

Tag names and paths remain confirmation/display facts only. Missing Tags are never created, partial
Tag assignment is never accepted as success, and failure never falls back to an untagged Task or
Inbox. `create_tag` remains permanently absent from `personal-production`.

Ordinary parent placement, existing-Task edits, Tag CRUD, batch, repeat, notification, move,
complete, and delete remain unauthorized. Phase 4 remains deferred and requires independent design,
risk review, and explicit user approval.
