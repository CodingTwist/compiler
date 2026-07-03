---
layout: page
title: Playground
sidebar: false
---

<script setup>
const code = `import { Datapack, v26_2, Selector, ScoreTarget } from "helix";

// Everything runs in your browser - editing recompiles live.
// Leave a top-level \`const dp\`; the panels on the right are the real
// files helix emits. Try the version selector, or start typing \`ctx.\`
// for autocomplete.

const dp = new Datapack("game", v26_2);
const game = dp.objective("game");

const load = dp.createFunction("load");
load.build((ctx) => {
  ctx.scoreInit(game);                       // scoreboard objectives add game dummy
  game.score(ScoreTarget("#round")).set(0, ctx);
});

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  // every player, once per tick
  game.score(Selector.allPlayers()).add(1, ctx);
  ctx.execute()
    .as(Selector.allPlayers())
    .at(Selector.self())
    .run((ctx) => ctx.say("tick!"));
});
`;
</script>

<div class="pg-page">

# Playground

Write helix authoring code on the left; the compiled datapack - the exact
`.mcfunction` and JSON files helix emits - appears on the right, recompiled as you
type. It's the real compiler running in your browser (no server), so what you see
here is what you'd get from `dp.writeDatapack(...)`. Change the **target** version to
watch the output adapt (folder names, pack format, command grammar).

<ClientOnly>
  <Playground :code="code" height="calc(100vh - 240px)" />
</ClientOnly>

See the [Concepts guide](/guide/concepts/selectors) for the building blocks, or the
[API reference](/api/) for everything in scope.

</div>

<style>
.pg-page {
  max-width: 1600px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}
/* Give the playground itself a sensible floor so `calc(100vh …)` never
   collapses on short viewports. */
.pg-page .pg { min-height: 480px; }
</style>
