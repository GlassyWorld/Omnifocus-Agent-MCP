export function isCreateTaskMutationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.OMNIFOCUS_CREATE_TASK_ENABLED === "true";
}
