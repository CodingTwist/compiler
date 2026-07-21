import { Selector } from "./selector";
import { TellrawPart } from "./tellraw_part";

/**
 * A `{"selector": "<sel>"}` text component - the names of everything the
 * selector matches, joined by the client.
 *
 * It carries a `Selector`, not a string, so the target is built and rendered by
 * the same typed path as any other selector argument.
 */
export class SelectorText extends TellrawPart {
  constructor(public readonly selector: Selector) {
    super();
  }
}

/** Build a selector span: `selectorText(Selector.self())` -> `{"selector":"@s"}`. */
export const selectorText = (selector: Selector): SelectorText =>
  new SelectorText(selector);
