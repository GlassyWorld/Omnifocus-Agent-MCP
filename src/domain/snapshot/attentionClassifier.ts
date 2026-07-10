import type { AttentionReason, RawLeanTask } from './snapshotTypes.js';

export function classifyAttentionReasons(
  raw: RawLeanTask,
  generatedAt: string,
): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  if (raw.taskStatus === 'Overdue') reasons.push('overdue');
  if (raw.taskStatus === 'DueSoon') reasons.push('dueSoon');

  if (
    raw.taskStatus !== 'Blocked'
    && raw.effectivePlannedDate !== null
    && Date.parse(raw.effectivePlannedDate) <= Date.parse(generatedAt)
  ) {
    reasons.push('planned');
  }

  if (raw.effectiveFlagged) reasons.push('flagged');
  return reasons;
}
