# `create_task` Phase 4 P4-D Parent Canary Acceptance

> Status: PASS (2026-07-15)<br>
> Authorized Parent mutation count: exactly one<br>
> Canary cleanup: user-confirmed manual deletion; exact ID/name both `not_found`<br>
> Runtime Parent flag during Canary: one-process scope only; public Tunnel flag remained absent

## 1. Scope and Result

This acceptance closes only the separately authorized P4-D one-Canary gate for exact ordinary
Parent Task placement. It does not itself authorize the production Parent feature flag, a second
Canary, prepare/commit, parent lookup by name, Project-root fallback, or any
edit/move/reparent/complete/delete/batch capability.

The accepted Canary created exactly one minimal synthetic child named
`P4D_PARENT_CANARY_20260715` below one freshly read, eligible ordinary Action Group. Real Task,
Parent, Project, and Folder names and canonical IDs are intentionally omitted.

The create, exact readback, Ledger/audit/lock checks, second independent readback, user inspection,
manual deletion, and final cleanup checks all passed. The public Tunnel remained fail-closed for
Parent placement throughout the Canary.

## 2. Preflight and Isolation

- The containing Project and ordinary Action Group were freshly read by exact canonical ID.
- Parent facts and eligibility passed identity, kind, direct/effective completion/drop,
  parent-chain integrity, containing Project, and Folder ancestry checks.
- The synthetic child name returned exact `not_found` immediately before mutation.
- The public LaunchAgent plist and loaded environment did not contain the Parent flag.
- A separate one-time process received the Parent flag; no public Tunnel flag was changed.
- The idempotency key was fixed before the call.
- Audit baseline was `13` records and Ledger baseline was `7` records.
- `mutation.lock` was absent.

## 3. Single Mutation and Exact Readback

Exactly one `create_task` request was issued. It returned success with `replayed=false` and no
warnings. No retry or second mutation request was sent.

The immediate exact-ID readback verified:

- output location was the strict `parentTask` branch;
- returned Task ID matched the created object;
- child kind was ordinary `action`;
- child was not a direct Inbox item;
- direct Parent ID and containing Project ID matched the freshly read target context;
- default fields matched the minimal request;
- Parent child count increased by exactly one;
- containing Project direct-child count did not change;
- containing Project all-descendant count increased by exactly one.

A second independent exact-ID readback returned the same identity, placement, and defaults.

## 4. Replay, Ledger, Audit, and Privacy

The accepted evidence uses only irreversible hashes:

```text
idempotencyKeyHash=45d256991877e9849ab5ef1615beac9a2a34d105cae83452ead993f1fd4da793
taskIdHash=150afb42a0bba87c41284d233ac1fa65eb34be43ffe193585a24af1105d4f2ce
parentTaskIdHash=bab5c60e3db63a4d5b6f548b1c7c6c11bc05ccbc70ea271ad9eca245b314072d
projectIdHash=af1d2e27c6283a92792e16cc623cc7d4f0b2c89ef1e4b4be1eba7f162d75f199
```

- Ledger count increased exactly once, from `7` to `8`.
- The new record was `verified/success`, its checksum was valid, and its Task ID matched readback.
- Audit count increased exactly once, from `13` to `14`.
- The matching audit record contained only the six-field privacy allowlist: `correlationId`, three
  hashes, `resultCode`, and `elapsedMs`.
- Audit argument and effective idempotency-key hashes matched.
- `mutation.lock` was absent after the request.
- State directory, records directory, Ledger record, and audit modes were
  `0700` / `0700` / `0600` / `0600`.

No real name, canonical ID, note, path, or raw OmniFocus payload is recorded in this acceptance.

## 5. User Confirmation and Cleanup

The user inspected the child in OmniFocus and manually deleted it. Final read-side checks then
proved:

- exact Canary ID returned `not_found`;
- exact Canary name returned `not_found`;
- the original Parent still existed in the same containing Project;
- Parent child count returned to its pre-Canary value;
- the Canary ID was absent from both Project direct-child and all-descendant sets;
- Ledger tombstone/replay evidence and the privacy-safe audit record remained intact;
- no second `create_task` request was issued.

The Project direct/all counts were `8/31` before the Canary, `8/32` after creation, and `7/30`
after the cleanup window. This is not represented as a full aggregate-baseline restoration. The
user explicitly confirmed deleting one separate, unrelated Project-root action during the same
window. That external action explains the additional direct `-1` and descendant `-1`; the exact
ID/name, Parent child-count, and Project membership checks independently prove that the Canary
itself left no residue.

## 6. Runtime Health and Decision

- The public Tunnel remained healthy with `health=live`, `ready=ready`, and watchdog loaded.
- Public `personal-production` remained exactly five read Tools plus `create_task`; Resources were
  absent and `create_task` remained the sole mutation Tool.
- The public Parent flag remained absent during P4-D.

P4-D passes. The P4-C client target-binding evidence and this exact one-Canary result do not require
a prepare/commit amendment. Single-stage freshly-read exact-ID placement remains the accepted
protocol for this capability.

P4-E formal production enablement remains a separate gate. It requires explicit authorization,
fail-closed configuration loading, exact plist and loaded-environment verification, zero mutation
during enablement, unchanged Schema/tool surface, and final Tunnel health checks.
