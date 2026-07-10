import { CompletedTaskKind, RawCompletedTask } from './completionTypes.js';

export function classifyCompletedTaskKind(raw: RawCompletedTask): CompletedTaskKind {
  return raw.hasChildren ? "action_group" : "action";
}
