import { ProjectKind, RawProject } from './projectTypes.js';

export function classifyProjectKind(raw: RawProject): ProjectKind {
  return raw.containsSingletonActions ? "single_actions" : "standard";
}
