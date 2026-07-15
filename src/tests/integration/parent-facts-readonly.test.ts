import { readFile, readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';
import {
  parentFactsProbeInputSchema,
  probeParentTaskFactsCapabilities,
  type ParentFactsProbeEvidence,
} from '../../tools/primitives/probeParentTaskFacts.js';

const acceptanceEnabled = process.env.OMNIFOCUS_PARENT_FACTS_ACCEPTANCE === '1';

describe.skipIf(!acceptanceEnabled)('Phase 4 Parent facts real read-only acceptance', () => {
  it('passes exact-ID facts, hierarchy, status, privacy, stability, and no-write gates', async () => {
    const casesPath = process.env.OMNIFOCUS_PARENT_FACTS_CASES_FILE;
    expect(casesPath).toBeTruthy();
    const casesInfo = await stat(casesPath!);
    expect(casesInfo.isFile()).toBe(true);
    expect(casesInfo.mode & 0o077).toBe(0);

    const input = parentFactsProbeInputSchema.parse(
      JSON.parse(await readFile(casesPath!, 'utf8')) as unknown,
    );
    const ledgerDirectory = join(
      homedir(), 'Library', 'Application Support', 'OmniFocus-MCP', 'create-task-v1',
    );
    const auditPath = join(
      homedir(), 'Library', 'Logs', 'OmniFocus-MCP', 'create-task-canary.jsonl',
    );
    const lockPath = join(ledgerDirectory, 'mutation.lock');

    const beforeLedger = await filesystemSignature(ledgerDirectory);
    const beforeAudit = await filesystemSignature(auditPath);
    const beforeLock = await filesystemSignature(lockPath);

    const first = await probeParentTaskFactsCapabilities(input.cases);
    expect(first.success).toBe(true);
    if (!first.success) return;
    validateRequestedCases(first.cases);

    const second = await probeParentTaskFactsCapabilities(input.cases);
    expect(second).toEqual(first);
    if (!second.success) return;

    expect(await filesystemSignature(ledgerDirectory)).toEqual(beforeLedger);
    expect(await filesystemSignature(auditPath)).toEqual(beforeAudit);
    expect(await filesystemSignature(lockPath)).toEqual(beforeLock);

    console.log('PARENT_FACTS_READONLY_ACCEPTANCE', JSON.stringify({
      result: 'pass',
      ...first.summary,
      repeatedReadStable: true,
      ledgerUnchanged: true,
      auditUnchanged: true,
      mutationLockUnchanged: true,
    }));
  }, 60_000);
});

function validateRequestedCases(evidence: readonly ParentFactsProbeEvidence[]): void {
  for (const entry of evidence) {
    if (entry.case === 'stale_not_found') {
      expect(entry).toEqual({
        case: 'stale_not_found',
        outcome: 'read_failure',
        reason: 'not_found',
      });
      continue;
    }

    expect(entry.outcome).toBe('facts');
    if (entry.outcome !== 'facts') continue;
    expect(entry.idRoundtripMatched).toBe(true);
    expect(entry.projectChainConsistent).toBe(true);
    expect(entry.activeFolderCount + entry.droppedFolderCount).toBe(entry.folderDepth);

    if (entry.case === 'inbox_action') {
      expect(entry).toMatchObject({
        kind: 'action',
        inInbox: true,
        parentIdPresent: false,
        projectPresent: false,
        parentChainTerminus: 'inbox',
      });
    } else if (entry.case === 'project_action') {
      expect(entry.kind).toBe('action');
      expect(entry.projectPresent).toBe(true);
      expect(entry.parentChainTerminus).toBe('project_root');
    } else if (entry.case === 'action_group') {
      expect(entry.kind).toBe('action_group');
      expect(entry.childCount).toBeGreaterThan(0);
    } else if (entry.case === 'project_root') {
      expect(entry.kind).toBe('project_root');
      expect(entry.projectPresent).toBe(true);
    } else if (entry.case === 'completed') {
      expect(entry.directCompleted || entry.effectiveCompleted).toBe(true);
    } else if (entry.case === 'dropped') {
      expect(entry.directDropped || entry.effectiveDropped).toBe(true);
    } else if (entry.case === 'folder_project') {
      expect(entry.projectPresent).toBe(true);
      expect(entry.folderDepth).toBeGreaterThan(0);
    }
  }
}

async function filesystemSignature(path: string): Promise<unknown> {
  try {
    const info = await stat(path);
    const base = {
      type: info.isDirectory() ? 'directory' : 'file',
      size: info.size,
      mode: info.mode & 0o777,
      mtimeMs: info.mtimeMs,
    };
    if (!info.isDirectory()) return base;

    const entries = await readdir(path, { withFileTypes: true });
    const children = await Promise.all(entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async entry => ({
        path: relative(path, join(path, entry.name)),
        state: await filesystemSignature(join(path, entry.name)),
      })));
    return { ...base, children };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { type: 'absent' };
    throw error;
  }
}
