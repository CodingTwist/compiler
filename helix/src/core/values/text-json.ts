/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CodegenContext } from "../ir/commandhandler";
import { ClickEvent } from "../frontend/nodes/click";
import { HoverEvent } from "../frontend/nodes/hover";
import { NbtRef } from "../frontend/nodes/nbt_ref";
import { Score } from "../frontend/nodes/score";
import { SelectorText } from "../frontend/nodes/selector_text";
import { TellrawPart } from "../frontend/nodes/tellraw_part";
import { Text } from "../frontend/nodes/text";
import { generateSingleNode } from "../ir/generate";

/**
 * A text span as vanilla JSON, for tellraw, signs, books, item names and lore.
 *
 * `ctx` is needed for parts that reference a selector, NBT holder or command; without it
 * they throw.
 */
export function textJson(part: TellrawPart, ctx?: CodegenContext): any {
  const json: any = {};

  if (part instanceof Text) {
    json.text = part.text;
  } else if (part instanceof Score) {
    const target = part.target as unknown;
    json.score = {
      name:
        typeof target === "string"
          ? target
          : (target as { render(v: any): string }).render(needs(ctx, "a score's target").version),
      objective: part.objective.objective,
    };
  } else if (part instanceof SelectorText) {
    const c = needs(ctx, "a selector");
    json.selector = generateSingleNode(part.selector.build(), c.datapack, c.dispatcher);
  } else if (part instanceof NbtRef) {
    if (!part.path) {
      throw new Error("Cannot display an NBT holder in a text component without a path");
    }
    const c = needs(ctx, "an NBT reference");
    json.nbt = part.path.render(c.version);
    json[part.target.kind] = part.target.locator.render(c.version);
  } else {
    throw new Error(`Unknown TellrawPart type: ${part.constructor.name}`);
  }

  // Style keys map 1:1 to text-component fields - spread them straight on.
  Object.assign(json, part.style);
  if (part.clickEvent) json.click_event = clickJson(part.clickEvent, ctx);
  if (part.hoverEvent) json.hover_event = hoverJson(part.hoverEvent, ctx);

  return json;
}

/**
 * Which field holds each click action's payload. Since 1.21.5 each action has its own key;
 * the wrong key gives a link that does nothing.
 */
const CLICK_FIELD: Record<ClickEvent["action"], string> = {
  run_command: "command",
  suggest_command: "command",
  open_url: "url",
  copy_to_clipboard: "value",
};

function clickJson(event: ClickEvent, ctx?: CodegenContext): any {
  const payload =
    typeof event.value === "string"
      ? event.value
      : (() => {
          const c = needs(ctx, "a command-node click action");
          return generateSingleNode(event.value as any, c.datapack, c.dispatcher);
        })();
  return { action: event.action, [CLICK_FIELD[event.action]]: payload };
}

function hoverJson(event: HoverEvent, ctx?: CodegenContext): any {
  return { action: "show_text", value: event.parts.map((p) => textJson(p, ctx)) };
}

function needs(ctx: CodegenContext | undefined, what: string): CodegenContext {
  if (!ctx) {
    throw new Error(
      `This text component contains ${what}, which can only be rendered during codegen - ` +
        `build it into a tellraw, or use a plain text(...) span here.`,
    );
  }
  return ctx;
}
