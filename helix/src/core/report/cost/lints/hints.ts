// Lookup tables the lint rules match rendered lines against.

/** Commands whose target takes many entities, so `execute as <sel> run <cmd @s>` ≡ `<cmd sel>`. */
export const MULTI_TARGET = [
  /^effect (give|clear) @s\b/,
  /^tag @s (add|remove) /,
  /^kill @s$/,
  /^give @s /,
  /^clear @s\b/,
  /^scoreboard players (set|add|remove|reset|enable) @s\b/,
  /^tellraw @s /,
  /^title @s /,
  /^gamemode \S+ @s$/,
  /^advancement (grant|revoke) @s /,
  /^(xp|experience) (add|set) @s /,
  /^team join \S+ @s$/,
];

/** Stat criteria with an advancement trigger that fires on the same event. */
export const STAT_TRIGGERS: [RegExp, string][] = [
  [
    /^(minecraft\.)?killed:/,
    "player_killed_entity (Trigger.playerKilledEntity)",
  ],
  [
    /^(minecraft\.)?custom:(minecraft\.)?damage_dealt$/,
    "player_hurt_entity (Trigger.playerHurtEntity)",
  ],
  [
    /^(minecraft\.)?custom:(minecraft\.)?damage_taken$/,
    'entity_hurt_player (Trigger.of("minecraft:entity_hurt_player"))',
  ],
  [
    /^(minecraft\.)?crafted:/,
    'recipe_crafted (Trigger.of("minecraft:recipe_crafted"))',
  ],
  [/^(minecraft\.)?picked_up:/, "inventory_changed (Trigger.inventoryChanged)"],
  [
    /^(minecraft\.)?custom:(minecraft\.)?enchant_item$/,
    'enchanted_item (Trigger.of("minecraft:enchanted_item"))',
  ],
  [
    /^(minecraft\.)?custom:(minecraft\.)?traded_with_villager$/,
    'villager_trade (Trigger.of("minecraft:villager_trade"))',
  ],
  [
    /^(minecraft\.)?custom:(minecraft\.)?fish_caught$/,
    'fishing_rod_hooked (Trigger.of("minecraft:fishing_rod_hooked"))',
  ],
  // `used:` has no one trigger, and the stick items have none at all.
  [
    /^(minecraft\.)?used:(?!(minecraft\.)?(carrot|warped_fungus)_on_a_stick$)/,
    "consume_item (food/potions), placed_block (blocks), using_item (bows, shields…) or item_used_on_block, depending on the item",
  ],
];

/** Entity NBT writes that have a direct command alternative. */
export const NBT_WRITE_COMMANDS: [RegExp, string][] = [
  [
    /^(Item|item|Inventory|equipment|HandItems|ArmorItems)\b/,
    "`item replace|modify entity <target> <slot>` (dp.itemModifier)",
  ],
  [/^Rotation\b/, "`rotate` (1.21.2+) or `tp`"],
  [/^Pos\b/, "`tp`"],
  [/^Tags\b/, "`tag`"],
  [/^(active_effects|ActiveEffects)\b/, "`effect`"],
  [/^(attributes|Attributes)\b/, "`attribute`"],
];

export const LOCATION_HINT =
  "players entering a fixed area: Trigger.location - matches a box (not a radius), checked about once a second, and the reward must revoke the advancement to re-arm";

/** Position-dependent selector arguments: the same text scans a different set elsewhere. */
export const POSITIONAL = new Set([
  "distance",
  "x",
  "y",
  "z",
  "dx",
  "dy",
  "dz",
]);

/** Whether a score value falls in a `matches` range (`1`, `1..`, `..5`, `1..5`). */
export function inRange(value: number, range: string): boolean {
  const [lo, hi = lo] = range.split("..");
  return (
    (lo === "" || value >= Number(lo)) && (hi === "" || value <= Number(hi))
  );
}
