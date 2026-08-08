import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { Datapack } from "../ir/datapack";
import { AdvancementDef, Trigger } from "../values/advancement";
import { v1_21_4 } from "../../versions/profiles";

describe("writeDatapack", () => {
  let outDir: string | undefined;

  afterEach(() => {
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("removes a renamed advancement's old file instead of leaving it behind", async () => {
    const dir = (outDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-write-test-")));

    const first = new Datapack("t", v1_21_4);
    first.advancement("hidden/blindleap", new AdvancementDef().criterion("t", Trigger.impossible()));
    await first.writeDatapack(dir);
    expect(fs.existsSync(path.join(dir, "data/t/advancement/hidden/blindleap.json"))).toBe(true);

    // Rebuild under the new name only - the old file must not survive.
    const second = new Datapack("t", v1_21_4);
    second.advancement("enter/blindleap", new AdvancementDef().criterion("t", Trigger.impossible()));
    await second.writeDatapack(dir);

    expect(fs.existsSync(path.join(dir, "data/t/advancement/hidden/blindleap.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "data/t/advancement/enter/blindleap.json"))).toBe(true);
  });

  it("{ zip: true } writes a .zip with the same entries as the loose-file output", async () => {
    const dir = (outDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-write-zip-test-")));
    const looseDir = path.join(dir, "loose");
    const zipPath = path.join(dir, "pack.zip");

    const dp = new Datapack("t", v1_21_4);
    dp.advancement("hidden/blindleap", new AdvancementDef().criterion("t", Trigger.impossible()));
    await dp.writeDatapack(looseDir);
    await dp.writeDatapack(zipPath, { zip: true });

    expect(fs.existsSync(zipPath)).toBe(true);

    const listed = execFileSync("unzip", ["-l", zipPath], { encoding: "utf-8" });
    expect(listed).toContain("data/t/advancement/hidden/blindleap.json");
    expect(listed).toContain("pack.mcmeta");

    const extracted = execFileSync("unzip", ["-p", zipPath, "pack.mcmeta"], { encoding: "utf-8" });
    const looseMcmeta = fs.readFileSync(path.join(looseDir, "pack.mcmeta"), "utf-8");
    expect(extracted).toBe(looseMcmeta);
  });
});
