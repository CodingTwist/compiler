import { Selector } from "./selector";
import { TellrawPart } from "./tellraw_part";

/** A `{"selector": "<sel>"}` text component: the names of every matching entity. */
export class SelectorText extends TellrawPart {
  constructor(public readonly selector: Selector) {
    super();
  }
}

/** Build a selector span: `selectorText(Selector.self())` -> `{"selector":"@s"}`. */
export const selectorText = (selector: Selector): SelectorText =>
  new SelectorText(selector);
