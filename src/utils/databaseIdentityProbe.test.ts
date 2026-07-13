import { readFile } from "fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  databaseIdentityProbeScriptPath,
  runDatabaseIdentityProbe,
} from "./databaseIdentityProbe.js";

describe("Database Identity Feasibility Probe", () => {
  it("parses a read-only compound identity result", async () => {
    const execute = vi.fn().mockResolvedValue({
      success: true,
      defaultDocument: { name: "Test", id: "db-1", fileUrl: null },
      frontDocument: { name: "Test", id: "db-1", fileUrl: null },
      sameDocument: true,
    });
    await expect(runDatabaseIdentityProbe({ execute } as any)).resolves.toMatchObject({
      success: true,
      sameDocument: true,
    });
  });

  it("keeps the probe source read-only", async () => {
    const source = await readFile(databaseIdentityProbeScriptPath(), "utf8");
    expect(source).not.toMatch(/\.push\(|make new|delete\s|remove\(|evaluateJavascript/i);
    expect(source).toContain("defaultDocument");
    expect(source).toContain("frontDocument");
  });
});
