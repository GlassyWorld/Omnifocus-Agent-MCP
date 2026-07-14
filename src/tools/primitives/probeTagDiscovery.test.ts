import { readFile } from 'fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  _testExports,
  probeTagDiscoveryCapabilities,
  TagDiscoveryProbeRunner,
} from './probeTagDiscovery.js';

const validSummary = {
  snapshotCount: 4,
  roundtripChecked: 4,
  active: 2,
  onHold: 1,
  dropped: 1,
  roots: 2,
  nested: 2,
  mutuallyExclusiveParents: 1,
};

describe('probeTagDiscoveryCapabilities', () => {
  it('uses a bounded no-shell process and returns aggregate-only evidence', async () => {
    const runner = vi.fn<TagDiscoveryProbeRunner>(async () => ({
      stdout: JSON.stringify({ success: true, summary: validSummary }),
      stderr: 'private stderr is ignored',
    }));
    await expect(probeTagDiscoveryCapabilities({ runner, scriptPath: '/safe/probe.js' }))
      .resolves.toEqual({ success: true, summary: validSummary });
    expect(runner).toHaveBeenCalledWith(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '/safe/probe.js'],
      { timeout: 15_000, maxBuffer: 64 * 1024 },
    );
  });

  it.each([
    [{ ...validSummary, roundtripChecked: 3 }, 'id_roundtrip_mismatch'],
    [{ ...validSummary, active: 3 }, 'raw_schema_drift'],
    [{ ...validSummary, roots: 3 }, 'raw_schema_drift'],
  ])('fails inconsistent aggregate evidence with %s', async (summary, reason) => {
    const result = await probeTagDiscoveryCapabilities({
      runner: async () => ({
        stdout: JSON.stringify({ success: true, summary }),
        stderr: '',
      }),
    });
    expect(result).toMatchObject({ success: false, reason });
  });

  it.each([
    ['', 'invalid_json_stdout'],
    ['not-json', 'invalid_json_stdout'],
    ['{"success":false,"reason":"id_roundtrip_mismatch"}', 'id_roundtrip_mismatch'],
    ['{"success":true,"summary":{},"private":"value"}', 'raw_schema_drift'],
  ])('fails closed for untrusted output %#', async (stdout, reason) => {
    const result = await probeTagDiscoveryCapabilities({
      runner: async () => ({ stdout, stderr: '' }),
    });
    expect(result).toMatchObject({ success: false, reason });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('keeps roundtrip out of normal runtime and mutation APIs out of the probe', async () => {
    const source = await readFile(_testExports.resolveProbeScriptPath(), 'utf8');
    expect(source.match(/flattenedTags/g)).toHaveLength(1);
    expect(source.match(/Tag\.byIdentifier/g)).toHaveLength(1);
    expect(source).not.toMatch(/new\s+Tag|deleteObject|cleanUp\(|\.push\(|URL\.fromString/);
    expect(source).not.toMatch(/remainingTasks|\.tasks|Task\.Status|project/);
  });
});
