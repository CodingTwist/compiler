import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Skip build output, generated sources (version data + generated commands are
  // machine-written), and the plain-JS Node tooling (bin/ + scripts/) - the lint
  // gate is for the typed library source, not those.
  {
    ignores: [
      "dist/**",
      "bin/**",
      "scripts/**",
      "src/versions/data/**",
      "src/versions/ids.ts",
    ],
  },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  tseslint.configs.recommended,
  {
    // Allow a leading-underscore convention for deliberately-unused args (e.g. a
    // Predicate builder callback that ignores the version it's handed).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Tests probe internals and shapes; `any` there is a tool, not a smell.
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);
