import { RawTask, TaskKind } from './taskTypes.js';

export function classifyTaskKind(raw: RawTask): TaskKind {
  if (raw.isProjectRoot) {
    return "project_root";
  }
  if (raw.hasChildren) {
    return "action_group";
  }
  return "action";
}
