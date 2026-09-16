import type { CodegenContext } from "../ir/commandhandler";
import type { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";
import { TellrawPart } from "../frontend/nodes/tellraw_part";
import { TellrawText } from "../frontend/nodes/tellraw_text";
import { Text } from "../frontend/nodes/text";
import { textJson } from "./text-json";

/**
 * A text component from a string or a `tellraw`-style part.
 *
 *   Component("hi")                          -> '{"text":"hi"}'
 *   Component(text("hi").bold())             -> '{"text":"hi","bold":true}'
 *
 * A part referencing a selector, score or command (`onClick`, `Score`, `SelectorText`,
 * `NbtRef`) only resolves when rendered with a `ctx` - pass one explicitly, or build it
 * into a `tellraw` instead, which always has one.
 */
export class ComponentValue implements CommandValue {
  constructor(private readonly value: string | TellrawPart | TellrawText) {}

  // Text components don't vary by version the way SNBT does - `version` is unused.
  render(_version: VersionProfile, ctx?: CodegenContext): string {
    const parts =
      this.value instanceof TellrawText
        ? this.value.parts
        : [typeof this.value === "string" ? new Text(this.value) : this.value];
    const json = parts.map((p) => textJson(p, ctx));
    return JSON.stringify(json.length === 1 ? json[0] : json);
  }
}

export type Component = ComponentValue;

export const Component = (
  value: string | TellrawPart | TellrawText,
): ComponentValue => new ComponentValue(value);
