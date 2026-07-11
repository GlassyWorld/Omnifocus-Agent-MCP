import type { ProjectDateSemantics } from '../project/projectTypes.js';
import type { DateSemantics } from '../task/taskTypes.js';
import type {
  LeanProjectSummary,
  ProjectDeadlineState,
  ProjectRootSemantics,
} from './snapshotTypes.js';

export function classifyProjectDeadline(
  project: LeanProjectSummary,
  root: ProjectRootSemantics,
): ProjectDeadlineState | null {
  assertDueSemanticsMatch(project.id, project.dates.due, root.due);

  if (root.due.source !== 'direct') return null;
  if (root.taskStatus === 'Overdue') return 'overdue';
  if (root.taskStatus === 'DueSoon') return 'dueSoon';
  return null;
}

function assertDueSemanticsMatch(
  projectId: string,
  projectDue: ProjectDateSemantics,
  rootDue: DateSemantics,
): void {
  if (
    projectDue.direct !== rootDue.direct
    || projectDue.effective !== rootDue.effective
    || projectDue.source !== rootDue.source
  ) {
    throw new Error(`Project/root Due semantics mismatch for Project ${projectId}`);
  }
}
