import type { KitPlugin } from "../plugin";
import { holding } from "./holding";
import { clip } from "./clip";
import { entitySet } from "./entity_set";
import { native } from "./native";
import { playerMotion } from "./player_motion";
import { raycast } from "./raycast";
import { grapple } from "./grapple";

/**
 * Every built-in plugin - convenience for `installKit(allPlugins)` when you want
 * the whole kit and don't care about opting in piecemeal. Importing this pulls in
 * all plugins' type augmentations.
 */
export const allPlugins: KitPlugin[] = [holding, clip, entitySet, native, playerMotion, raycast, grapple];
