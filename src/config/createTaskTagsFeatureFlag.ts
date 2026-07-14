export function isCreateTaskTagAssignmentEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.OMNIFOCUS_CREATE_TASK_TAGS_ENABLED === "true";
}
