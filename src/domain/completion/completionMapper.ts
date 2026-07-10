import { classifyCompletedTaskKind } from './completionClassifier.js';
import { CompletedTaskView, RawCompletedTask } from './completionTypes.js';

export function mapRawCompletedTaskToView(raw: RawCompletedTask): CompletedTaskView {
  return {
    id: raw.id,
    name: raw.name,
    note: raw.note,
    kind: classifyCompletedTaskKind(raw),
    completedDate: raw.completionDate,
    project: raw.projectId !== null
      ? {
          id: raw.projectId,
          name: raw.projectName!,
        }
      : null,
    location: {
      inInbox: raw.inInbox,
    },
    tags: [...raw.tagNames],
    timestamps: {
      created: raw.creationDate,
      modified: raw.modificationDate,
    },
  };
}
