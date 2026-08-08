// A node in Minecraft's generated commands.json (the Brigadier command tree).
// Only the fields we use are typed.
export interface BrigadierNode {
  type: "root" | "literal" | "argument";
  children?: Record<string, BrigadierNode>;
  parser?: string;
  executable?: boolean;
  redirect?: string[];
}
