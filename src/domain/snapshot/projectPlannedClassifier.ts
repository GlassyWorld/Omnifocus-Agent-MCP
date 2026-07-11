import type { LeanProjectSummary } from './snapshotTypes.js';

export function isProjectPlannedReady(
  project: LeanProjectSummary,
  generatedAt: string,
): boolean {
  const planned = project.dates.planned;
  return planned.source === 'direct'
    && planned.direct !== null
    && Date.parse(planned.direct) <= Date.parse(generatedAt);
}
