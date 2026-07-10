import { classifyDate } from './dateSemantics.js';
import { classifyCompletion, classifyDrop, classifyFlag } from './statusSemantics.js';
import { classifyTaskKind } from './taskClassifier.js';
import { RawTask, TaskView } from './taskTypes.js';

export function mapRawTaskToTaskView(raw: RawTask): TaskView {
  return {
    id: raw.id,
    name: raw.name,
    note: raw.note,
    kind: classifyTaskKind(raw),
    status: {
      taskStatus: raw.taskStatus,
      completion: classifyCompletion(raw),
      drop: classifyDrop(raw),
      flagged: classifyFlag(raw),
    },
    dates: {
      due: classifyDate(raw.dueDate, raw.effectiveDueDate),
      planned: classifyDate(raw.plannedDate, raw.effectivePlannedDate),
      defer: classifyDate(raw.deferDate, raw.effectiveDeferDate),
    },
    project: raw.projectId !== null
      ? {
          id: raw.projectId,
          name: raw.projectName!,
        }
      : null,
    location: {
      inInbox: raw.inInbox,
    },
    hierarchy: {
      parentId: raw.parentId,
      childIds: raw.childIds,
      hasChildren: raw.hasChildren,
      sequential: raw.sequential,
      completedByChildren: raw.completedByChildren,
    },
    tags: raw.tagNames,
    repeat: {
      isRepeating: raw.isRepeating,
      rule: raw.repetitionRule,
    },
    estimate: {
      minutes: raw.estimatedMinutes,
    },
    timestamps: {
      created: raw.creationDate,
      modified: raw.modificationDate,
    },
  };
}
