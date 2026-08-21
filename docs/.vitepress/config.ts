import { defineConfig } from "vitepress";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileHelix } from "./plugins/compile-helix.mjs";

// Empty stand-in for Node built-ins so the playground can bundle helix (whose
// disk-writer chunk references `fs`/`path`/`zlib` but is never executed in the
// browser - the pure compile path is builtin-free). See playground/node-stub.ts.
const nodeStub = fileURLToPath(new URL("./playground/node-stub.ts", import.meta.url));

// The API sidebar is regrouped by domain (scripts/group-api.mjs) into
// .vitepress/api-sidebar.json during `gen:api`. Fall back to plain package
// links on a fresh checkout where it hasn't been generated yet.
const apiSidebarPath = fileURLToPath(new URL("./api-sidebar.json", import.meta.url));
const apiSidebar = existsSync(apiSidebarPath)
  ? JSON.parse(readFileSync(apiSidebarPath, "utf8"))
  : [
      {
        text: "API Reference",
        items: [
          { text: "Overview", link: "/api/" },
          { text: "helix", link: "/api/helix/" },
          { text: "spool", link: "/api/spool/" },
          { text: "twine", link: "/api/twine/" },
        ],
      },
    ];

export default defineConfig({
  title: "Helix Compiler",
  description: "A TypeScript Minecraft-datapack compiler - helix, spool, and twine",
  srcDir: ".",
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }]],
  markdown: {
    config: (md) => {
      compileHelix(md);
    },
  },
  themeConfig: {
    logo: "/logo.svg",
    search: {
      provider: "local",
      options: {
        miniSearch: {
          searchOptions: {
            // Push the generated API reference below hand-written guide/examples
            // pages: same match, a fraction of the weight.
            boostDocument: (id: string) =>
              id.includes("/api/") ? 0.15 : 1,
          },
        },
      },
    },
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Helix", link: "/guide/helix" },
      { text: "Spool", link: "/guide/spool" },
      { text: "Twine", link: "/guide/twine" },
      { text: "Examples", link: "/examples/" },
      { text: "Playground", link: "/playground" },
      { text: "API Reference", link: "/api/" },
      { text: "Credits", link: "/credits" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Architecture", link: "/guide/architecture" },
            { text: "Helix - the core compiler", link: "/guide/helix" },
            { text: "Spool - conveniences", link: "/guide/spool" },
            { text: "Twine - the framework", link: "/guide/twine" },
          ],
        },
        {
          text: "Concepts",
          items: [
            { text: "Selectors", link: "/guide/concepts/selectors" },
            { text: "Positions & blocks", link: "/guide/concepts/positions-and-blocks" },
            { text: "Items & NBT", link: "/guide/concepts/items-and-nbt" },
            { text: "Objectives", link: "/guide/concepts/objectives" },
            { text: "Scores", link: "/guide/concepts/scores" },
            { text: "Score vectors", link: "/guide/concepts/score-vectors" },
            { text: "Fixed-point numbers", link: "/guide/concepts/fixed" },
            { text: "Rotations", link: "/guide/concepts/rotations" },
            { text: "Text & tellraw", link: "/guide/concepts/text" },
            { text: "Execute chains", link: "/guide/concepts/execute" },
            { text: "Data resources", link: "/guide/concepts/data-resources" },
            { text: "Loot & advancements", link: "/guide/concepts/loot-and-advancements" },
            { text: "Resource-pack models", link: "/guide/concepts/models" },
          ],
        },
      ],
      "/examples/": [
        {
          text: "Examples",
          items: [
            { text: "Overview", link: "/examples/" },
            { text: "Spool plugin: player motion", link: "/examples/spool-player-motion" },
          ],
        },
      ],
      "/api/": apiSidebar,
    },
    socialLinks: [],
    footer: {
      message: "Released under the MIT License · <a href=\"/credits\">Credits</a>",
      copyright: "Built by Twist",
    },
  },
  vite: {
    resolve: {
      alias: [
        { find: /^(node:)?fs$/, replacement: nodeStub },
        { find: /^(node:)?path$/, replacement: nodeStub },
        { find: /^(node:)?zlib$/, replacement: nodeStub },
      ],
    },
    optimizeDeps: {
      // Both of these are CommonJS and MUST be pre-bundled (CJS -> ESM) so the
      // browser gets real named/default exports instead of raw `exports`:
      //  - helix/browser is a *linked* dep (symlinked into node_modules); Vite
      //    skips pre-bundling linked deps by default, which would serve raw CJS
      //    (`exports is not defined`). Its dynamically-imported disk-writer
      //    chunk touches fs/path/zlib, aliased to node-stub above.
      //  - esbuild-wasm's lib is CJS; if left un-optimized, `import * as esbuild`
      //    yields `{ default }` and `esbuild.initialize` is undefined. The .wasm
      //    is passed explicitly (wasmURL) and `worker:true` spawns esbuild's own
      //    blob worker, so pre-bundling doesn't break wasm/worker resolution.
      include: ["helix/browser", "esbuild-wasm"],
    },
    worker: { format: "es" },
    build: {
      // The symlink resolves helix to /home/sam/compiler/helix/dist, OUTSIDE
      // docs/node_modules, so Rollup's commonjs plugin (which only transforms
      // /node_modules/ by default) would skip it and ship untransformed CJS.
      // Widen the net to include helix's dist.
      commonjsOptions: { include: [/node_modules/, /helix[\\/]dist/] },
      rollupOptions: {
        // helix's dist is CommonJS; its exports are assembled at runtime via
        // `__exportStar` getters (verified: the full namespace, incl.
        // `profileFromRaw`, is enumerable and bound). Rollup's static analysis
        // can't see through that and cries "not exported" - a known false
        // positive for namespace access on CJS. Silence just that one.
        onwarn(warning, warn) {
          if (
            warning.code === "MISSING_EXPORT" &&
            String(warning.message).includes("profileFromRaw")
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
  },
});
