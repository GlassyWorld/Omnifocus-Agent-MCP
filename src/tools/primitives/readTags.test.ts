import { readFile } from 'fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { _testExports, readTags, ReadTagsProcessRunner } from './readTags.js';

describe('readTags', () => {
  it('executes one static script with argv, timeout, and bounded output', async () => {
    const runner = vi.fn<ReadTagsProcessRunner>(async () => ({
      stdout: JSON.stringify({ success: true, tags: [] }),
      stderr: 'private stderr is ignored',
    }));
    await expect(readTags({ runner, scriptPath: '/safe/readTags.js' })).resolves.toEqual({
      success: true,
      tags: [],
    });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '/safe/readTags.js'],
      { timeout: 15_000, maxBuffer: 256 * 1024 },
    );
  });

  it.each([
    ['', 'invalid_json_stdout'],
    ['not-json', 'invalid_json_stdout'],
    ['{"success":true,"tags":[]}\nnoise', 'invalid_json_stdout'],
    ['{"success":true,"tags":[],"extra":true}', 'raw_schema_drift'],
    ['{"success":false,"reason":"raw_schema_drift"}', 'raw_schema_drift'],
  ])('fails closed for untrusted output %#', async (stdout, reason) => {
    const result = await readTags({ runner: async () => ({ stdout, stderr: '' }) });
    expect(result).toMatchObject({ success: false, reason });
  });

  it.each([
    [{ killed: true }, 'timeout_or_abort'],
    [{ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }, 'output_limit'],
    [new Error('private tag data'), 'process_failure'],
  ])('maps process failures without exposing raw errors %#', async (thrown, reason) => {
    const result = await readTags({
      runner: async () => { throw thrown; },
    });
    expect(result).toMatchObject({ success: false, reason });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('uses one complete snapshot and contains no roundtrip or mutation path', async () => {
    const source = await readFile(_testExports.resolveReadTagsScriptPath(), 'utf8');
    expect(source.match(/flattenedTags/g)).toHaveLength(1);
    expect(source).not.toMatch(/Tag\.byIdentifier/);
    expect(source).not.toMatch(/new\s+Tag|deleteObject|cleanUp\(|\.push\(|URL\.fromString/);
    expect(source).not.toMatch(/remainingTasks|\.tasks|Task\.Status|project/);
  });
});
