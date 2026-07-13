import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";
import { SafeJxaExecutor } from "./safeJxaExecutor.js";

const documentIdentitySchema = z.object({
  name: z.string().nullable(),
  id: z.string().nullable(),
  fileUrl: z.string().nullable(),
}).strict().nullable();

const probeResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    defaultDocument: documentIdentitySchema,
    frontDocument: documentIdentitySchema,
    sameDocument: z.boolean(),
  }).strict(),
  z.object({ success: z.literal(false), errorCategory: z.string() }).strict(),
]);

export type DatabaseIdentityProbeResult = z.infer<typeof probeResultSchema>;

export function databaseIdentityProbeScriptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "omnifocusScripts", "databaseIdentityProbe.js");
}

export async function runDatabaseIdentityProbe(
  executor: Pick<SafeJxaExecutor, "execute"> = new SafeJxaExecutor(),
): Promise<DatabaseIdentityProbeResult> {
  return probeResultSchema.parse(
    await executor.execute(databaseIdentityProbeScriptPath(), {}),
  );
}
