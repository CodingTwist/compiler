import { CommandValue } from "./value";

/**
 * A text component (`component` / `style`). Accepts a plain string (rendered as
 * `{"text":"..."}`) or a raw JSON-serialisable object. For rich, chained text
 * (colors, click/hover, scores) use the `tellraw` builder's `TellrawText`.
 *
 *   Component("hi")                 -> '{"text":"hi"}'
 *   Component({ text: "hi", bold: true })
 */
export class ComponentValue implements CommandValue {
  constructor(private readonly value: string | object) {}

  render(): string {
    const json =
      typeof this.value === "string" ? { text: this.value } : this.value;
    return JSON.stringify(json);
  }
}

export type Component = ComponentValue;

export const Component = (value: string | object): ComponentValue =>
  new ComponentValue(value);
