import { BrigadierNode } from "../core/commandtree/tree";
import { VersionProfile } from "./profile";
import { v1_21_4 } from "./profiles";

// ---------------------------------------------------------------------------
// Experimental / synthetic version profiles.
//
// These are NOT real Minecraft versions. They take a real profile and mutate
// its command grammar to simulate a breaking change that no shipped version
// has, so you can prove that the SAME authored datapack survives a future
// grammar change without touching any handler. Use them to forward-compat-test
// your own packs; don't publish a datapack built against one.
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
 * A fake "future" Minecraft whose `scoreboard players set` argument order is
 * reversed: `set <score> <objective> <targets>` instead of the real
 * `set <targets> <objective> <score>`. The arg *names* are preserved, so the
 * handlers fill each slot by name and the builder lays them out in the tree's
 * (now reversed) order. Compile the same datapack against this and 1.21.4 to
 * see the difference flow purely from the profile.
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
