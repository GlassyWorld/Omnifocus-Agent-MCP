# `create_task` Phase 4 P4-E Parent Formal Enablement Acceptance

> Status: PASS (2026-07-15)<br>
> Final loaded flags: global/Project/Tag/Parent=`true/true/true/true`<br>
> Enablement mutation count: zero<br>
> Public Tool surface: exactly five read Tools plus `create_task`; Resources absent

## 1. Scope and Result

This acceptance closes only the separately authorized P4-E runtime feature-flag gate for the
already published and Canary-accepted V4 ordinary Parent destination. It does not add a Tool,
change Schema metadata, authorize parent lookup by name, or authorize
edit/move/reparent/complete/delete/batch/repeat/notification/Tag CRUD.

P4-E passed. The main LaunchAgent plist and loaded process environment now contain exact lowercase
`true` for the global, Project, Tag, and Parent flags. The Tunnel is healthy and the enablement
procedure made no MCP Tool call and no OmniFocus mutation.

## 2. Preconditions

Before formal loading:

- P4-C V4 publication and disabled App/UI target-binding acceptance had passed;
- P4-D exactly-one Parent Canary, exact readback, user inspection, manual deletion, and final
  ID/name `not_found` had passed;
- the public Parent flag was absent from the plist and loaded environment;
- existing global/Project/Tag flags were exact lowercase `true`;
- the existing plist was valid and mode `0644`;
- audit had `14` records with SHA-256
  `53358adea69051b7312e54c91c7ba4f524ed3b5ab7dc075046347cd4f0967545`;
- Ledger contained `8` permanent records and `mutation.lock` was absent;
- repository validation baseline was 66 test files / 923 tests.

The existing Tunnel was refreshed with the repository's supported operations script while Parent
remained absent, producing a host-visible healthy baseline before any flag edit.

## 3. Fail-Closed Controller

The controller:

1. verified the initial exact flags and host-visible Tunnel health;
2. copied the original main plist to a mode `0600` backup;
3. generated and linted separate mode `0600` fail-closed and final candidates;
4. installed an automatic rollback trap before the first real plist replacement;
5. fully unloaded watchdog and main LaunchAgents before each candidate load;
6. bootstrapped main and watchdog with bounded retries;
7. required host-visible `healthz=live` and `readyz=ready` after every load;
8. released rollback only after exact final plist and loaded-environment assertions passed.

Stage 1 loaded and verified:

```text
global=false
Project=true
Tag=true
Parent=true
```

This proves the global gate remains authoritative even when destination-specific flags are true.

Stage 2 loaded and verified:

```text
global=true
Project=true
Tag=true
Parent=true
```

The final main plist remained owned by the user, mode `0644`, and passed `plutil -lint`. Backup and
candidate files remained private at mode `0600` under `/private/tmp`; their randomized paths are
operational evidence and are not part of the repository.

## 4. Operational Correction

An initial controller version used a stale local health endpoint. It timed out during its
read-only preflight, before backup activation, candidate installation, LaunchAgent unload, plist
replacement, or any MCP/OmniFocus operation. Exact plist and loaded flags remained at the original
Parent-absent baseline.

The controller was corrected to the operations-authoritative local endpoints
`127.0.0.1:18080/healthz` and `127.0.0.1:18080/readyz`, with explicit proxy bypass. Permission-channel
rejections that followed did not start the controller. Only the final accepted execution changed
the plist, and that execution passed both stages without invoking rollback.

## 5. Zero-Mutation and Durability Evidence

- No `create_task` or other MCP Tool call was made during formal enablement.
- Audit remained exactly `14` lines and retained the same SHA-256 as the pre-enable snapshot.
- Ledger record count remained exactly `8`.
- `mutation.lock` remained absent.
- State directory, records directory, and audit modes remained `0700` / `0700` / `0600`.
- No OmniFocus Task, Project, Folder, or Tag was created, modified, moved, completed, dropped, or
  deleted by P4-E.

Because every `create_task` result path emits an audit record, the byte-identical audit file plus
the unchanged Ledger count and absent lock provide an independent zero-call/zero-mutation gate.

## 6. Protocol and Repository Evidence

P4-E changed only LaunchAgent environment values. It did not rebuild or modify the V4 Tool
contract. The live V4 protocol surface had already passed P4-C with:

- exact Tools: `get_task`, `get_project`, `get_completed_since`, `get_lean_snapshot`,
  `search_tags`, `create_task`;
- Resources capability absent;
- strict Inbox/Project/Parent input destination union;
- strict Inbox/Project/Parent output location union;
- `create_task` annotations `readOnlyHint=false`, `destructiveHint=false`,
  `openWorldHint=false`, `idempotentHint=true`.

Post-enable repository validation passed:

```text
Test Files  66 passed (66)
Tests       923 passed (923)
build       pass
tsc --noEmit pass
JXA syntax  pass
diff check  pass
```

No App Refresh is required because P4-E changed no Tool name, description, instructions, input
Schema, output Schema, annotations, or capability metadata.

## 7. Final Runtime Boundary

The formally enabled Parent branch remains narrow:

- destination must be exactly `{ kind: "parentTask", parentTaskId: <canonical UUID> }`;
- the ID must come from a fresh exact read and user-confirmed target context;
- only an existing eligible ordinary `action_group` is accepted;
- prewrite facts/eligibility validation remains fail-closed for identity, kind, direct/effective
  completion/drop, parent-chain integrity, containing Project, and Folder ancestry;
- Parent and Project destinations remain mutually exclusive;
- no name/fuzzy/path resolution, guessing, fallback, or leaf-action placement is allowed;
- existing Inbox/Project/Tag semantics, fingerprints, replay, Ledger, audit, lock, and gates remain
  unchanged.

The sole public mutation Tool remains `create_task`. Existing Task edit, move, reparent, complete,
delete, Tag edit/CRUD, batch, repeat, and notification remain unauthorized.

## 8. Decision

P4-E passes and ordinary Parent Task placement is formally enabled in `personal-production` within
the frozen Phase 4 boundary. P4-A through P4-E are complete. Any broader mutation capability,
contract change, additional Canary, commit, or push requires a new explicit scope and authorization.
