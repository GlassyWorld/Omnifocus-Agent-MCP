# `create_task` Checkpoint 7 Formal Production Enablement

Status: passed on 2026-07-13. Corrected required-key Schema, refreshed Web disabled gate, formal enablement, public create/read, user confirmation/deletion, and final dual `not_found` cleanup all passed.

## Authorization and scope

- The user explicitly authorized Checkpoint 7 formal production enablement after Checkpoint 6C passed and its Canary was manually deleted.
- The enabled surface remains `create_task` V1 only: one explicit Inbox Task per call.
- Project, parent, Tag, batch, repeat, notification, update, complete, and delete mutations remain outside the personal production surface.

## Pre-deployment gates

- `npm test`: 40 files, 645 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Checkpoint 6A, 6B, and 6C: passed.
- Checkpoint 6C cleanup: original Task ID and exact name both returned `not_found` after the user deleted the Canary.

## Enablement execution

The production owner of `OMNIFOCUS_CREATE_TASK_ENABLED` is the main Tunnel LaunchAgent. The Tunnel profile remains the independent owner of `OMNIFOCUS_MCP_PROFILE=personal-production`.

The first reload attempt was not accepted as a deployment result: after both jobs were unloaded, `launchctl bootstrap` returned I/O error 5. The fail-closed flow restored the plist to `false`, restarted the main service, restored the watchdog, and confirmed the disabled service was available before any retry. No MCP mutation call was made during this failed attempt.

The reload controller was then corrected to wait for complete unload, allow launchd state to settle before bootstrap, and prevent recursive exit-trap restoration. The formal retry passed:

- LaunchAgent plist flag: `true`.
- Loaded main-process environment: `OMNIFOCUS_CREATE_TASK_ENABLED => true`.
- Main LaunchAgent: running.
- Tunnel startup: metadata fetched and tunnel-client started.
- MCP child command: built server with `OMNIFOCUS_MCP_PROFILE=personal-production`.
- Health/readiness at enablement completion: `live` / `ready`.
- Watchdog: loaded; authoritative readiness route is `http://127.0.0.1:18080/readyz`.
- Ledger mutation lock: absent.
- No `create_task` call was issued as part of configuration enablement.

## Post-deployment capability boundary

A fresh MCP protocol session against the deployed build returned exactly:

1. `create_task`
2. `get_completed_since`
3. `get_lean_snapshot`
4. `get_project`
5. `get_task`

Resources capability was absent. The only registered mutation tool was `create_task`.

## Initial public-path acceptance plan

The server-side enablement initially required one call through the public ChatGPT Web/Tunnel path, because a local one-shot process could not prove that the public control-plane route was using the newly loaded flag.

Use this unique Task name:

`MCP-CREATE-TASK-FINAL-20260713-214715`

Preflight exact-name `get_task` returned `not_found`, so the name was unused immediately before the public-path test.

The acceptance criteria were:

- Web invokes `create_task` once with the exact name and no optional fields;
- the response reports success and `location.kind=inbox`;
- `get_task` reads back the same Task by exact name and returned ID;
- exact-name lookup resolves to one Task, not `ambiguous_match`;
- the audit record contains only allowlisted hashes/metadata and reports success;
- no mutation lock remains;
- the user confirms the single Inbox Task and deletes it after verification;
- final ID and exact-name reads both return `not_found`.

The first attempt with this name failed safely before write as recorded below. The same criteria were later satisfied with the corrected Schema and the new final name documented in the final result sections.

## First Web-path attempt and corrective action

The first Web request sent only `name`. The handler returned `invalid_arguments` because neither an explicit `idempotencyKey` nor an enabled, verified stable MCP request-ID source was present.

- `mayHaveWritten=false`.
- Web did not retry `create_task`.
- Web did not call `get_task` or delete anything.
- No Task was created and no uncertain database state exists.

This exposed a public-contract mismatch: ADR-006 permits omission of `idempotencyKey` only after request-ID stability is verified, but the deployed Schema still marked the field optional while the stability gate remained disabled. The correction is to require a UUID in the public Tool Schema and instruct the model to generate it for each new user-authorized creation intent. The user is not asked to manage this implementation detail. Internal support for a future stable metadata source remains disabled pending a separate acceptance gate.

## Corrected Schema deployment gate

The initial correction made runtime validation require the key but revealed a second SDK-specific mismatch: MCP SDK 1.29 serialized the refined/effects input schema as `{ "type": "object", "properties": {} }`. The server rejected missing keys, but the client could not see any required fields.

The final registration uses a strict ZodObject for MCP publication and retains the full strict/date-relation parse in the handler. Wire-level acceptance now proves:

- eight public properties are present;
- `required` is exactly `name` plus `idempotencyKey`;
- `idempotencyKey` has JSON Schema format `uuid`;
- `additionalProperties=false`;
- a missing key is rejected by SDK input validation;
- an explicit UUID reaches the handler and returns `write_disabled`, `mayHaveWritten=false` while disabled;
- exactly five Tools remain registered.

Validation after correction:

- `npm test`: 40 files, 646 tests passed;
- `npm run build`: passed;
- `git diff --check`: passed;
- corrected build deployed with LaunchAgent flag `false`;
- `healthz=live`, `readyz=ready`, watchdog loaded.

Because Tool metadata changed, ChatGPT App Refresh is required. After Refresh, one Web call must show that the model supplies a UUID automatically while the server remains disabled. Only then may the production flag be restored to `true` for the final public create/read acceptance.

The user completed this gate after Refresh:

- Web called `create_task` exactly once;
- the model supplied the required UUID without asking the user;
- result was `write_disabled`;
- no retry, read, or delete call occurred;
- latest audit result was `write_disabled`;
- args-key hash equaled effective-key hash;
- audit mode was `0600` and the record contained only the six-field allowlist;
- Ledger lock was absent;
- LaunchAgent remained `false`, `healthz=live`, and `readyz=ready` during the gate.

The fail-closed enablement controller then restored the formal production configuration successfully:

- `PUBLIC_CREATE_TASK_FLAG=true`;
- `HEALTH=live`;
- `READY=ready`;
- `WATCHDOG=loaded`.

No MCP mutation call was issued during re-enablement. The new final acceptance name `MCP-CREATE-TASK-FINAL-20260713-221813` returned `not_found` in the preflight read.

## Final public create/read result

The refreshed public ChatGPT Web/Tunnel path completed the final write test:

- `create_task` was called exactly once;
- the model supplied a UUID `idempotencyKey` automatically;
- the Task was created in Inbox with the exact requested name;
- no optional business fields were supplied;
- `get_task` was called exactly once by the returned ID and succeeded;
- Web did not retry creation and did not delete the Task.

Server-side verification:

- Task ID hash: `afe6d4463b2e`;
- exact ID and exact-name reads returned the same Task;
- exact-name lookup returned one object, not `ambiguous_match`;
- location was Inbox;
- Note was empty; planned/due/defer were null; direct flag was false; estimate was null;
- Project, parent, Tags, repeat, and children were absent;
- latest audit result was `success`;
- args-key hash equaled effective-key hash `531a93912de411b6465ee28e9043bb0a835d20ec76cae566edec4c40d9e99388`;
- audit mode was `0600` and the record used only the six-field allowlist;
- Ledger directory/record modes were `0700/0600`;
- Ledger's own read path validated the checksum and returned `state=verified`, matching Task ID, `resultCode=success`, and a 24-hour replay window;
- the actual `mutation.lock` path was absent.

## Cleanup and final status

The user confirmed exactly one correct Inbox Task and deleted it manually. Final verification passed:

- original Task ID returned `not_found`;
- exact Task name returned `not_found`;
- permanent Ledger tombstone remained checksum-valid and `state=verified`;
- latest audit remained the single `success` record for the accepted creation;
- actual `mutation.lock` remained absent;
- LaunchAgent plist and loaded process environment both remained `OMNIFOCUS_CREATE_TASK_ENABLED=true`;
- `healthz=live`, `readyz=ready`, and watchdog remained loaded.

Conclusion: Checkpoint 7 passed. `create_task` V1 is formally enabled for the public `personal-production` surface with the corrected required UUID Schema. The production boundary remains exactly five Tools, no Resources, and no other personal-production mutation capability.
