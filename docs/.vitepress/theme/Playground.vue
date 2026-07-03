<script setup lang="ts">
import { ref, shallowRef, onMounted, onBeforeUnmount, computed } from "vue";
import type { compile as CompileFn } from "../playground/run";

const props = withDefaults(
  defineProps<{ code?: string; height?: string }>(),
  { code: "", height: "520px" },
);

const KNOWN_VERSIONS = ["v1_20_1", "v1_20_4", "v1_21_4", "v26_2"] as const;
const VERSION_LABELS: Record<string, string> = {
  v1_20_1: "1.20.1",
  v1_20_4: "1.20.4",
  v1_21_4: "1.21.4",
  v26_2: "26.2",
};

const editorEl = ref<HTMLElement | null>(null);
const bodyEl = ref<HTMLElement | null>(null);
const ready = ref(false);
const files = shallowRef<[string, string][]>([]);
const activeFile = ref(0);
const error = ref<string | null>(null);
const version = ref("v26_2");

// The editor/output split is a draggable ratio (percent of width given to the
// editor), clamped so neither pane can be dragged shut. Monaco's
// `automaticLayout` reflows the editor as the column width changes.
const split = ref(50);
const bodyStyle = computed(() => ({
  gridTemplateColumns: `${split.value}% 6px 1fr`,
}));

function startDrag(e: PointerEvent) {
  e.preventDefault();
  const body = bodyEl.value;
  if (!body) return;
  const move = (ev: PointerEvent) => {
    const rect = body.getBoundingClientRect();
    const pct = ((ev.clientX - rect.left) / rect.width) * 100;
    split.value = Math.min(80, Math.max(20, pct));
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.style.userSelect = "";
  };
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// Filled in on mount (client-only modules).
let editor: any = null;
let monacoNs: any = null;
let compileFn: CompileFn | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const activeContent = computed(() => files.value[activeFile.value]?.[1] ?? "");
const activeLang = computed(() =>
  (files.value[activeFile.value]?.[0] ?? "").endsWith(".json") ? "json" : "mcfunction",
);

function scheduleCompile() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(run, 300);
}

async function run() {
  if (!compileFn || !editor) return;
  const result = await compileFn(editor.getValue());
  if (result.ok) {
    error.value = null;
    files.value = result.files;
    if (activeFile.value >= result.files.length) activeFile.value = 0;
  } else {
    error.value = result.error;
  }
}

// Switch the target version by rewriting whichever version identifier the code
// uses - the version is a value passed to `new Datapack(...)`, so this keeps the
// editor as the single source of truth.
function changeVersion(next: string) {
  version.value = next;
  if (!editor) return;
  let src = editor.getValue();
  for (const v of KNOWN_VERSIONS) {
    src = src.replace(new RegExp(`\\b${v}\\b`, "g"), next);
  }
  editor.setValue(src);
}

onMounted(async () => {
  const [{ setupMonaco }, runMod, { decodeShare }] = await Promise.all([
    import("../playground/monaco-setup"),
    import("../playground/run"),
    import("../playground/share"),
  ]);
  compileFn = runMod.compile;
  monacoNs = await setupMonaco();

  // A `#code=…` hash (from an "Open in playground" link) wins over the page's
  // starter snippet, so an example lands in the editor exactly as authored.
  const shared = decodeShare(window.location.hash);
  const initial = shared ?? props.code;

  // Detect the version the starter code uses so the dropdown matches.
  const found = KNOWN_VERSIONS.find((v) => new RegExp(`\\b${v}\\b`).test(initial));
  if (found) version.value = found;

  editor = monacoNs.editor.create(editorEl.value, {
    value: initial,
    language: "typescript",
    theme: "vs-dark",
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
  });
  editor.onDidChangeModelContent(scheduleCompile);
  ready.value = true;
  run();
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  editor?.dispose();
});
</script>

<template>
  <div class="pg" :style="{ '--pg-height': height }">
    <div class="pg-toolbar">
      <span class="pg-title">helix playground</span>
      <label class="pg-version">
        target
        <select :value="version" @change="changeVersion(($event.target as HTMLSelectElement).value)">
          <option v-for="v in KNOWN_VERSIONS" :key="v" :value="v">{{ VERSION_LABELS[v] }}</option>
        </select>
      </label>
    </div>
    <div class="pg-body" ref="bodyEl" :style="bodyStyle">
      <div class="pg-editor" ref="editorEl">
        <div v-if="!ready" class="pg-loading">loading editor…</div>
      </div>
      <div class="pg-gutter" @pointerdown="startDrag" title="Drag to resize"><span></span></div>
      <div class="pg-output">
        <div v-if="error" class="pg-error"><pre>{{ error }}</pre></div>
        <template v-else>
          <div class="pg-tabs">
            <button
              v-for="(f, i) in files"
              :key="f[0]"
              class="pg-tab"
              :class="{ active: i === activeFile }"
              @click="activeFile = i"
              :title="f[0]"
            >{{ f[0].split("/").pop() }}</button>
            <span v-if="!files.length" class="pg-empty">no output yet</span>
          </div>
          <div class="pg-file">
            <div class="pg-path">{{ files[activeFile]?.[0] }}</div>
            <pre :class="`language-${activeLang}`"><code>{{ activeContent }}</code></pre>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pg {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  margin: 16px 0;
  /* Drag the bottom edge to make the whole playground taller/shorter. */
  height: var(--pg-height);
  min-height: 260px;
  resize: vertical;
}
.pg-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 13px;
}
.pg-title { font-weight: 600; color: var(--vp-c-text-2); }
.pg-version { color: var(--vp-c-text-2); display: flex; align-items: center; gap: 6px; }
.pg-version select {
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 2px 6px;
}
.pg-body {
  display: grid;
  grid-template-columns: 50% 6px 1fr;
  flex: 1;
  min-height: 0;
}
.pg-editor { position: relative; min-width: 0; }
/* Draggable divider between editor and output. */
.pg-gutter {
  cursor: col-resize;
  background: var(--vp-c-divider);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.pg-gutter:hover { background: var(--vp-c-brand-1); }
.pg-gutter span {
  width: 2px;
  height: 28px;
  border-radius: 2px;
  background: var(--vp-c-text-3);
  opacity: 0.5;
}
.pg-gutter:hover span { background: #fff; opacity: 0.9; }
.pg-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--vp-c-text-3);
  font-size: 13px;
}
.pg-output { display: flex; flex-direction: column; min-width: 0; background: var(--vp-c-bg); }
.pg-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px;
  border-bottom: 1px solid var(--vp-c-divider);
  overflow-y: auto;
  max-height: 92px;
}
.pg-tab {
  font-size: 11px;
  font-family: var(--vp-font-family-mono);
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
}
.pg-tab.active { color: var(--vp-c-text-1); border-color: var(--vp-c-brand-1); }
.pg-empty { font-size: 12px; color: var(--vp-c-text-3); padding: 2px 6px; }
.pg-file { flex: 1; overflow: auto; }
.pg-path {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  color: var(--vp-c-text-3);
  padding: 6px 12px 0;
}
.pg-file pre {
  margin: 0;
  padding: 8px 12px 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre;
}
.pg-error { padding: 12px; overflow: auto; }
.pg-error pre {
  margin: 0;
  color: var(--vp-c-danger-1);
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
}
@media (max-width: 720px) {
  .pg { height: auto; resize: none; }
  /* Stack editor over output and drop the drag divider - override the inline
     grid-template-columns the split ratio sets on wider screens. */
  .pg-body { grid-template-columns: 1fr !important; }
  .pg-editor { height: 300px; border-bottom: 1px solid var(--vp-c-divider); }
  .pg-gutter { display: none; }
  .pg-output { height: 300px; }
}
</style>
