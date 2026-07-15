import type { TaskView } from "../task/taskTypes.js";

export function isTaskUnderOrdinaryParent(
  task: TaskView,
  parentTaskId: string,
  containingProjectId: string | null,
): boolean {
  if (task.location.inInbox !== false || task.hierarchy.parentId !== parentTaskId) {
    return false;
  }
  return containingProjectId === null
    ? task.project === null
    : task.project?.id === containingProjectId;
}
