import { classifyDate } from '../task/dateSemantics.js';
import type { DateSemantics } from '../task/taskTypes.js';
import type { RawLeanProject, RawLeanTask } from './snapshotTypes.js';

export function resolveProjectPlannedDates(
  tasks: RawLeanTask[],
  projects: RawLeanProject[],
): ReadonlyMap<string, DateSemantics> {
  const rootTasks = new Map<string, RawLeanTask>();
  for (const task of tasks) {
    if (!task.isProjectRoot) continue;
    if (rootTasks.has(task.id)) {
      throw new Error(`Duplicate Project root Task for canonical Project ID ${task.id}`);
    }
    rootTasks.set(task.id, task);
  }

  const plannedDates = new Map<string, DateSemantics>();
  for (const project of projects) {
    const rootTask = rootTasks.get(project.id);
    if (!rootTask) {
      throw new Error(`Missing Project root Task for canonical Project ID ${project.id}`);
    }
    plannedDates.set(
      project.id,
      classifyDate(rootTask.plannedDate, rootTask.effectivePlannedDate),
    );
  }
  return plannedDates;
}
