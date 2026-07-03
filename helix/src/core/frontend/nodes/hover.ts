import { TellrawPart } from "./tellraw_part";

export class HoverEvent {
  public readonly parts: TellrawPart[];
  constructor(value: TellrawPart | TellrawPart[]) {
    this.parts = Array.isArray(value) ? value : [value];
  }
}

export const hover = {
  text: (value: TellrawPart | TellrawPart[]): HoverEvent => new HoverEvent(value),
};