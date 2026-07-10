import { adaptQueryProjectItem } from '../../domain/project/projectAdapter.js';
import { RawProject } from '../../domain/project/projectTypes.js';
import { queryOmnifocus } from './queryOmnifocus.js';

export const GET_PROJECT_RAW_FIELDS = [
  "id",
  "name",
  "note",
  "status",
  "sequential",
  "flagged",
  "containsSingletonActions",
  "completedByChildren",
  "folderId",
  "folderName",
  "directTaskIds",
  "taskIds",
  "taskStatusCounts",
  "dueDate",
  "effectiveDueDate",
  "deferDate",
  "effectiveDeferDate",
  "creationDate",
  "modificationDate",
] as const;

export type GetProjectParams =
  | { id: string; name?: never }
  | { id?: never; name: string };

export type GetProjectResult =
  | { success: true; projects: RawProject[]; count: number }
  | { success: false; error: string };

export async function getProject(params: GetProjectParams): Promise<GetProjectResult> {
  const result = await queryOmnifocus({
    entity: "projects",
    filters: "id" in params
      ? { projectId: params.id }
      : { projectNameExact: params.name },
    fields: [...GET_PROJECT_RAW_FIELDS],
    includeCompleted: true,
    limit: 2,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Unknown query error',
    };
  }

  const projects: RawProject[] = [];
  for (const item of result.items || []) {
    const adapted = adaptQueryProjectItem(item);
    if (!adapted.success) {
      return {
        success: false,
        error: adapted.error,
      };
    }
    projects.push(adapted.project);
  }

  const canonicalMatches = "id" in params
    ? projects.filter(project => project.id === params.id)
    : projects;

  return {
    success: true,
    projects: canonicalMatches,
    count: canonicalMatches.length,
  };
}
