import { classifyDate } from '../task/dateSemantics.js';
import type { AttentionReason, RawLeanTask } from './snapshotTypes.js';

export function classifyAttentionReasons(
  raw: RawLeanTask,
  generatedAt: string,
): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  if (raw.taskStatus === 'Overdue') reasons.push('overdue');
  if (raw.taskStatus === 'DueSoon') reasons.push('dueSoon');

  const planned = classifyDate(raw.plannedDate, raw.effectivePlannedDate);
  if (
    raw.taskStatus !== 'Blocked'
    && planned.source === 'direct'
    && planned.direct !== null
    && Date.parse(planned.direct) <= Date.parse(generatedAt)
  ) {
    reasons.push('planned');
  }

  if (raw.effectiveFlagged) reasons.push('flagged');
  return reasons;
}
