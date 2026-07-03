import{C as o,o as s,c as i,j as e,a as t,E as r,w as d}from"./chunks/framework.BWuWLRhz.js";const p={class:"pg-page"},y=JSON.parse('{"title":"Playground","description":"","frontmatter":{"layout":"page","title":"Playground","sidebar":false},"headers":[],"relativePath":"playground.md","filePath":"playground.md"}'),u={name:"playground.md"},f=Object.assign(u,{setup(g){const n=`import { Datapack, v26_2, Selector, ScoreTarget } from "helix";

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
`;return(m,a)=>{const l=o("Playground",!0),c=o("ClientOnly");return s(),i("div",null,[e("div",p,[a[0]||(a[0]=e("h1",{id:"playground",tabindex:"-1"},[t("Playground "),e("a",{class:"header-anchor",href:"#playground","aria-label":'Permalink to "Playground"'},"​")],-1)),a[1]||(a[1]=e("p",null,[t("Write helix authoring code on the left; the compiled datapack - the exact "),e("code",null,".mcfunction"),t(" and JSON files helix emits - appears on the right, recompiled as you type. It's the real compiler running in your browser (no server), so what you see here is what you'd get from "),e("code",null,"dp.writeDatapack(...)"),t(". Change the "),e("strong",null,"target"),t(" version to watch the output adapt (folder names, pack format, command grammar).")],-1)),r(c,null,{default:d(()=>[r(l,{code:n,height:"calc(100vh - 240px)"})]),_:1}),a[2]||(a[2]=e("p",null,[t("See the "),e("a",{href:"/guide/concepts/selectors.html"},"Concepts guide"),t(" for the building blocks, or the "),e("a",{href:"/api/"},"API reference"),t(" for everything in scope.")],-1))])])}}});export{y as __pageData,f as default};
