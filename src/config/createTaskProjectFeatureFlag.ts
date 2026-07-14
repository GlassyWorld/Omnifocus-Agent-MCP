export function isCreateTaskProjectPlacementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.OMNIFOCUS_CREATE_TASK_PROJECT_ENABLED === "true";
}
