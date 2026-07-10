import { z } from 'zod';
import { classifyAttentionReasons } from './attentionClassifier.js';
import { mapRawLeanProject } from './leanProjectMapper.js';
import { mapRawLeanTask } from './leanTaskMapper.js';
import {
  compareAttention,
  compareInboxTasks,
  compareProjects,
  type AttentionCandidate,
  type LeanTaskCandidate,
} from './snapshotSorting.js';
import type {
  AttentionReason,
  LeanSnapshotView,
  RawLeanProject,
  RawLeanTask,
  SnapshotList,
} from './snapshotTypes.js';

const absoluteDateTimeSchema = z.string().datetime({ offset: true });

export type LeanSnapshotComposerInput = {
  generatedAt: string;
  limitPerSection: number;
  tasks: RawLeanTask[];
  projects: RawLeanProject[];
};

export function composeLeanSnapshot(input: LeanSnapshotComposerInput): LeanSnapshotView {
  if (!absoluteDateTimeSchema.safeParse(input.generatedAt).success) {
    throw new Error('generatedAt must be a valid ISO datetime with timezone');
  }
  if (
    !Number.isInteger(input.limitPerSection)
    || input.limitPerSection < 1
    || input.limitPerSection > 100
  ) {
    throw new Error('limitPerSection must be an integer from 1 through 100');
  }
  assertUniqueIds(input.tasks, 'Task');
  assertUniqueIds(input.projects, 'Project');

  const projectItems = input.projects.map(mapRawLeanProject).sort(compareProjects);
  const activeProjects = buildSnapshotList(projectItems, input.limitPerSection);

  const taskCandidates: LeanTaskCandidate[] = input.tasks
    .filter(task => !task.isProjectRoot)
    .map(raw => ({ raw, summary: mapRawLeanTask(raw) }));

  const byReason: Record<AttentionReason, number> = {
    overdue: 0,
    dueSoon: 0,
    planned: 0,
    flagged: 0,
  };
  const attentionCandidates: AttentionCandidate[] = [];
  for (const candidate of taskCandidates) {
    const reasons = classifyAttentionReasons(candidate.raw, input.generatedAt);
    for (const reason of reasons) byReason[reason] += 1;
    if (reasons.length > 0) {
      attentionCandidates.push({
        ...candidate,
        item: { task: candidate.summary, reasons },
      });
    }
  }
  attentionCandidates.sort(compareAttention);
  const attentionItems = attentionCandidates
    .slice(0, input.limitPerSection)
    .map(candidate => candidate.item);

  const inboxCandidates = taskCandidates
    .filter(candidate => candidate.raw.inInbox)
    .sort(compareInboxTasks);
  const inboxItems = inboxCandidates
    .slice(0, input.limitPerSection)
    .map(candidate => candidate.summary);

  return {
    generatedAt: input.generatedAt,
    scope: 'all',
    projects: { active: activeProjects },
    attention: {
      total: attentionCandidates.length,
      returned: attentionItems.length,
      truncated: attentionCandidates.length > attentionItems.length,
      byReason,
      items: attentionItems,
    },
    inbox: {
      total: inboxCandidates.length,
      returned: inboxItems.length,
      truncated: inboxCandidates.length > inboxItems.length,
      items: inboxItems,
    },
  };
}

function buildSnapshotList<T>(items: T[], limit: number): SnapshotList<T> {
  const returnedItems = items.slice(0, limit);
  return {
    total: items.length,
    returned: returnedItems.length,
    truncated: items.length > returnedItems.length,
    items: returnedItems,
  };
}

function assertUniqueIds(items: Array<{ id: string }>, entity: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${entity} IDs must be unique`);
    ids.add(item.id);
  }
}
