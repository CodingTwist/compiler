/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CodegenContext, CommandHandler } from "../ir/commandhandler";

import { ASTNode } from "../ir/node";
import { SelectorNode } from "./selector";
import { TellrawText } from "../frontend/nodes/tellraw_text";
import { ClickEvent } from "../frontend/nodes/click";
import { HoverEvent } from "../frontend/nodes/hover";
import { Text } from "../frontend/nodes/text";
import { Score } from "../frontend/nodes/score";
import { NbtRef } from "../frontend/nodes/nbt_ref";
import { SelectorText } from "../frontend/nodes/selector_text";
import { TellrawPart } from "../frontend/nodes/tellraw_part";
import { Selector } from "../frontend/nodes/selector";
import { generateSingleNode } from "../ir/generate";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { textJson } from "../values/text-json";

export class TellrawNode extends ASTNode {
  type = "tellraw";
  constructor(
    public target: SelectorNode,
    public message: TellrawText,
  ) {
    super();
  }
}

/** A single tellraw piece: raw string sugar or a built part. */
export type TellrawItem = string | TellrawPart;

/**
 * Anything `tellraw` accepts: a bare string, one part (Text/Score/NbtRef), a
 * prebuilt TellrawText, or a list mixing strings and parts.
 */
export type TellrawContent = TellrawItem | TellrawText | TellrawItem[];

const toPart = (item: TellrawItem): TellrawPart =>
  typeof item === "string" ? new Text(item) : item;

function toTellrawText(content: TellrawContent): TellrawText {
  if (content instanceof TellrawText) return content;
  if (Array.isArray(content)) return new TellrawText(content.map(toPart));
  return new TellrawText([toPart(content)]);
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** `tellraw <target> <message>` - rich text (strings, parts, or a list). */
    tellraw(target: Selector, message: TellrawContent): void;
  }
}

FunctionContext.prototype.tellraw = function (
  this: FunctionContext,
  target: Selector,
  message: TellrawContent,
) {
  this.emit(new TellrawNode(target.build(), toTellrawText(message)));
};

export class TellrawCommand extends CommandHandler<TellrawNode> {
  readonly type: TellrawNode["type"] = "tellraw";

  generate(node: TellrawNode, ctx: CodegenContext): void {
    let target = generateSingleNode(node.target, ctx.datapack, ctx.dispatcher);
  
    const parts = node.message.parts.map((part) =>
      this.generatePart(part, ctx),
    );
    const payload = parts.length === 1 ? parts[0] : parts;
    ctx.emit(
      buildCommand(ctx.version, ["tellraw"], {
        targets: target,
        message: JSON.stringify(payload),
      }),
    );
  }

  private generatePart(part: TellrawPart, ctx: CodegenContext): any {
    return textJson(part, ctx);
  }
}
