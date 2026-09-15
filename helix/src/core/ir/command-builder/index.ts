// Renders commands against a version's command tree, so reordered or renamed syntax still comes out right.
//
// `buildCommand` takes named arguments; `buildTokens` takes an explicit token list for what names
// can't express (literals after arguments, `execute … run`).
export { buildCommand } from "./named";
export {
  arg,
  buildTokens,
  lit,
  raw,
  renderArg,
  type ArgValue,
  type Token,
} from "./tokens";
