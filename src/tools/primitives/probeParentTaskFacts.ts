import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { open, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { z } from 'zod';

export const parentFactsProbeCaseSchema = z.enum([
  'inbox_action',
  'project_action',
  'action_group',
  'project_root',
  'completed',
  'dropped',
  'folder_project',
  'stale_not_found',
]);

const probeInputCaseSchema = z.object({
  case: parentFactsProbeCaseSchema,
  taskId: z.string().min(1).max(512),
}).strict();

export const parentFactsProbeInputSchema = z.object({
  cases: z.array(probeInputCaseSchema).min(1).max(8),
}).strict().superRefine((value, context) => {
  const labels = value.cases.map(entry => entry.case);
  if (new Set(labels).size !== labels.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cases'],
      message: 'probe case labels must be unique',
    });
  }
});

const knownTaskStatusSchema = z.enum([
  'Available',
  'Blocked',
  'Completed',
  'Dropped',
  'DueSoon',
  'Next',
  'Overdue',
]);

const knownProjectStatusSchema = z.enum(['Active', 'OnHold', 'Done', 'Dropped']);

const factsEvidenceSchema = z.object({
  case: parentFactsProbeCaseSchema,
  outcome: z.literal('facts'),
  idRoundtripMatched: z.literal(true),
  kind: z.enum(['action', 'action_group', 'project_root']),
  taskStatus: knownTaskStatusSchema,
  inInbox: z.boolean(),
  parentIdPresent: z.boolean(),
  childCount: z.number().int().nonnegative(),
  directCompleted: z.boolean(),
  effectiveCompleted: z.boolean(),
  directDropped: z.boolean(),
  effectiveDropped: z.boolean(),
  parentDepth: z.number().int().nonnegative().max(128),
  parentChainTerminus: z.enum(['inbox', 'project_root']),
  ancestorCompleted: z.boolean(),
  ancestorDropped: z.boolean(),
  projectPresent: z.boolean(),
  projectStatus: knownProjectStatusSchema.nullable(),
  projectChainConsistent: z.literal(true),
  folderDepth: z.number().int().nonnegative().max(128),
  activeFolderCount: z.number().int().nonnegative(),
  droppedFolderCount: z.number().int().nonnegative(),
}).strict();

const readFailureReasonSchema = z.enum([
  'not_found',
  'schema_drift',
  'unknown_status',
  'malformed_id',
  'canonical_id_mismatch',
  'parent_chain_unreadable',
  'ancestor_state_unknown',
  'parent_chain_cycle',
  'orphan_parent',
  'capability_unavailable',
]);

const readFailureEvidenceSchema = z.object({
  case: parentFactsProbeCaseSchema,
  outcome: z.literal('read_failure'),
  reason: readFailureReasonSchema,
}).strict();

const caseEvidenceSchema = z.discriminatedUnion('outcome', [
  factsEvidenceSchema,
  readFailureEvidenceSchema,
]);

const summarySchema = z.object({
  requested: z.number().int().min(1).max(8),
  factsRead: z.number().int().nonnegative(),
  readFailures: z.number().int().nonnegative(),
  projectRoots: z.number().int().nonnegative(),
  actionGroups: z.number().int().nonnegative(),
  completedOrEffective: z.number().int().nonnegative(),
  droppedOrEffective: z.number().int().nonnegative(),
  projectBacked: z.number().int().nonnegative(),
  folderBacked: z.number().int().nonnegative(),
}).strict();

const nativeEnvelopeSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    cases: z.array(caseEvidenceSchema).min(1).max(8),
    summary: summarySchema,
  }).strict(),
  z.object({
    success: z.literal(false),
    reason: z.enum(['input_schema_drift', 'process_failure']),
  }).strict(),
]);

export type ParentFactsProbeCase = z.infer<typeof probeInputCaseSchema>;
export type ParentFactsProbeEvidence = z.infer<typeof caseEvidenceSchema>;
export type ParentFactsProbeSummary = z.infer<typeof summarySchema>;

export type ParentFactsProbeFailureReason =
  | 'invalid_input'
  | 'process_failure'
  | 'timeout_or_abort'
  | 'output_limit'
  | 'invalid_json_stdout'
  | 'raw_schema_drift'
  | 'privacy_boundary_failed';

export type ParentFactsProbeResult =
  | {
      success: true;
      cases: ParentFactsProbeEvidence[];
      summary: ParentFactsProbeSummary;
    }
  | {
      success: false;
      reason: ParentFactsProbeFailureReason;
      error: string;
    };

export interface ParentFactsProbeProcessResult {
  stdout: string;
  stderr: string;
}

export type ParentFactsProbeRunner = (
  executable: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<ParentFactsProbeProcessResult>;

export interface ParentFactsProbeOptions {
  executable?: string;
  scriptPath?: string;
  temporaryDirectory?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  runner?: ParentFactsProbeRunner;
}

const execFileAsync = promisify(execFile);
const defaultRunner: ParentFactsProbeRunner = async (executable, args, options) => {
  const result = await execFileAsync(executable, [...args], {
    encoding: 'utf8',
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

export async function probeParentTaskFactsCapabilities(
  rawCases: readonly ParentFactsProbeCase[],
  options: ParentFactsProbeOptions = {},
): Promise<ParentFactsProbeResult> {
  const input = parentFactsProbeInputSchema.safeParse({ cases: rawCases });
  if (!input.success) return failure('invalid_input');

  const temporaryDirectory = options.temporaryDirectory ?? tmpdir();
  const inputPath = join(
    temporaryDirectory,
    `omnifocus-parent-facts-probe-${randomUUID()}.json`,
  );

  try {
    const handle = await open(inputPath, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(input.data), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    const runner = options.runner ?? defaultRunner;
    const { stdout } = await runner(
      options.executable ?? '/usr/bin/osascript',
      ['-l', 'JavaScript', options.scriptPath ?? resolveProbeScriptPath(), inputPath],
      {
        timeout: options.timeoutMs ?? 20_000,
        maxBuffer: options.maxBufferBytes ?? 64 * 1024,
      },
    );

    const trimmed = stdout.trim();
    if (trimmed.length === 0) throw new SyntaxError('invalid_json_stdout');
    const decoded = JSON.parse(trimmed) as unknown;
    const parsed = nativeEnvelopeSchema.safeParse(decoded);
    if (!parsed.success || !parsed.data.success) return failure('raw_schema_drift');
    if (!evidenceMatchesInput(input.data.cases, parsed.data.cases, parsed.data.summary)) {
      return failure('raw_schema_drift');
    }
    if (containsPrivateIdentifier(parsed.data, input.data.cases)) {
      return failure('privacy_boundary_failed');
    }
    return parsed.data;
  } catch (error) {
    return failure(classifyFailure(error));
  } finally {
    await unlink(inputPath).catch(() => undefined);
  }
}

function evidenceMatchesInput(
  requested: readonly ParentFactsProbeCase[],
  evidence: readonly ParentFactsProbeEvidence[],
  summary: ParentFactsProbeSummary,
): boolean {
  const expectedLabels = requested.map(entry => entry.case).sort();
  const actualLabels = evidence.map(entry => entry.case).sort();
  if (JSON.stringify(expectedLabels) !== JSON.stringify(actualLabels)) return false;
  if (summary.requested !== evidence.length) return false;

  const facts = evidence.filter(entry => entry.outcome === 'facts');
  const failures = evidence.length - facts.length;
  return summary.factsRead === facts.length
    && summary.readFailures === failures
    && summary.projectRoots === facts.filter(entry => entry.kind === 'project_root').length
    && summary.actionGroups === facts.filter(entry => entry.kind === 'action_group').length
    && summary.completedOrEffective === facts.filter(
      entry => entry.directCompleted || entry.effectiveCompleted,
    ).length
    && summary.droppedOrEffective === facts.filter(
      entry => entry.directDropped || entry.effectiveDropped,
    ).length
    && summary.projectBacked === facts.filter(entry => entry.projectPresent).length
    && summary.folderBacked === facts.filter(entry => entry.folderDepth > 0).length;
}

function containsPrivateIdentifier(
  envelope: unknown,
  requested: readonly ParentFactsProbeCase[],
): boolean {
  const serialized = JSON.stringify(envelope);
  return requested.some(entry => serialized.includes(entry.taskId));
}

function resolveProbeScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'utils', 'omnifocusScripts', 'probeParentTaskFacts.js');
}

function classifyFailure(error: unknown): ParentFactsProbeFailureReason {
  const candidate = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
  if (candidate.killed || candidate.signal === 'SIGTERM') return 'timeout_or_abort';
  if (candidate.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output_limit';
  if (error instanceof SyntaxError) return 'invalid_json_stdout';
  return 'process_failure';
}

function failure(reason: ParentFactsProbeFailureReason): ParentFactsProbeResult {
  return {
    success: false,
    reason,
    error: 'The OmniFocus Parent facts probe did not produce a trustworthy privacy-safe result.',
  };
}

export const _testExports = {
  classifyFailure,
  containsPrivateIdentifier,
  evidenceMatchesInput,
  resolveProbeScriptPath,
};
