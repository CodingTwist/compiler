import { ASTNode } from "../../ir/node";

export type ClickAction =
  | "run_command"
  | "suggest_command"
  | "open_url"
  | "copy_to_clipboard";

export class ClickEvent {
  constructor(
    public readonly action: ClickAction,
    public readonly value: ASTNode | string,
  ) {}
}

export const click = {
  command: (node: ASTNode):  ClickEvent => new ClickEvent("run_command",       node),
  suggest: (text: string):   ClickEvent => new ClickEvent("suggest_command",   text),
  url:     (url: string):    ClickEvent => new ClickEvent("open_url",          url),
  copy:    (text: string):   ClickEvent => new ClickEvent("copy_to_clipboard", text),
};