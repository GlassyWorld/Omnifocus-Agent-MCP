import { ProjectDateSemantics } from './projectTypes.js';

export function classifyProjectDate(
  direct: string | null,
  effective: string | null,
): ProjectDateSemantics {
  if (direct !== null) {
    return { direct, effective, source: "direct" };
  }
  if (effective !== null) {
    return { direct: null, effective, source: "inherited" };
  }
  return { direct: null, effective: null, source: "none" };
}
