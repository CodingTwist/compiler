import { ASTNode } from "../ir/node";
import { CommandValue } from "../values/value";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { VersionProfile } from "../../versions/profile";
import { Token, lit, arg, buildTokens } from "../ir/command-builder";

/** What kind of thing holds the NBT a `data` command reads or writes. */
export type NbtKind = "storage" | "entity" | "block";

/** A holder plus the rendered locator (storage id / entity selector / block pos). */
export interface NbtTargetSpec {
  kind: NbtKind;
  locator: CommandValue;
}

/** Where a copy/modify operation pulls its data from. */
export type DataSourceSpec =
  | { via: "value"; value: CommandValue }
  | { via: "from"; target: NbtTargetSpec; path?: CommandValue }
  | { via: "string"; target: NbtTargetSpec; path?: CommandValue; start?: number; end?: number };

/** The list-modifying actions of `data modify`. */
export type ModifyAction = "set" | "merge" | "append" | "prepend" | "insert";

/** A single `data` operation, modelled as a domain action rather than a grammar path. */
export type DataOp =
  | { op: "get"; target: NbtTargetSpec; path?: CommandValue; scale?: number }
  | { op: "remove"; target: NbtTargetSpec; path: CommandValue }
  | { op: "mergeAll"; target: NbtTargetSpec; value: CommandValue }
  | {
      op: "modify";
      action: ModifyAction;
      index?: number; // only for "insert"
      target: NbtTargetSpec;
      path: CommandValue;
      source: DataSourceSpec;
    };

/**
 * The AST node behind the code-first `data` facade (`ctx.storage(...)`,
 * `ctx.entity(...)`, `ctx.block(...)`). Carries a typed domain operation; the
 * handler renders it to a `data ...` command against the target version's tree.
 */
export class DataOpNode extends ASTNode {
  readonly type = "data_op";
  constructor(public op: DataOp) {
    super();
  }
}

/** `<kind> <locator>`, e.g. `storage example:state` or `entity @s`. */
function targetTokens(t: NbtTargetSpec, v: VersionProfile): Token[] {
  return [lit(t.kind), arg(t.locator.render(v))];
}

/** The `value … | from … | string …` tail of a `data modify`. */
function sourceTokens(s: DataSourceSpec, v: VersionProfile): Token[] {
  switch (s.via) {
    case "value":
      return [lit("value"), arg(s.value.render(v))];
    case "from":
      return [
        lit("from"),
        ...targetTokens(s.target, v),
        ...(s.path ? [arg(s.path.render(v))] : []),
      ];
    case "string":
      return [
        lit("string"),
        ...targetTokens(s.target, v),
        ...(s.path ? [arg(s.path.render(v))] : []),
        ...(s.start !== undefined ? [arg(s.start)] : []),
        ...(s.end !== undefined ? [arg(s.end)] : []),
      ];
  }
}

export class DataOpCommand extends CommandHandler<DataOpNode> {
  readonly type: DataOpNode["type"] = "data_op";

  generate(node: DataOpNode, ctx: CodegenContext): void {
    const v = ctx.version;
    const op = node.op;
    let tokens: Token[];

    switch (op.op) {
      case "get":
        tokens = [
          lit("data"),
          lit("get"),
          ...targetTokens(op.target, v),
          ...(op.path ? [arg(op.path.render(v))] : []),
          ...(op.scale !== undefined ? [arg(op.scale)] : []),
        ];
        break;
      case "remove":
        tokens = [lit("data"), lit("remove"), ...targetTokens(op.target, v), arg(op.path.render(v))];
        break;
      case "mergeAll":
        tokens = [lit("data"), lit("merge"), ...targetTokens(op.target, v), arg(op.value.render(v))];
        break;
      case "modify":
        tokens = [
          lit("data"),
          lit("modify"),
          ...targetTokens(op.target, v),
          arg(op.path.render(v)),
          lit(op.action),
          ...(op.action === "insert" ? [arg(op.index ?? 0)] : []),
          ...sourceTokens(op.source, v),
        ];
        break;
    }

    ctx.emit(buildTokens(v, tokens));
  }
}
