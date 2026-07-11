import type {
  AttentionReason,
  LeanAttentionItem,
  LeanProjectSummary,
  LeanTaskSummary,
  RawLeanTask,
} from './snapshotTypes.js';

export type LeanTaskCandidate = {
  raw: RawLeanTask;
  summary: LeanTaskSummary;
};

export type AttentionCandidate = LeanTaskCandidate & {
  item: LeanAttentionItem;
};

const REASON_RANK: Record<AttentionReason, number> = {
  overdue: 0,
  dueSoon: 1,
  planned: 2,
  flagged: 3,
};

const SOURCE_RANK = { direct: 0, inherited: 1, none: 2 } as const;

export function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareProjects(left: LeanProjectSummary, right: LeanProjectSummary): number {
  const leftRootRank = left.folder === null ? 0 : 1;
  const rightRootRank = right.folder === null ? 0 : 1;
  return compareNumbers(leftRootRank, rightRootRank)
    || compareCodeUnits(left.folder?.name ?? '', right.folder?.name ?? '')
    || compareCodeUnits(left.folder?.id ?? '', right.folder?.id ?? '')
    || compareCodeUnits(left.name, right.name)
    || compareCodeUnits(left.id, right.id);
}

export function comparePlannedProjects(
  left: LeanProjectSummary,
  right: LeanProjectSummary,
): number {
  return compareNullableDates(left.dates.planned.direct, right.dates.planned.direct)
    || compareCodeUnits(left.name, right.name)
    || compareCodeUnits(left.id, right.id);
}

export function compareInboxTasks(left: LeanTaskCandidate, right: LeanTaskCandidate): number {
  return compareNullableDates(left.raw.creationDate, right.raw.creationDate)
    || compareCodeUnits(left.summary.name, right.summary.name)
    || compareCodeUnits(left.summary.id, right.summary.id);
}

export function compareAttention(left: AttentionCandidate, right: AttentionCandidate): number {
  const leftReason = left.item.reasons[0];
  const rightReason = right.item.reasons[0];
  const reasonComparison = compareNumbers(REASON_RANK[leftReason], REASON_RANK[rightReason]);
  if (reasonComparison !== 0) return reasonComparison;

  let detailComparison = 0;
  if (leftReason === 'overdue' || leftReason === 'dueSoon') {
    detailComparison = compareNumbers(
      SOURCE_RANK[left.summary.dates.due.source],
      SOURCE_RANK[right.summary.dates.due.source],
    ) || compareNullableDates(
      left.summary.dates.due.effective,
      right.summary.dates.due.effective,
    );
  } else if (leftReason === 'planned') {
    detailComparison = compareNullableDates(
      left.summary.dates.planned.direct,
      right.summary.dates.planned.direct,
    );
  } else {
    detailComparison = compareNullableDates(
      left.summary.dates.planned.effective,
      right.summary.dates.planned.effective,
    ) || compareNullableDates(
      left.summary.dates.due.effective,
      right.summary.dates.due.effective,
    );
  }

  return detailComparison
    || compareCodeUnits(left.summary.name, right.summary.name)
    || compareCodeUnits(left.summary.id, right.summary.id);
}

function compareNullableDates(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return compareNumbers(Date.parse(left), Date.parse(right));
}

function compareNumbers(left: number, right: number): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
