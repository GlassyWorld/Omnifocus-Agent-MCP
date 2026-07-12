import { describe, expect, it } from 'vitest';
import type { ProjectView } from './projectTypes.js';
import { getProjectSuccessSchema, projectViewSchema } from './projectSchemas.js';

const validProjectView: ProjectView = {
  id: 'project-1',
  name: 'Project',
  note: '',
  kind: 'standard',
  status: { raw: 'Active', active: true, onHold: false, completed: false, dropped: false },
  sequential: false,
  flagged: false,
  completedByChildren: false,
  folder: null,
  dates: {
    due: { direct: null, effective: null, source: 'none' },
    defer: { direct: null, effective: null, source: 'none' },
  },
  tasks: {
    directIds: [],
    allIds: [],
    total: 0,
    byStatus: {
      available: 0,
      next: 0,
      blocked: 0,
      dueSoon: 0,
      overdue: 0,
      completed: 0,
      dropped: 0,
    },
  },
  timestamps: { created: null, modified: null },
};

describe('ProjectView output schema', () => {
  it('accepts a complete mapped ProjectView and nullable folder', () => {
    expect(projectViewSchema.parse(validProjectView)).toEqual(validProjectView);
    expect(getProjectSuccessSchema.safeParse({
      success: true,
      project: validProjectView,
    }).success).toBe(true);
  });

  it('rejects missing and invalid deep task aggregates', () => {
    const { overdue: _overdue, ...incompleteCounts } = validProjectView.tasks.byStatus;
    expect(projectViewSchema.safeParse({
      ...validProjectView,
      tasks: {
        ...validProjectView.tasks,
        byStatus: incompleteCounts,
      },
    }).success).toBe(false);
    expect(projectViewSchema.safeParse({
      ...validProjectView,
      tasks: { ...validProjectView.tasks, total: -1 },
    }).success).toBe(false);
  });

  it('rejects invalid ProjectKind and extra fields', () => {
    expect(projectViewSchema.safeParse({ ...validProjectView, kind: 'parallel' }).success).toBe(false);
    expect(projectViewSchema.safeParse({ ...validProjectView, health: 'good' }).success).toBe(false);
  });
});
