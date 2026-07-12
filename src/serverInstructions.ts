import { ServerProfile } from "./config/serverProfile.js";

const PERSONAL_READONLY_INSTRUCTIONS = `This server provides read-only Domain views for analyzing the user's OmniFocus system.

Tool routing:
- Use get_lean_snapshot for current all-system analysis.
- Use get_project for one exact project.
- Use get_task for one exact task-shaped object.
- Use get_completed_since for completion review.

Use the smallest sufficient tool set.
Only drill down when required.
Distinguish confirmed facts, AI inference, and recommendations.
Do not claim that analysis modifies OmniFocus.
No mutation capability is exposed in this profile.`;

const UPSTREAM_FULL_INSTRUCTIONS = `OmniFocus MCP server for macOS task management.

TOOL GUIDANCE:
- Prefer query_omnifocus over dump_database for targeted lookups (85-95% context savings)
- Use the "fields" parameter to request only needed fields
- Use "summary: true" for quick counts without full data
- For batch operations, prefer batch_add_items/batch_remove_items over repeated single calls
- Mutation tools must only be used when the user explicitly requests a specific write operation. Analysis or recommendations do not constitute mutation authorization.

RESOURCES:
- omnifocus://inbox — current inbox items
- omnifocus://today — today's agenda (due, planned, overdue)
- omnifocus://flagged — all flagged items
- omnifocus://stats — quick database statistics
- omnifocus://project/{name} — tasks in a specific project
- omnifocus://perspective/{name} — items in a named perspective

QUERY FILTER TIPS:
- Tags filter is case-sensitive and exact match
- projectName filter is case-insensitive partial match
- Status values for tasks: Next, Available, Blocked, DueSoon, Overdue
- Status values for projects: Active, OnHold, Done, Dropped
- Use reviewDue: true filter on projects to find projects needing review
- Use edit_item with markReviewed: true to mark a project as reviewed
- Combine filters with AND logic; within arrays, OR logic applies`;

export function getServerInstructions(profile: ServerProfile): string {
  return profile === "personal-readonly"
    ? PERSONAL_READONLY_INSTRUCTIONS
    : UPSTREAM_FULL_INSTRUCTIONS;
}
