# `create_task` Client Retry Key Acceptance

Status: Checkpoint 6B passed for the approved Web-only client scope on 2026-07-13. Privacy-safe server audit was validated and deployed with `OMNIFOCUS_CREATE_TASK_ENABLED=false`. Store hashes only; never record raw request IDs or keys.

| Scenario | Request metadata hash stable | Args key hash stable | Effective key hash stable | Notes |
|---|---:|---:|---:|---|
| Transparent Tool retry | not applicable in observed Web Retry | not applicable | not applicable | Web Retry produced no second `create_task` audit record |
| Connection interruption retry |  |  |  |  |
| Server response missed |  |  |  |  |
| Manual retry button | single Tool invocation | single Tool invocation | single Tool invocation | user completed Retry; audit remained at one `write_disabled` call |
| Manual new natural-language request |  |  |  |  |
| Web client | no Tool-level retry observed | no Tool-level retry observed | no Tool-level retry observed | exact task readback remained `not_found` |
| iPhone client | not applicable | not applicable | not applicable | removed from the approved acceptance scope by the user |

## Local protocol control

Two write-disabled calls with identical arguments and the same explicit `idempotencyKey` produced different JSON-RPC request IDs. The request metadata hash and derived correlation ID therefore changed, while both the args key hash and effective key hash remained stable. This proves the explicit-key path but is not a transparent client retry and does not satisfy the client gate.

- Result codes: `write_disabled`, `write_disabled`
- Request metadata hash stable: no
- Args key hash stable: yes
- Effective key hash stable: yes
- Audit fields: only correlation ID, request metadata hash, args key hash, effective key hash, result code, elapsed time
- Privacy: raw Task name, Note, and key absent
- Invalid Schema calls: no audit record; they were rejected at SDK registration validation

## First client run and audit transport correction

The user reported that the seven Web routing/UI/retry checks passed. The original audit sink wrote to MCP child-process stderr, but Tunnel did not retain or forward those lines to its configured stdout/stderr logs. Therefore the routing and UI observations are accepted as client evidence, while the first retry cannot be used as hash evidence.

The audit sink was changed to a dedicated JSONL file outside the Ledger directory. The directory is forced to mode `0700`, the file to `0600`, and every line is restricted to the six-field allowlist. A temporary-HOME protocol run produced exactly two records, stable args/effective key hashes, no raw Task content or key, and mode `0600`. The corrected sink was then deployed while the loaded mutation flag remained `false`.

The final Web operation produced one valid `write_disabled` audit record, not two. Therefore the Web Retry action did not retry the MCP Tool call and could not cause a duplicate mutation attempt. Exact `get_task` readback for `CREATE_TASK_RETRY_DISABLED_6B_WEB` returned `not_found`; the Ledger directory remained absent. Tool-level repeated-call stability is covered by the local protocol control, where identical explicit keys produced stable args/effective key hashes.

Final conclusion: `stable` for the approved Web-only scope. The observed Web Retry does not reissue `create_task`; the explicit-key Tool-level retry path is stable under protocol control.

Transparent retry must preserve the effective key. A manually re-entered request may use a new key because it can represent a new user intent. `unstable` or `inconclusive` blocks Checkpoint 6C and returns the design to prepare/commit.
