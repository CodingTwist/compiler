---
layout: home

hero:
  name: Helix Compiler
  text: A TypeScript library to create datapacks
  tagline: Write your datapack in TypeScript and let the compiler generate the .mcfunction and JSON files for you.
  image:
    src: /logo.svg
    alt: Helix Compiler
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Examples
      link: /examples/

features:
  - title: '<span class="feat-name">HELIX</span><span class="feat-role">the compiler</span>'
    details: Typed selectors, scores, items and commands. Autocomplete instead of guesswork, and errors before you're in-game.
    link: /guide/helix
  - title: '<span class="feat-name">TWINE</span><span class="feat-role">the framework</span>'
    details: Organise a big pack into modules with setup and per-tick hooks, so features stay separate as the pack grows.
    link: /guide/twine
---

## Write TypeScript, get a datapack

Here's a small function that greets every player and hands them some diamonds. The tabs
below are the actual files the compiler produced from it:

```ts compile
import { Datapack, v26_2, Selector, Item } from "helix";

const dp = new Datapack("welcome", v26_2);

dp.createFunction("greet").build((ctx) => {
  const players = Selector.allPlayers();
  ctx.tellraw(players, "Welcome to the server!");
  ctx.playerGive(players, Item.DIAMOND, 3);
});
```

<div class="next-links">
  <a href="/guide/getting-started">Get started</a>
  <a href="/examples/">Browse the examples</a>
  <a href="/playground">Try it live in the playground</a>
</div>
