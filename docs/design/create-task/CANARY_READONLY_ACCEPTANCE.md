# `create_task` Canary Read-only Acceptance

Status: Checkpoint 6B passed for the user-approved Web-only client scope on 2026-07-13. No mutation was performed by this acceptance run.

## Server Surface

- Expected Profile: `personal-production`
- Expected Tools: `get_task`, `get_project`, `get_completed_since`, `get_lean_snapshot`, `create_task`
- Expected Resources: none
- Mutation flag: `OMNIFOCUS_CREATE_TASK_ENABLED=false`
- Observed local MCP Tool set: exact five expected Tools
- Observed Resources: capability absent; zero Resources
- Disabled protocol call: `isError=true`, `write_disabled`, `mayHaveWritten=false`, `retrySafe=false`, no `structuredContent`
- Disabled task exact readback: `not_found`
- Ledger directory after disabled call: absent
- Deployed service: `healthz=live`, `readyz=ready`, main service running, watchdog loaded
- Loaded LaunchAgent flag: exact lowercase `false`
- Privacy-safe Retry audit reload: deployed while loaded flag remained `false`; post-reload health/ready passed and Ledger directory remained absent
- Privacy log scan for Canary/task/note fixture content: passed; no match
- Observed ChatGPT Tool metadata: Refresh completed; `create_task` visibility user-confirmed
- Write confirmation UI: passed by user report
- Disabled request returned exact `write_disabled`: passed at local protocol layer and user-confirmed client test
- OmniFocus confirmed no Canary-disabled task: passed by exact `get_task` not_found

## Routing and Schema

- Explicit Inbox create routed to `create_task`: passed by user report for the disabled Canary and retry test
- Statement/planning prompts did not call it: passed by user report for statement and planning prompts
- Ambiguous reminder clarified: passed by user report
- Tag/Project requests refused without Inbox fallback: passed by user report
- Pure date/no-offset rejected: passed at local MCP registration layer with SDK `-32602`; Web natural-language reproduction was explicitly removed because it cannot control raw Tool JSON
- Project/parent/Tag/repeat/notification/batch fields rejected: passed at local MCP registration layer with SDK `-32602`; Tag/Project refusal also passed in Web routing tests
- Invalid estimates rejected: `0`, `-1`, and `10081` passed at local MCP registration layer with SDK `-32602`

## Real Library Read-only Contract

Record only object ID hashes or redacted names.

| Object class | ID/name hash | Contract observations | Schema drift |
|---|---|---|---|
| Inbox Task | `b87b9eaffb3a` | completed Task retained `location.inInbox=true`; current active Inbox Snapshot remained empty | none |
| Project Task | `d9d7fe68e837` | action; Project context present; parent present; one Tag; direct completion; UTC timestamps | none |
| Direct date Task | `31183ae82ec0` | planned direct/effective are ISO 8601 UTC with `source=direct`; due/defer are explicit null with `source=none` | none |
| Effective/inherited date Task | `c6b7d279b0f1` | action group; due and planned direct are null while effective is ISO 8601 UTC with `source=inherited`; 9 children; sequential and completed-by-children true | none |
| Note Task | `31183ae82ec0` | two LF-delimited lines preserved; no CRLF | none |
| Tagged Task | `d9d7fe68e837` | one Tag returned; only the Tag hash `e06ff957ed48` was recorded | none |
| Completed Task | `d9d7fe68e837` | direct completion true; direct/effective completion dates ISO 8601 UTC; `source=direct` | none |
| Flagged Task | unavailable in sample | initial 45 exact reads plus all 37 current-year completed Tasks found no effective flag; current Snapshot Attention was empty | not assessed |
| Estimated Task | unavailable in sample | initial 45 exact reads plus all 37 current-year completed Tasks found no non-null estimate | not assessed |
| Repeating Task | unavailable in sample | initial 45 exact reads plus all 37 current-year completed Tasks found no repeating Task | not assessed |

- Null/missing/zero behavior: strict output fields were present; absent scalar values used explicit `null`, empty Tags/children used `[]`, and false states used `false`. No selected estimate was available to distinguish `null` from a real zero value; Schema rejects zero on create.
- Note newline behavior: the sampled multiline Note preserved two LF-delimited lines and did not contain CRLF. Note text was not recorded.
- Direct/effective provenance: both `source=direct` and `source=inherited` were observed with the expected null/direct/effective combinations.
- Tag readback: one Tag was returned and represented only by its SHA-256 truncated hash.
- Estimate readback: pending because no non-null estimate was found in 45 exact Task reads.
- Project aggregate: hash `ff0aa0e1bc4a`; `single_actions`; no folder; task total matched `allIds`; absent dates and timestamps were explicit null.
- Completed event stream: 37 events since `2026-01-01T00:00:00+08:00`; sampled event hash `31183ae82ec0` had UTC completion/timestamps, Project context, a two-line Note shape, and one Tag.
- Scan scope: five Project aggregates, an initial 45 exact Tasks, all 37 current-year completed Tasks, and 37 completion events. One completed Inbox Task was found. Snapshot lists were not truncated.
- Verifier assumption corrections: none found for covered fields. Inbox, flagged, estimate, and repeat assumptions remain unverified because no suitable real object was observed.
- Privacy log review: acceptance output contains no raw names, Notes, Tags, IDs, or idempotency keys.
- Client UI automation: not performed; Computer Use is prohibited from controlling the active Codex app, so the user-confirmed ChatGPT App result is recorded without pretending local UI evidence.
- Client scope adjustment: iPhone coverage was removed by the user. Raw Schema boundary validation remains authoritative at the SDK/protocol layer rather than natural-language Web prompts.
- Web Retry observation: one allowlisted `write_disabled` audit record, mode `0600`; Retry produced no second Tool call. Exact readback was `not_found`, and the Ledger remained absent.

Conclusion: passed for Checkpoint 6B. Covered read-side contracts and Web routing/UI checks passed. Flagged/non-null estimate/repeat real-library fixtures were unavailable and remain explicitly unobserved; they are not treated as fabricated evidence and do not expand the first minimal-field 6C Canary.
