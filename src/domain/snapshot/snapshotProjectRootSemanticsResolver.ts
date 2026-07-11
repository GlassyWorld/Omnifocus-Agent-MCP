import { classifyDate } from '../task/dateSemantics.js';
import type {
  ProjectRootSemantics,
  RawLeanProject,
  RawLeanTask,
} from './snapshotTypes.js';

export function resolveProjectRootSemantics(
  tasks: RawLeanTask[],
  projects: RawLeanProject[],
): ReadonlyMap<string, ProjectRootSemantics> {
  const rootTasks = new Map<string, RawLeanTask>();
  for (const task of tasks) {
    if (!task.isProjectRoot) continue;
    if (rootTasks.has(task.id)) {
      throw new Error(`Duplicate Project root Task for canonical Project ID ${task.id}`);
    }
    rootTasks.set(task.id, task);
  }

  const semantics = new Map<string, ProjectRootSemantics>();
  for (const project of projects) {
    const rootTask = rootTasks.get(project.id);
    if (!rootTask) {
      throw new Error(`Missing Project root Task for canonical Project ID ${project.id}`);
    }
    semantics.set(project.id, {
      planned: classifyDate(rootTask.plannedDate, rootTask.effectivePlannedDate),
      due: classifyDate(rootTask.dueDate, rootTask.effectiveDueDate),
      taskStatus: rootTask.taskStatus,
    });
  }
  return semantics;
}
