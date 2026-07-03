import { TellrawPart } from "./tellraw_part";

export class Text extends TellrawPart {
  constructor(public readonly text: string) {
    super();
  }
}

/** Build one styled text span: `text("hi").color(Color.GOLD).bold()`. */
export const text = (content: string): Text => new Text(content);
