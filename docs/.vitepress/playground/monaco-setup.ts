// Client-only Monaco bootstrap for the playground. Imported dynamically from the
// Vue component's onMounted so its `?worker` imports and browser globals never
// run during SSR. Configures the editor workers, feeds helix's bundled `.d.ts`
// as extra libs (real autocomplete/hover on the helix API), and points bare
// `helix` / `helix/browser` specifiers at those declarations.
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

let configured = false;

async function loadHelixTypes(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}helix-types.json`);
  if (!res.ok) return; // types are a nicety; editing still works without them
  const types = (await res.json()) as Record<string, string>;
  const ts = monaco.languages.typescript.typescriptDefaults;
  for (const [rel, content] of Object.entries(types)) {
    ts.addExtraLib(content, `file:///node_modules/helix/dist/${rel}`);
  }
}

/** Configure Monaco once (workers, TS options, helix types) and return the namespace. */
export async function setupMonaco(): Promise<typeof monaco> {
  if (configured) return monaco;
  configured = true;

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === "typescript" || label === "javascript") return new tsWorker();
      return new editorWorker();
    },
  };

  const ts = monaco.languages.typescript.typescriptDefaults;
  ts.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    baseUrl: "file:///",
    paths: {
      helix: ["node_modules/helix/dist/index.d.ts"],
      "helix/browser": ["node_modules/helix/dist/browser.d.ts"],
    },
    allowNonTsExtensions: true,
    strict: false,
    noEmit: true,
  });
  // The playground injects helix's exports rather than resolving real modules,
  // and never emits, so the "import path can't be resolved for output" style
  // diagnostics are noise here.
  ts.setDiagnosticsOptions({ diagnosticCodesToIgnore: [2307, 1208] });

  await loadHelixTypes();
  return monaco;
}
