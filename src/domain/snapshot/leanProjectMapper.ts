import { classifyProjectKind } from '../project/projectClassifier.js';
import { classifyProjectDate } from '../project/projectDateSemantics.js';
import { classifyProjectStatus } from '../project/projectStatusSemantics.js';
import type { LeanProjectSummary, RawLeanProject } from './snapshotTypes.js';

export function mapRawLeanProject(raw: RawLeanProject): LeanProjectSummary {
  const status = classifyProjectStatus(raw.status);
  if (!status.active || status.raw !== 'Active') {
    throw new Error('Lean Project must have Active status');
  }

  return {
    id: raw.id,
    name: raw.name,
    hasNote: raw.hasNote,
    kind: classifyProjectKind(raw),
    status: 'Active',
    folder: raw.folderId !== null
      ? { id: raw.folderId, name: raw.folderName! }
      : null,
    sequential: raw.sequential,
    flagged: raw.flagged,
    dates: {
      due: classifyProjectDate(raw.dueDate, raw.effectiveDueDate),
      defer: classifyProjectDate(raw.deferDate, raw.effectiveDeferDate),
    },
    tasks: {
      total: raw.totalTaskCount,
      byStatus: { ...raw.taskStatusCounts },
    },
  };
}
