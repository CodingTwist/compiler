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
import { TellrawPart } from "../frontend/nodes/tellraw_part";
import { Selector } from "../frontend/nodes/selector";
import { generateSingleNode } from "../ir/generate";
import { buildCommand } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";

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
    const json: any = {};

    if (part instanceof Text) {
      json.text = part.text;
    } else if (part instanceof Score) {
      // `target` is a ScoreTarget (selector or fake-player name) that must render to a
      // string; tolerate a bare string too (some direct constructions pass one).
      const target = part.target as unknown;
      json.score = {
        name:
          typeof target === "string"
            ? target
            : (target as { render(v: typeof ctx.version): string }).render(ctx.version),
        objective: part.objective.objective,
      };
    } else if (part instanceof NbtRef) {
      if (!part.path) {
        throw new Error("Cannot display an NBT holder in tellraw without a path");
      }
      json.nbt = part.path.render(ctx.version);
      json[part.target.kind] = part.target.locator.render(ctx.version);
    } else {
      throw new Error(`Unknown TellrawPart type: ${part.constructor.name}`);
    }

    // Style keys map 1:1 to text-component fields - spread them straight on.
    Object.assign(json, part.style);
    if (part.clickEvent)
      json.click_event = this.generateClick(part.clickEvent, ctx);
    if (part.hoverEvent)
      json.hover_event = this.generateHover(part.hoverEvent, ctx);

    return json;
  }

  private generateClick(event: ClickEvent, ctx: CodegenContext): any {
    let command: string;

    // console.log("Generating click event for", event.action, "with value", event.value);

    if (typeof event.value === "string") {
      command = event.value;
    } else {
      command = generateSingleNode(event.value, ctx.datapack, ctx.dispatcher);
    }

    return { action: event.action, command };
  }

  private generateHover(event: HoverEvent, ctx: CodegenContext): any {
    const parts = event.parts.map((p) => this.generatePart(p, ctx));
    return {
      action: "show_text",
      value: parts,
    };
  }
}
