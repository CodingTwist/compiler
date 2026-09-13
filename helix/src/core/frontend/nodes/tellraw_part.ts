import { Color } from "../../values/enums";
import { ClickEvent } from "./click";
import { HoverEvent } from "./hover";

/**
 * Text component style fields. Keys match vanilla's, so codegen spreads them into the JSON.
 */
export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
  color?: string;
}

export abstract class TellrawPart {
  /** Accumulated styling; each fluent method writes one field here. */
  public readonly style: TextStyle = {};
  public clickEvent?: ClickEvent;
  public hoverEvent?: HoverEvent;

  /** Colours this span. Prefer `Color.GOLD`; `#RRGGBB` also works. */
  color(color: Color | `#${string}`): this {
    this.style.color = color;
    return this;
  }

  bold(value = true): this {
    this.style.bold = value;
    return this;
  }

  italic(value = true): this {
    this.style.italic = value;
    return this;
  }

  underlined(value = true): this {
    this.style.underlined = value;
    return this;
  }

  strikethrough(value = true): this {
    this.style.strikethrough = value;
    return this;
  }

  obfuscated(value = true): this {
    this.style.obfuscated = value;
    return this;
  }

  /** Attach a click action (see the `click` helper). */
  onClick(event: ClickEvent): this {
    this.clickEvent = event;
    return this;
  }

  /** Attach a hover tooltip (see the `hover` helper). */
  onHover(event: HoverEvent): this {
    this.hoverEvent = event;
    return this;
  }
}
