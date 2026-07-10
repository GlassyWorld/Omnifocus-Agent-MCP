import { DateSemantics } from './taskTypes.js';

export function classifyDate(direct: string | null, effective: string | null): DateSemantics {
  if (direct) {
    return { direct, effective, source: "direct" };
  }
  if (effective) {
    return { direct: null, effective, source: "inherited" };
  }
  return { direct: null, effective: null, source: "none" };
}
