export function isCreateTaskParentPlacementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.OMNIFOCUS_CREATE_TASK_PARENT_ENABLED === "true";
}
