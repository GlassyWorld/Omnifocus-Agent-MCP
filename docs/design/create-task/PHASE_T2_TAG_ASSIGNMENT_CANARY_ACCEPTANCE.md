# Phase T2 Tag Assignment Canary Acceptance

> Status: both T2-D Canary creation, verification, user confirmation, cleanup, and dual `not_found` loops passed on 2026-07-15<br>
> Public production flags during T2-D: global=true, Project=true, Tag=false<br>
> Subsequent T2-E formal enablement: passed on 2026-07-15

## Scope and privacy

The user separately approved each T2-D mutation step. This document records one tagged Inbox Canary
and one tagged Project Canary executed serially through one-time controlled `personal-production`
processes using the same built server, JXA primitive, Ledger, audit, and real OmniFocus database as
production. The public Tunnel never enabled Tag assignment.

Real Tag IDs, names, and paths are omitted. Acceptance evidence records only counts, hashes, and
booleans. No deletion Tool is registered; cleanup remains a user action in OmniFocus.

## Revalidated gates

- 58 test files / 828 tests passed immediately before the Canary.
- Build, JXA compilation, and `git diff --check` passed.
- Public Tunnel was healthy with loaded global/Project/Tag=`true/true/false`.
- `personal-production` remained exactly six Tools, Resources absent, and `create_task` the sole
  mutation Tool.
- A fresh full Tag snapshot was read once for discovery preflight.
- The selected Tag had one exact complete-path match, an entirely Active ancestor chain, and no
  mutually-exclusive parent membership.
- The Canary exact name was `not_found` immediately before mutation.
- The global mutation lock was absent.

Privacy-safe preflight evidence:

```text
tagSnapshotCount=26
tagProjectionHash=41efe51328367972af5cb117c5a2c1cead48d6f27774d6ff58503375819b0023
auditLinesBefore=9
ledgerRecordsBefore=5
lockPresentBefore=false
```

## Single controlled mutation

The one-time process used global/Project/Tag=`true/true/true` only in its own environment. It made
exactly one `create_task` call for the synthetic Inbox Task
`T2D_TAGGED_INBOX_CANARY_20260715_001`, with one freshly discovered canonical Tag ID and a fresh
UUID idempotency key. No retry, fallback, cleanup, or second mutation call occurred.

The call returned success. Immediate verification passed:

```text
requestedTagCount=1
returnedTagCount=1
exactReturnedTagSet=true
exactInternalTagReadback=true
exactIdReadback=true
exactNameReadback=true
inboxReadback=true
defaultsMatch=true
replayed=false
warningCount=0
```

Privacy-safe identifiers:

```text
taskIdHash=fde0207d70ec18839e4867153fdeef2309e0c31942831a827b4928925d22fb8e
keyHash=0c2551beb1f5c3038d92cd9bd84cc98d6c42d2585fa9fc5781b7ef54bfc1a55a
tagSetHash=fb7d47e70924469e0ec9ff47daf7f99e7f51715567892e2b328a22aee1d6c41a
```

## Ledger, audit, hierarchy, and privacy checks

- Ledger state/result: `verified` / `success`.
- Ledger Task ID matched the returned Task ID.
- Ledger, records directory, and record modes were `0700` / `0700` / `0600`.
- Audit delta was exactly one record with `resultCode=success`.
- Audit keys exactly matched the privacy allowlist; audit mode was `0600`.
- The actual mutation lock was absent after completion.
- Pre/post Tag projection hashes were identical; no Tag was created, modified, restored, or deleted.
- The created Task remained a direct Inbox Task with no Project or parent placement.

Post-mutation host state:

```text
auditLinesAfter=10
ledgerRecordsAfter=6
tagProjectionUnchanged=true
lockPresentAfter=false
publicLoadedGlobal=true
publicLoadedProject=true
publicLoadedTag=false
TunnelStatus=healthy
health=live
ready=ready
watchdog=loaded
```

## User confirmation and cleanup

The user inspected the synthetic Task, confirmed the Inbox placement and exact Tag, and deleted it
manually. Server-side read-only cleanup verification then passed:

```text
ledgerState=verified
ledgerResultCode=success
ledgerTaskIdHashMatches=true
idNotFound=true
nameNotFound=true
auditLines=10
matchingAuditRecords=1
tagProjectionUnchanged=true
lockPresent=false
```

The verified Ledger tombstone and its replay window remained intact. Audit and Ledger permissions
were unchanged, and the public Tunnel remained healthy with global/Project/Tag=`true/true/false`.

## Tagged Inbox completion

The tagged Inbox Canary cleanup loop is complete.

## Tagged Project Canary

After the user supplied and confirmed an exact Active Project target, a fresh two-step Project read
resolved one standard Project root and revalidated its identity, status, Folder context, and task
counts. A fresh complete Tag snapshot independently revalidated one exact ancestor-active,
non-mutually-exclusive Tag. The synthetic Task name was `not_found`, and the mutation lock was
absent immediately before creation.

Privacy-safe preflight evidence:

```text
tagSnapshotCount=26
tagProjectionHash=41efe51328367972af5cb117c5a2c1cead48d6f27774d6ff58503375819b0023
projectContextHash=32fa90b64b3700b4c9954c0ff4235eb1704ce88665d39763d6c390a2696435fa
projectDirectTaskCountBefore=7
projectAllTaskCountBefore=30
auditLinesBefore=10
ledgerRecordsBefore=6
lockPresentBefore=false
```

Following the user's explicit confirmation, the one-time process used
global/Project/Tag=`true/true/true` only in its own environment and made exactly one
`create_task` call for `T2D_TAGGED_PROJECT_CANARY_20260715_001`. There was no retry, fallback,
cleanup, or second mutation call. The public Tunnel remained global/Project/Tag=`true/true/false`.

Immediate and fresh post-mutation verification passed:

```text
requestedTagCount=1
returnedTagCount=1
exactReturnedTagSet=true
exactInternalTagReadback=true
exactIdReadback=true
exactNameReadback=true
projectReadback=true
parentReadback=true
notInInbox=true
outputProjectLocation=true
defaultsMatch=true
replayed=false
warningCount=0
projectContextUnchanged=true
projectDirectContainsTask=true
projectAllContainsTask=true
projectDirectCountDelta=1
projectAllCountDelta=1
tagProjectionUnchanged=true
```

Privacy-safe identifiers:

```text
taskIdHash=cac93a2a5af43e2d40917274f86c26a91015d04f57fa2f676ab83c552150ae03
keyHash=530bc1466f1a8f15bf6019d8c787ec97c515fb7a39c739a4cc06ea9e473d1c29
tagSetHash=fb7d47e70924469e0ec9ff47daf7f99e7f51715567892e2b328a22aee1d6c41a
projectIdHash=af1d2e27c6283a92792e16cc623cc7d4f0b2c89ef1e4b4be1eba7f162d75f199
```

Ledger state/result is `verified` / `success`; the Ledger Task ID matches the returned Task ID.
The audit grew by exactly one `success` record with the exact privacy allowlist. Ledger, records,
record, and audit permissions remain `0700` / `0700` / `0600` / `0600`, and no mutation lock
remains. A second fresh read confirmed the Task still exists under the same Project root as both
`projectId` and `parentId`, still has the exact one-Tag ID set, and is present in both direct and all
Project task lists. Current direct/all counts are 8/31, audit lines are 11, and Ledger records are 7.

The public Tunnel postcheck is healthy with health=`live`, ready=`ready`, watchdog=`loaded`, and
loaded global/Project/Tag=`true/true/false`.

### User confirmation and cleanup

The user inspected the Task in OmniFocus, confirmed its exact Project placement and one-Tag
assignment, and deleted it manually. The server-side read-only cleanup loop then passed:

```text
ledgerState=verified
ledgerResultCode=success
ledgerTaskIdHashMatches=true
idNotFound=true
nameNotFound=true
projectContextUnchanged=true
projectDirectNoLongerContainsTask=true
projectAllNoLongerContainsTask=true
projectDirectTaskCount=7
projectAllTaskCount=30
tagSnapshotCount=26
tagProjectionUnchanged=true
auditLines=11
matchingAuditRecords=1
auditResultCode=success
auditAllowlistExact=true
lockPresent=false
```

Audit/Ledger permissions remained `0600` / `0700`, with records directory/record permissions
`0700` / `0600`. The public Tunnel final status was healthy with health=`live`, ready=`ready`,
watchdog=`loaded`, and loaded global/Project/Tag=`true/true/false`.

Both T2-D Canary cleanup loops are complete. T2-E was subsequently authorized and passed; see
[Phase T2 Tag Assignment Formal Enablement Acceptance](./PHASE_T2_TAG_ASSIGNMENT_FORMAL_ENABLEMENT_ACCEPTANCE.md).
