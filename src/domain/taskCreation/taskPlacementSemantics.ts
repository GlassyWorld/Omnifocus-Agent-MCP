import type { TaskView } from "../task/taskTypes.js";

/**
 * OmniFocus exposes a Project's root Task ID as the canonical Project ID.
 * A direct child action therefore has that same ID as both project.id and
 * hierarchy.parentId. This is Project top-level placement, not Phase 4's
 * ordinary parent-task placement.
 */
export function isTopLevelTaskInProject(
  task: TaskView,
  requestedProjectId: string,
): boolean {
  return task.location.inInbox === false
    && task.project?.id === requestedProjectId
    && task.hierarchy.parentId === requestedProjectId;
}
