# Text & tellraw

Chat, titles, sign text and hover tooltips all use Minecraft's text-component JSON.
Helix builds it from two small classes plus two event helpers - you compose objects, and
the compiler serialises the (fiddly, version-sensitive) JSON.

## `text()` and parts

- [`text(str)`](/api/helix/functions/text) builds **one** styled span - a string plus fluent
  styling. (`Text` is the underlying class; `text()` is the factory you'll normally reach for.)
- A message is just an **array** of parts - `ctx.tellraw` takes it directly. For a named,
  reusable message you can also hold a [`TellrawText`](/api/helix/classes/TellrawText).

Every part extends `TellrawPart`, so the styling methods below exist on all of them and each
returns `this` for chaining. Colours are the typed [`Color`](/api/helix/variables/Color)
constants (a raw `#RRGGBB` hex string also works):

| Method | Effect |
| --- | --- |
| `.color(Color.GOLD)` | a named colour (or `"#ff8800"` hex) |
| `.bold()` / `.italic()` | bold / italic on (pass `false` to force off) |
| `.underlined()` / `.strikethrough()` / `.obfuscated()` | the remaining vanilla styles |
| `.onClick(event)` | attach a click action (see below) |
| `.onHover(event)` | attach a hover tooltip |

```ts compile
import { Datapack, v26_2, Selector, text, Color } from "helix";

const dp = new Datapack("ui", v26_2);

const banner = dp.createFunction("banner");
banner.build((ctx) => {
  ctx.tellraw(Selector.allPlayers(), [
    text("[TSTrivia] ").color(Color.GOLD).bold(),
    text("round starting!").color(Color.GREEN),
  ]);
});
```

For a message you build up conditionally, `TellrawText` also has `.append(part)`, and
appending another `TellrawText` splices its parts in.

## Click events

The [`click`](/api/helix/variables/click) helper builds the four click actions. Note `click.command` takes a **command node**, not a string - you pass a real helix command, so the click target is typed and rendered like any other command:

| Helper | Action |
| --- | --- |
| `click.command(node)` | run a command |
| `click.suggest(text)` | pre-fill the chat box |
| `click.url(url)` | open a URL |
| `click.copy(text)` | copy to clipboard |

## Hover events

[`hover`](/api/helix/variables/hover)`.text(part | parts)` shows text on hover - and
because a hover tooltip is itself made of `TellrawPart`s, it styles exactly like the top-level message.

```ts compile
import { Datapack, v26_2, Selector, text, Color, click, hover } from "helix";

const dp = new Datapack("ui", v26_2);

const menu = dp.createFunction("menu");
menu.build((ctx) => {
  ctx.tellraw(Selector.allPlayers(), [
    text("[ Teleport to spawn ]")
      .color(Color.GREEN)
      .bold()
      .onClick(click.suggest("/tp @s 0 100 0"))
      .onHover(hover.text(text("Fills the command in for you").color(Color.GRAY))),
  ]);
});
```

## Scores as text

A [`Score`](/api/helix/classes/Score) is also a `TellrawPart`, so you can drop a live
score straight into a message - it renders as the `score` component and updates in place.
See [Scores](/guide/concepts/scores) for building the cell.
