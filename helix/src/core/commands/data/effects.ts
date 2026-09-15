// What a `data` command reads and writes, for output passes such as execute grouping.
import {
  Effect,
  entityMergeEffect,
  entityWriteEffect,
  onlySelf,
} from "../../ir/line-info";
import type { VersionProfile } from "../../../versions/profile";
import type { DataArgs } from "./args";

/** Whether a `data` command only reads and writes `@s`. */
export function dataLocal(a: DataArgs): boolean {
  switch (a.sub) {
    case "getEntity":
    case "removeEntity":
    case "mergeEntity":
      return onlySelf([a.target]);
    case "modifyEntitySetFromEntity":
      return onlySelf([a.target, a.source]);
    default:
      return false;
  }
}

/** What a `data` command does to entities. */
export function dataEffect(a: DataArgs, v: VersionProfile): Effect {
  switch (a.sub) {
    case "getBlock":
    case "getEntity":
    case "getStorage":
    case "removeStorage":
    case "mergeStorage":
    case "modifyStorageMergeFromEntity":
      return Effect.NONE;
    case "removeBlock":
    case "removeEntity":
    case "mergeBlock":
    case "modifyBlockSetFromEntity":
    case "modifyBlockSetValue":
      return Effect.EDITS;
    case "modifyEntitySetFromEntity":
    case "modifyEntitySetFromBlock":
      return entityWriteEffect(a.targetPath);
    case "mergeEntity":
      return entityMergeEffect(a.value, v);
    default:
      return Effect.MOVES;
  }
}
