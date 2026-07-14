import { readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { join, relative } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { adaptRawTagSnapshot } from '../../domain/tag/tagAdapter.js';
import { searchTags } from '../../domain/tag/searchTags.js';
import { _testExports as searchTagsTestExports } from '../../tools/definitions/searchTags.js';
import { probeTagDiscoveryCapabilities } from '../../tools/primitives/probeTagDiscovery.js';
import { readTags } from '../../tools/primitives/readTags.js';

const acceptanceEnabled = process.env.OMNIFOCUS_TAG_DISCOVERY_ACCEPTANCE === '1';

describe.skipIf(!acceptanceEnabled)('Phase T1 Tag discovery real read-only acceptance', () => {
  it('passes capability, roundtrip, real search, stability, and no-write gates', async () => {
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
    const beforeSnapshot = requireRawSnapshot(await readTags());

    const capabilityProbe = await probeTagDiscoveryCapabilities();
    expect(capabilityProbe.success).toBe(true);
    if (!capabilityProbe.success) return;

    const independentAcceptanceProbe = await probeTagDiscoveryCapabilities();
    expect(independentAcceptanceProbe).toEqual(capabilityProbe);
    if (!independentAcceptanceProbe.success) return;

    const reader = vi.fn(() => readTags());
    const toolResult: any = await searchTagsTestExports.handleWithReader(
      { limit: 1 },
      {} as any,
      reader,
    );
    expect(reader).toHaveBeenCalledTimes(1);
    expect(toolResult.isError).not.toBe(true);
    expect(toolResult.structuredContent).toEqual(JSON.parse(toolResult.content[0].text));

    const repeatedRaw = requireRawSnapshot(await readTags());
    const beforeAdapted = requireAdapted(beforeSnapshot);
    const repeatedAdapted = requireAdapted(repeatedRaw);
    expect(canonicalProjection(repeatedAdapted)).toEqual(canonicalProjection(beforeAdapted));

    const activeTags = beforeAdapted.filter(tag => tag.status === 'active');
    const onHoldTags = beforeAdapted.filter(tag => tag.status === 'on_hold');
    expect(activeTags.length).toBeGreaterThan(0);
    expect(onHoldTags.length).toBeGreaterThan(0);
    expect(beforeAdapted.some(tag => tag.hierarchy.path.length > 1)).toBe(true);

    const defaultResult = searchTags(beforeAdapted, { limit: 1 });
    expect(defaultResult.page.matched).toBe(activeTags.length);
    expect(defaultResult.page.returned).toBe(1);
    expect(defaultResult.page.truncated).toBe(activeTags.length > 1);

    const querySource = activeTags.find(tag => tag.name.trim().length > 0);
    expect(querySource).toBeDefined();
    const query = querySource!.name.trim().slice(0, 1);
    const queryResult = searchTags(beforeAdapted, { query, limit: 100 });
    expect(queryResult.page.matched).toBeGreaterThan(0);

    const afterSnapshot = requireRawSnapshot(await readTags());
    expect(canonicalProjection(requireAdapted(afterSnapshot)))
      .toEqual(canonicalProjection(beforeAdapted));
    expect(await filesystemSignature(ledgerDirectory)).toEqual(beforeLedger);
    expect(await filesystemSignature(auditPath)).toEqual(beforeAudit);
    expect(await filesystemSignature(lockPath)).toEqual(beforeLock);

    const summary = capabilityProbe.summary;
    expect(summary.snapshotCount).toBe(beforeAdapted.length);
    expect(summary.roundtripChecked).toBe(beforeAdapted.length);
    expect(summary.active).toBe(activeTags.length);
    expect(summary.onHold).toBe(onHoldTags.length);

    console.log('TAG_DISCOVERY_ACCEPTANCE', JSON.stringify({
      result: 'pass',
      snapshotCount: summary.snapshotCount,
      roundtripChecked: summary.roundtripChecked,
      active: summary.active,
      onHold: summary.onHold,
      dropped: summary.dropped,
      roots: summary.roots,
      nested: summary.nested,
      maxDepth: Math.max(...beforeAdapted.map(tag => tag.hierarchy.path.length), 0),
      mutuallyExclusiveParents: summary.mutuallyExclusiveParents,
      normalToolSnapshotReads: reader.mock.calls.length,
      queryMatched: queryResult.page.matched,
      limitMatched: defaultResult.page.matched,
      limitReturned: defaultResult.page.returned,
      truncated: defaultResult.page.truncated,
      repeatedReadStable: true,
      tagSnapshotUnchanged: true,
      ledgerUnchanged: true,
      auditUnchanged: true,
      mutationLockUnchanged: true,
    }));
  }, 60_000);
});

function requireRawSnapshot(result: Awaited<ReturnType<typeof readTags>>): unknown[] {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.reason);
  return result.tags;
}

function requireAdapted(raw: unknown) {
  const adapted = adaptRawTagSnapshot(raw);
  expect(adapted.success).toBe(true);
  if (!adapted.success) throw new Error(adapted.reason);
  return adapted.tags;
}

function canonicalProjection(tags: ReturnType<typeof requireAdapted>) {
  return tags.slice().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
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
