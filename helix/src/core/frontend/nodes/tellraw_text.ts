import { TellrawPart } from "./tellraw_part";

export class TellrawText {
  public readonly parts: TellrawPart[];

  constructor(parts: TellrawPart[]) {
    this.parts = parts;
  }

  append(part: TellrawPart): this {
    if (part instanceof TellrawText) {
      this.parts.push(...part.parts);
    } else {
      this.parts.push(part);
    }
    return this;
  }
}