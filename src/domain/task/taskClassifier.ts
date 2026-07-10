import { RawTask, TaskKind } from './taskTypes.js';

export type TaskKindFacts = Pick<RawTask, 'isProjectRoot' | 'hasChildren'>;

export function classifyTaskKind(raw: TaskKindFacts): TaskKind {
  if (raw.isProjectRoot) {
    return "project_root";
  }
  if (raw.hasChildren) {
    return "action_group";
  }
  return "action";
}
