import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { page } from "./page";
import type { MobModuleRef } from "../types";
import type { MobPreview } from "./rig";

export interface MobPreviewOpts {
  /**
   * A vanilla client jar to take real textures from. Without one, members render as flat colour.
   */
  clientJar?: string;
}

/**
 * Writes an HTML page that renders a mob's rig and plays its gestures, using the game's
 * transform maths. Open it in a browser.
 */
export function writeMobPreview(file: string, mob: MobModuleRef, opts: MobPreviewOpts = {}): void {
  const data = mob.preview();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page(mob.metadata.name, data, textures(data, opts.clientJar)));
}

function textures(data: MobPreview, jar?: string): Record<string, string> {
  if (!jar) return {};
  const out: Record<string, string> = {};
  for (const { kind, id } of data.members) {
    const [ns, path] = id.includes(":") ? id.split(":") : ["minecraft", id];
    try {
      // ponytail: only textures named after the id; resource-pack models and per-face blocks render
      // as flat colour.
      const png = execFileSync("unzip", ["-p", jar, `assets/${ns}/textures/${kind}/${path}.png`], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (png.length) out[id] = `data:image/png;base64,${png.toString("base64")}`;
    } catch {
      // Missing entry - flat colour.
    }
  }
  return out;
}
