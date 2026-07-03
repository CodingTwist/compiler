// Maps Brigadier argument parser ids (from commands.json) to the TypeScript
// type a generated op parameter should have.

// Scalar parsers map straight to a primitive.
export const PARSER_TYPES: Record<string, string> = {
  "brigadier:bool": "boolean",
  "brigadier:integer": "number",
  "brigadier:long": "number",
  "brigadier:float": "number",
  "brigadier:double": "number",
};

// Parsers that map to a structured value type. The generated param accepts the
// value type OR a raw string, and the value type resolves itself at codegen
// (via tok()). Keep these in sync with the types exported from ../values.
export const VALUE_TYPES: Record<string, string> = {
  "minecraft:block_pos": "Pos",
  "minecraft:vec3": "Pos",
  "minecraft:column_pos": "Pos",
  "minecraft:vec2": "Pos",
  "minecraft:block_state": "Block",
  "minecraft:block_predicate": "Block",
  "minecraft:entity": "Selector",
  "minecraft:game_profile": "Selector",
  "minecraft:score_holder": "Selector",
};

// The structured value type names, for the generator's import bookkeeping.
export const VALUE_TYPE_NAMES = ["Pos", "Block", "Selector"] as const;

export function parserToType(parser?: string): string {
  if (!parser) return "string";
  if (PARSER_TYPES[parser]) return PARSER_TYPES[parser];
  const value = VALUE_TYPES[parser];
  return value ? `${value} | string` : "string";
}
