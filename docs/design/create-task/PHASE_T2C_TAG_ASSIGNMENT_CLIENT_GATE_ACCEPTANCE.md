# Phase T2-C Tag Assignment Client Gate Acceptance

> Status: passed on 2026-07-14<br>
> Mutation result: no OmniFocus object was created, modified, or deleted<br>
> Final loaded flags: global=true, Project=true, Tag=false

## Scope

This acceptance closes only the T2-C public V3 Schema, App Refresh, client routing, and fail-closed
deployment gate. It does not approve a tagged mutation Canary, Tag flag enablement, T2-E production
enablement, or Phase 4.

Privacy-safe evidence deliberately omits real Tag IDs, names, and paths. The synthetic Task name is
retained because it is an acceptance locator and was independently verified absent before and after
the client request.

## Repository and protocol gates

- 58 test files / 828 tests passed.
- Build, JXA syntax check, Base64 zero-write roundtrip, and `git diff --check` passed.
- The current `dist/server.js` published exactly six Tools: five Domain read Tools including
  `search_tags`, plus the sole mutation Tool `create_task`.
- Resources capability was absent.
- Client-visible V3 input included optional `tagIds` with 1–5 items; tagged success output exposed
  optional `created.tagIds`.
- `create_task` annotations remained readOnly=false, destructive=false, idempotent=true, and
  openWorld=false.

## Fail-closed deployment and App Refresh

The V3 build was first loaded with:

```text
global=false
Project=true
Tag=false
health=live
ready=ready
watchdog=loaded
```

The user manually refreshed the ChatGPT App metadata. A client statement that `search_tags` was
absent was rejected as capability evidence: source registration, built registration, direct STDIO
`tools/list`, and the healthy Tunnel route all showed the exact six-Tool surface. In a fresh client
conversation, `search_tags` then successfully resolved one unique Active Tag by its complete path.

## Negative tagged-creation route

The user explicitly requested one Inbox Task named
`T2C_NEGATIVE_TAG_ROUTING_20260714` with the freshly confirmed existing Active Tag. The client
preserved the Tag requirement and invoked the V3 creation path; it did not silently retry without
`tagIds` and did not create a missing Tag.

The server returned:

```text
code=write_disabled
mayHaveWritten=false
```

The global gate intentionally ran before the Tag-specific gate, so this request did not return
`tag_assignment_disabled`. The client correctly reported that no Task or untagged fallback was
created.

## Server-side post-checks

- Exact-name readback before and after the client request: `not_found`.
- Audit file mode: `0600`.
- Audit delta: exactly one record.
- Audit `resultCode`: `write_disabled`.
- Audit keys were limited to `correlationId`, three allowed hashes, `resultCode`, and `elapsedMs`.
- Ledger signature: unchanged from the pre-request snapshot.
- Actual `mutation.lock`: absent.
- No real Tag ID, name, or path was written to the audit, Ledger, or this acceptance document.

## Existing write-path restoration

After the gate passed, the existing Inbox/Project capability was restored while Tag assignment
remained disabled. The candidate plist changed only the global flag. The first immediate bootstrap
after bootout returned a transient `Input/output error`; a retry after confirming the service was
fully unloaded succeeded without changing the candidate configuration.

Final host checks:

```text
loaded global=true
loaded Project=true
loaded Tag=false
Tunnel status=healthy
health=live
ready=ready
watchdog=loaded
mutation.lock=absent
```

No App Refresh is required for this flag-only restoration because Tool names, descriptions, Schema,
annotations, and authentication metadata did not change.

## Gate result

T2-C is accepted. T2-D is now eligible for a separate approval decision, but no tagged Inbox or
Project Canary is authorized by this document. T2-E formal Tag enablement remains blocked until the
individually approved Canary sequence, exact ID-set readback, user cleanup, and final acceptance all
pass.
