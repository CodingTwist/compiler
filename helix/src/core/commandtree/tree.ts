// A node in Minecraft's commands.json (Brigadier tree). Only fields we use are typed.
export interface BrigadierNode {
  type: "root" | "literal" | "argument";
  children?: Record<string, BrigadierNode>;
  parser?: string;
  executable?: boolean;
  redirect?: string[];
}
