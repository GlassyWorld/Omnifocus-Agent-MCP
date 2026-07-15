# `create_task` Phase 4 P4-C Disabled Client Acceptance

> Status: PASS (2026-07-15)<br>
> Runtime Parent flag: absent / fail-closed<br>
> OmniFocus mutation count: zero<br>
> Next gate: separately authorized P4-D one-Canary acceptance

## 1. Scope and Result

This acceptance closes only the fail-closed V4 deployment, App Refresh, client routing, and
Parent target-binding gate. It does not authorize a Parent mutation Canary, runtime Parent flag
enablement, formal enablement, prepare/commit, or any edit/move/reparent/complete/delete capability.

The deployed `personal-production` Tool surface remained exactly five read Tools plus the sole
mutation Tool `create_task`; Resources capability remained absent. The live `create_task` wire
contract exposed strict Inbox, Project, and Parent destination/location branches while the Parent
feature flag was absent from both the LaunchAgent plist and loaded environment.

## 2. Deployment and Protocol Evidence

- The Tunnel profile continued to execute this workspace's built `dist/server.js` with
  `OMNIFOCUS_MCP_PROFILE=personal-production`.
- The main Tunnel was restarted without editing its plist. Existing global/Project/Tag flags
  remained exact lowercase `true`; the Parent flag remained absent.
- Tunnel status, `healthz=live`, `readyz=ready`, and watchdog checks passed.
- Local STDIO MCP inspection returned exactly `get_task`, `get_project`, `get_completed_since`,
  `get_lean_snapshot`, `search_tags`, and `create_task`; Resources capability was absent.
- The input destination and output location each published three strict wire branches:
  `inbox`, `project`, and `parentTask`.
- A fresh exact-name `get_task` read established one existing ordinary `action_group` under the
  expected containing Project. Real names and canonical IDs are intentionally omitted.

The local disabled protocol call returned:

```text
code=write_disabled
reason=parent_placement_disabled
mayHaveWritten=false
```

The gate returned before Parent facts/service/Ledger/lock/JXA dispatch. The synthetic child locator
was exact `not_found` before and after the call.

## 3. App Refresh and Target Binding

The first refreshed client conversation still behaved as if it had cached the prior V3 contract:
it correctly found the containing Project and Action Group but refused to call `create_task` because
it believed Parent placement was unsupported. This attempt was not accepted as P4-C evidence. It
produced no audit delta, and both the intended and client-truncated synthetic locators remained
exact `not_found`.

After another App Refresh and a fresh conversation, the client:

1. preserved the exact containing Project, ordinary Action Group, and full synthetic child name;
2. let the user associate the displayed Parent context with the intended exact target;
3. called the Parent branch without falling back to the Project root or Inbox;
4. reported the server's Parent-specific disabled response and correctly stated that no Task was
   created and no cleanup was required.

This is sufficient target-binding evidence for retaining single-stage exact-ID placement as the
candidate protocol for P4-D. It is not evidence that Parent mutation is enabled or safe to use
without the remaining Canary and formal-enablement gates.

## 4. Zero-Write Proof

The accepted client call added exactly one audit record:

```text
resultCode=write_disabled.parent_placement_disabled
argsIdempotencyKeyHash==effectiveKeyHash
```

The record contained only the six-field privacy allowlist: `correlationId`, three hashes,
`resultCode`, and `elapsedMs`. No Task, Project, Parent, Tag, or canonical ID was logged.

Post-call checks showed:

- Ledger record count remained `7`;
- the aggregate Ledger signature remained unchanged;
- `mutation.lock` remained absent;
- state/records/audit modes remained `0700` / `0700` / `0600`;
- both the complete and truncated synthetic child locators returned exact `not_found`;
- Tunnel remained healthy and the loaded Parent flag remained absent.

No Parent JXA primitive ran and no OmniFocus object was created, modified, completed, moved,
reparented, or deleted.

## 5. Decision and Stop Gate

P4-C disabled deployment and client target-binding acceptance is complete. The evidence does not
require a prepare/commit amendment at this point, so single-stage exact-ID placement remains the
candidate for P4-D.

Stop here. P4-D requires a new explicit authorization for exactly one controlled Parent child
Canary, with pre-read, exact readback, Ledger/audit/lock checks, user confirmation, manual deletion,
and final ID/name `not_found`. Parent runtime enablement and P4-E remain separately gated.
