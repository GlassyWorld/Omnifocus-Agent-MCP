import { classifyProjectKind } from './projectClassifier.js';
import { classifyProjectDate } from './projectDateSemantics.js';
import { classifyProjectStatus } from './projectStatusSemantics.js';
import { ProjectView, RawProject } from './projectTypes.js';

export function mapRawProjectToProjectView(raw: RawProject): ProjectView {
  return {
    id: raw.id,
    name: raw.name,
    note: raw.note,
    kind: classifyProjectKind(raw),
    status: classifyProjectStatus(raw.status),
    sequential: raw.sequential,
    flagged: raw.flagged,
    completedByChildren: raw.completedByChildren,
    folder: raw.folderId !== null
      ? {
          id: raw.folderId,
          name: raw.folderName!,
        }
      : null,
    dates: {
      due: classifyProjectDate(raw.dueDate, raw.effectiveDueDate),
      defer: classifyProjectDate(raw.deferDate, raw.effectiveDeferDate),
    },
    tasks: {
      directIds: [...raw.directTaskIds],
      allIds: [...raw.taskIds],
      total: raw.taskIds.length,
      byStatus: { ...raw.taskStatusCounts },
    },
    timestamps: {
      created: raw.creationDate,
      modified: raw.modificationDate,
    },
  };
}
