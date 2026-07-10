import { ProjectKind, RawProject } from './projectTypes.js';

export type ProjectKindFacts = Pick<RawProject, 'containsSingletonActions'>;

export function classifyProjectKind(raw: ProjectKindFacts): ProjectKind {
  return raw.containsSingletonActions ? "single_actions" : "standard";
}
