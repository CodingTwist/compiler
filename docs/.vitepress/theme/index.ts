// Custom theme = the default VitePress theme plus the global <Playground>
// component (the in-browser helix compiler). Registering it globally lets any
// markdown page drop a <Playground> without a per-page import.
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Layout from "./Layout.vue";
import Playground from "./Playground.vue";
import "./brand.css";
import "./try-it.css";
import "./credits.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("Playground", Playground);
  },
} satisfies Theme;
