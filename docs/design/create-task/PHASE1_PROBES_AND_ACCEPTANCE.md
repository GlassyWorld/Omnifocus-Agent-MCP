# `create_task` Phase 1 Probes and Acceptance Record

Status: superseded as the initial probe template by ADR-006 and the recorded 6A/6B/6C Canary path. It is not standalone mutation authorization. The single production Canary was separately and explicitly approved by the user.

## Current Read-only Probe Result (2026-07-13)

- The local SDK exposes `RequestHandlerExtra.requestId`, but retry stability has not been demonstrated in ChatGPT App.
- The read-only OmniFocus probe returned name, document ID and file URL for both default and front documents; both referred to the same current document in this observation.
- Stable identity across OmniFocus/Mac restart and rename has not been demonstrated.
- No isolated allowlisted test database identity or pre-provisioned sentinel is configured in the repository.
- Pure JXA preserved epoch milliseconds exactly for whole-second and millisecond-bearing samples.
- OmniFocus property persistence from `new Date(epochMilliseconds)` and constructor-settable fields remain untested because mutation guard prerequisites are absent.
- Historical gate decision at probe time: stop before mutation integration and production registration. This was later superseded by the accepted ADR-006 write-disabled registration and controlled production Canary sequence; current evidence lives in the three create-task acceptance records.

## Database Identity Feasibility

- Date/time:
- macOS user and isolated environment:
- `defaultDocument` identity fields:
- `frontDocument` identity fields:
- Actual mutation document relation:
- Identity after OmniFocus restart:
- Identity after Mac restart:
- Rename behavior:
- Sync/file URL behavior:
- Pre-provisioned sentinel kind, canonical ID and name:
- Production database confirmed not to contain sentinel:
- Conclusion: stable compound identity available / separate macOS user required

## JXA Date and Constructor Capability

- Guard passed before any mutation probe:
- `new Date(epochMilliseconds)` stored instant:
- Readback error in milliseconds:
- `Z` vs equivalent offset:
- DST spring-forward/fall-back:
- Mac timezone differs from input offset:
- System language switch:
- Constructor-settable properties:
- Post-create-only properties:
- Earliest reliable task ID:
- Error path returns task ID:
- Cleanup and final not_found:

## MCP Request Metadata and Client Retry Key Stability

For every row, record the first and second JSON-RPC request IDs, Tool argument key, whether the server wrote once, and evidence.

| Scenario | Stable request metadata | Stable argument key | One write | Evidence |
|---|---:|---:|---:|---|
| Tool response timeout |  |  |  |  |
| MCP connection interruption |  |  |  |  |
| Server completed; client missed response |  |  |  |  |
| Client manual retry |  |  |  |  |
| Model makes a second Tool call |  |  |  |  |

If neither request metadata nor the argument key is stable for transparent retry, stop registration and design prepare/commit.

## Production Registration Gate

- [ ] Database compound identity and sentinel accepted
- [ ] JXA date/constructor probe accepted
- [x] Integration create/readback/cleanup/not_found passed through the explicitly approved single production Canary
- [x] Ledger concurrency, crash and privacy tests passed
- [x] Client retry key stability accepted for the approved Web-only scope
- [x] Write confirmation UI accepted
- [x] Agent write false positives are zero in the user-executed routing eval
- [x] `personal-production` had four Tools before write-disabled registration
- [x] Registration changed the exact set to five Tools only
