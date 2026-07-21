import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { Datapack } from "../ir/datapack";
import { AdvancementDef, Trigger } from "../values/advancement";
import { v1_21_4 } from "../../versions/1_21_4";

describe("writeDatapack", () => {
  let outDir: string | undefined;

  afterEach(() => {
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("removes a renamed advancement's old file instead of leaving it behind", async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-write-test-"));

    const first = new Datapack("t", v1_21_4);
    first.advancement("hidden/blindleap", new AdvancementDef().criterion("t", Trigger.impossible()));
    await first.writeDatapack(outDir);
    expect(fs.existsSync(path.join(outDir, "data/t/advancement/hidden/blindleap.json"))).toBe(true);

    // Rebuild under the new name only - the old file must not survive.
    const second = new Datapack("t", v1_21_4);
    second.advancement("enter/blindleap", new AdvancementDef().criterion("t", Trigger.impossible()));
    await second.writeDatapack(outDir);

    expect(fs.existsSync(path.join(outDir, "data/t/advancement/hidden/blindleap.json"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "data/t/advancement/enter/blindleap.json"))).toBe(true);
  });
});
