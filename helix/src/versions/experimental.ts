import { BrigadierNode } from "../core/commandtree/tree";
import { VersionProfile } from "./profile";
import { v1_21_4 } from "./profiles";

// ---------------------------------------------------------------------------
// Fake version profiles: real ones with mutated command grammar, to test that packs survive
// future grammar changes. Don't publish packs built against these.
// ---------------------------------------------------------------------------

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Spread a real profile, give it a new id, and hand it a mutated command tree. */
export function deriveVersion(
  base: VersionProfile,
  id: string,
  mutate: (tree: BrigadierNode) => void,
): VersionProfile {
  const commands = clone(base.commands as BrigadierNode);
  mutate(commands);
  return { ...base, id, commands };
}

/**
 * A fake version with `scoreboard players set` arguments reversed. Argument names are kept,
 * so
 * handlers still work and only the output order changes.
 */
export const fakeFutureReorderedScoreboard: VersionProfile = deriveVersion(
  v1_21_4,
  "99.0-future",
  (tree) => {
    const set =
      tree.children!.scoreboard.children!.players.children!.set;
    set.children = {
      score: {
        type: "argument",
        parser: "brigadier:integer",
        children: {
          objective: {
            type: "argument",
            parser: "minecraft:objective",
            children: {
              targets: {
                type: "argument",
                parser: "minecraft:score_holder",
                executable: true,
              },
            },
          },
        },
      },
    };
  },
);
