import { classifyDate } from '../task/dateSemantics.js';
import { classifyFlag } from '../task/statusSemantics.js';
import { classifyTaskKind } from '../task/taskClassifier.js';
import type { LeanTaskSummary, RawLeanTask } from './snapshotTypes.js';

export function mapRawLeanTask(raw: RawLeanTask): LeanTaskSummary {
  const kind = classifyTaskKind(raw);
  if (kind === 'project_root') {
    throw new Error('Project root tasks cannot be mapped to LeanTaskSummary');
  }

  return {
    id: raw.id,
    name: raw.name,
    hasNote: raw.hasNote,
    kind,
    project: raw.projectId !== null
      ? { id: raw.projectId, name: raw.projectName! }
      : null,
    location: { inInbox: raw.inInbox },
    status: { taskStatus: raw.taskStatus },
    dates: {
      due: classifyDate(raw.dueDate, raw.effectiveDueDate),
      planned: classifyDate(raw.plannedDate, raw.effectivePlannedDate),
      defer: classifyDate(raw.deferDate, raw.effectiveDeferDate),
    },
    flagged: classifyFlag(raw),
    tags: [...raw.tagNames],
  };
}
