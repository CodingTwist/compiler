// Builds `pack.mcmeta`.
import { Datapack } from "../ir/datapack";
import { PackFormatSpec } from "../../versions/profile";

// Newer versions require a min/max pack format range instead of a single number.
// `spec` picks the datapack or resource pack format.
export function buildPackMcmeta(
  dp: Datapack,
  spec: PackFormatSpec = dp.version.pack,
): { pack: Record<string, unknown> } {
  if (spec.kind === "scalar") {
    return { pack: { pack_format: spec.value, description: dp.name } };
  }
  return {
    pack: { description: dp.name, min_format: spec.min, max_format: spec.max },
  };
}
