import { ProjectStatusSemantics } from './projectTypes.js';

export function classifyProjectStatus(status: string): ProjectStatusSemantics {
  return {
    raw: status,
    active: status === 'Active',
    onHold: status === 'OnHold',
    completed: status === 'Done',
    dropped: status === 'Dropped',
  };
}
