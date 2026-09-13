import { CommandValue } from "./value";

/**
 * A text component from a string or a raw object. For rich text use `tellraw`'s
 * `TellrawText`.
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
