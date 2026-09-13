import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { loadPack, worldDir } from "./load";
import { buildDatapack } from "../core/codegen/codegen";
import { v1_21_4 } from "../versions/profiles";

// The fixture can't import helix source under vitest, so its version comes from a global.
(globalThis as Record<string, unknown>).__fixtureVersion = v1_21_4;
const roots: string[] = [];
afterAll(() => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

function fixture(versionIn: "config" | "entry" | "both" = "config"): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "helix-cli-"));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "helix.config.ts"),
    `export default {
  name: "Fixture", ${versionIn === "entry" ? "" : "version: (globalThis as any).__fixtureVersion,"} entry: "src/pack.ts",
  targets: ["vanilla", "paper"],
  out: { datapack: "saves/w/datapacks/fixture" },
  debug: { comments: true },
};`,
  );
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "src/pack.ts"),
    `export default Object.assign((dp: any, build: any) => dp.createFunction("hi").build((c: any) => c.say(build.mode + " " + build.target)),
  ${versionIn === "config" ? "{}" : "{ version: (globalThis as any).__fixtureVersion }"});`,
  );
  return root;
}

describe("loadPack", () => {
  it("creates one Datapack per target from the config and runs the entry into it", async () => {
    const root = fixture();
    const loaded = await loadPack({ root, mode: "dev" });
    const [vanilla, paper] = loaded.packs;
    expect(vanilla.dp.name).toBe("fixture");
    expect(vanilla.out.datapack).toBe(path.join(root, "saves/w/datapacks/fixture"));
    expect(paper.out.datapack).toBe(path.join(root, "saves/w/datapacks/fixture-paper"));
    expect(vanilla.dp.debug.comments).toBe(true);
    expect(buildDatapack(paper.dp).get("data/fixture/function/hi.mcfunction")).toContain("say dev paper");
    expect(worldDir(loaded)).toBe(path.join(root, "saves/w"));
  });

  it("prod turns debug off; --target narrows to one", async () => {
    const { packs } = await loadPack({ root: fixture(), mode: "prod", target: "vanilla" });
    expect(packs.map((p) => p.target)).toEqual(["vanilla"]);
    expect(packs[0].dp.debug).toEqual({});
  });

  it("takes the version from the entry, and refuses it in both places", async () => {
    const { packs } = await loadPack({ root: fixture("entry"), mode: "prod" });
    expect(packs[0].dp.version).toBe(v1_21_4);
    await expect(loadPack({ root: fixture("both"), mode: "prod" })).rejects.toThrow(/both/);
  });
});
