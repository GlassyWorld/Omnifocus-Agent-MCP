import { access, mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _testExports,
  probeParentTaskFactsCapabilities,
  type ParentFactsProbeRunner,
} from './probeParentTaskFacts.js';

let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'parent-facts-probe-test-'));
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

const actionEvidence = {
  case: 'inbox_action' as const,
  outcome: 'facts' as const,
  idRoundtripMatched: true as const,
  kind: 'action' as const,
  taskStatus: 'Available' as const,
  inInbox: true,
  parentIdPresent: false,
  childCount: 0,
  directCompleted: false,
  effectiveCompleted: false,
  directDropped: false,
  effectiveDropped: false,
  parentDepth: 0,
  parentChainTerminus: 'inbox' as const,
  ancestorCompleted: false,
  ancestorDropped: false,
  projectPresent: false,
  projectStatus: null,
  projectChainConsistent: true as const,
  folderDepth: 0,
  activeFolderCount: 0,
  droppedFolderCount: 0,
};

const staleEvidence = {
  case: 'stale_not_found' as const,
  outcome: 'read_failure' as const,
  reason: 'not_found' as const,
};

const validEnvelope = {
  success: true as const,
  cases: [actionEvidence, staleEvidence],
  summary: {
    requested: 2,
    factsRead: 1,
    readFailures: 1,
    projectRoots: 0,
    actionGroups: 0,
    completedOrEffective: 0,
    droppedOrEffective: 0,
    projectBacked: 0,
    folderBacked: 0,
  },
};

describe('probeParentTaskFactsCapabilities', () => {
  it('uses a 0600 exact-ID input file, keeps IDs out of argv/output, and removes the file', async () => {
    let payloadPath = '';
    const runner = vi.fn<ParentFactsProbeRunner>(async (executable, args) => {
      expect(executable).toBe('/usr/bin/osascript');
      expect(args.slice(0, 3)).toEqual(['-l', 'JavaScript', '/safe/parent-probe.js']);
      payloadPath = args[3];
      expect(args).not.toContain('private-task-id');
      expect((await stat(payloadPath)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(payloadPath, 'utf8'))).toEqual({
        cases: [
          { case: 'inbox_action', taskId: 'private-task-id' },
          { case: 'stale_not_found', taskId: 'stale-private-id' },
        ],
      });
      return { stdout: JSON.stringify(validEnvelope), stderr: 'private stderr is ignored' };
    });

    await expect(probeParentTaskFactsCapabilities([
      { case: 'inbox_action', taskId: 'private-task-id' },
      { case: 'stale_not_found', taskId: 'stale-private-id' },
    ], {
      runner,
      scriptPath: '/safe/parent-probe.js',
      temporaryDirectory,
    })).resolves.toEqual(validEnvelope);

    expect(runner).toHaveBeenCalledWith(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '/safe/parent-probe.js', expect.any(String)],
      { timeout: 20_000, maxBuffer: 64 * 1024 },
    );
    await expect(access(payloadPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects duplicate case labels before process execution', async () => {
    const runner = vi.fn<ParentFactsProbeRunner>();
    const result = await probeParentTaskFactsCapabilities([
      { case: 'action_group', taskId: 'task-1' },
      { case: 'action_group', taskId: 'task-2' },
    ], { runner, temporaryDirectory });
    expect(result).toMatchObject({ success: false, reason: 'invalid_input' });
    expect(runner).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validEnvelope, summary: { ...validEnvelope.summary, factsRead: 2 } }, 'raw_schema_drift'],
    [{ ...validEnvelope, cases: [actionEvidence] }, 'raw_schema_drift'],
    [{ ...validEnvelope, privateTaskId: 'private-task-id' }, 'raw_schema_drift'],
  ])('fails closed for inconsistent or expanded native evidence %#', async (envelope, reason) => {
    const result = await probeParentTaskFactsCapabilities([
      { case: 'inbox_action', taskId: 'private-task-id' },
      { case: 'stale_not_found', taskId: 'stale-private-id' },
    ], {
      temporaryDirectory,
      runner: async () => ({ stdout: JSON.stringify(envelope), stderr: '' }),
    });
    expect(result).toMatchObject({ success: false, reason });
    expect(JSON.stringify(result)).not.toContain('private-task-id');
  });

  it.each([
    ['', 'invalid_json_stdout'],
    ['not-json', 'invalid_json_stdout'],
  ])('classifies malformed stdout without exposing it', async (stdout, reason) => {
    const result = await probeParentTaskFactsCapabilities([
      { case: 'inbox_action', taskId: 'private-task-id' },
    ], {
      temporaryDirectory,
      runner: async () => ({ stdout, stderr: '' }),
    });
    expect(result).toMatchObject({ success: false, reason });
    expect(JSON.stringify(result)).not.toContain('private-task-id');
  });

  it('keeps the fixed script read-only, exact-ID-only, bounded, and unreachable', async () => {
    const scriptPath = _testExports.resolveProbeScriptPath();
    const source = await readFile(scriptPath, 'utf8');
    const registration = await readFile(
      join(scriptPath, '..', '..', '..', 'serverRegistration.ts'),
      'utf8',
    );

    expect(source.match(/Task\.byIdentifier/g)).toHaveLength(1);
    expect(source).toContain('readParentTaskFactsById');
    expect(source).toContain('task.effectiveCompletedDate');
    expect(source).toContain('task.effectiveDropDate');
    expect(source).toContain('Number.isInteger(children.length)');
    expect(source).toContain('typeof children.map !== "function"');
    expect(source).toContain('project.parentFolder');
    expect(source).not.toMatch(/flattenedTasks|remainingTasks|taskName|projectName|folderName/);
    expect(source).not.toMatch(/new\s+(Task|Project|Tag)|addTags|deleteObject|markComplete/);
    expect(source).not.toMatch(/\.push\(|cleanUp\(|URL\.fromString/);
    expect(registration).not.toContain('probeParentTaskFacts');
  });
});
