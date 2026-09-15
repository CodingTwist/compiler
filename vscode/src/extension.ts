// VS Code extension: runs `helix report --json` in a pack and shows each finding on the
// TypeScript line that emitted it.
//
// Install: `npm install && npm run build`, then
// `ln -s "$PWD" ~/.vscode/extensions/helix-report` and reload the window.
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import * as vscode from "vscode";

/** The subset of helix's `Lint` / `NbtRead` / stale allow the extension reads. */
interface Finding {
  rule?: string;
  fn: string;
  line: string;
  hint?: string;
  period?: number;
  guarded?: boolean;
  count?: number;
  source?: string;
}

interface ReportJson {
  packs: {
    target: string;
    lints: Finding[];
    warnings: Finding[];
    staleAllows: { rule: string; fn: string }[];
  }[];
}

const CONFIG = "helix.config.ts";

let diagnostics: vscode.DiagnosticCollection;
let output: vscode.OutputChannel;
/** Files that got diagnostics on each root's last run, so a rerun can clear them. */
const filesByRoot = new Map<string, Set<string>>();
const timers = new Map<string, NodeJS.Timeout>();
const running = new Map<string, ChildProcess>();

export function activate(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection("helix");
  output = vscode.window.createOutputChannel("Helix");
  context.subscriptions.push(
    diagnostics,
    output,
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!vscode.workspace.getConfiguration("helix").get("reportOnSave", true))
        return;
      if (
        !doc.fileName.endsWith(".ts") ||
        doc.fileName.includes(`${path.sep}node_modules${path.sep}`)
      )
        return;
      const root = packRoot(doc.fileName);
      if (root) schedule(root);
    }),
    vscode.commands.registerCommand("helix.report", async () => {
      const active = vscode.window.activeTextEditor?.document.fileName;
      const root = active && packRoot(active);
      if (root) return schedule(root, 0);
      const configs = await vscode.workspace.findFiles(
        `**/${CONFIG}`,
        "**/node_modules/**",
      );
      if (configs.length === 0)
        vscode.window.showWarningMessage(`No ${CONFIG} in this workspace.`);
      for (const uri of configs) schedule(path.dirname(uri.fsPath), 0);
    }),
  );
}

export function deactivate(): void {
  for (const child of running.values()) child.kill();
}

/** The nearest folder at or above `file` holding a `helix.config.ts`. */
function packRoot(file: string): string | undefined {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, CONFIG))) return dir;
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** Debounced so a save-all runs the report once per pack. */
function schedule(root: string, delay = 500): void {
  clearTimeout(timers.get(root));
  timers.set(
    root,
    setTimeout(() => run(root), delay),
  );
}

function run(root: string): void {
  running.get(root)?.kill();
  const local = path.join(root, "node_modules", ".bin", "helix");
  const args = ["report", "--json"];
  const child = fs.existsSync(local)
    ? spawn(local, args, { cwd: root, shell: process.platform === "win32" })
    : spawn("npx", ["helix", ...args], {
        cwd: root,
        shell: process.platform === "win32",
      });
  running.set(root, child);

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  child.on("error", (err) => (stderr += String(err)));
  child.on("close", () => {
    if (running.get(root) !== child) return; // superseded by a newer run
    running.delete(root);
    let report: ReportJson;
    try {
      report = JSON.parse(stdout.trim().split("\n").pop() ?? "");
    } catch {
      // Keep the last diagnostics: a broken build says nothing about the old findings.
      output.appendLine(`[${root}] helix report failed:\n${stderr || stdout}`);
      vscode.window.setStatusBarMessage(
        "$(error) helix report failed - see the Helix output",
        5000,
      );
      return;
    }
    publish(root, report);
  });
}

function publish(root: string, report: ReportJson): void {
  const byFile = new Map<string, vscode.Diagnostic[]>();
  const configFile = path.join(root, CONFIG);
  const push = (
    file: string,
    line: number,
    col: number,
    message: string,
    code: string,
  ) => {
    const d = new vscode.Diagnostic(
      new vscode.Range(line, col, line, 10_000),
      message,
      vscode.DiagnosticSeverity.Warning,
    );
    d.source = "helix";
    d.code = code;
    byFile.set(file, [...(byFile.get(file) ?? []), d]);
  };
  const place = (f: Finding, message: string, code: string) => {
    const loc = f.source && /^(.*):(\d+):(\d+)$/.exec(f.source);
    if (loc)
      push(
        path.resolve(root, loc[1]),
        Number(loc[2]) - 1,
        Number(loc[3]) - 1,
        message,
        code,
      );
    else push(configFile, 0, 0, message, code);
  };

  const multi = report.packs.length > 1;
  for (const pack of report.packs) {
    const target = multi ? `${pack.target}: ` : "";
    for (const l of pack.lints)
      place(l, `${target}${l.hint}${details(l)}`, l.rule ?? "lint");
    for (const w of pack.warnings) {
      place(
        w,
        `${target}entity/block NBT read${details(w)}${w.hint ? `\n${w.hint}` : ""}`,
        "nbt-read",
      );
    }
    for (const s of pack.staleAllows) {
      push(
        configFile,
        0,
        0,
        `${target}dp.allow("${s.rule}", "${s.fn}") names no function - it silences nothing`,
        "stale-allow",
      );
    }
  }

  for (const file of filesByRoot.get(root) ?? [])
    diagnostics.delete(vscode.Uri.file(file));
  for (const [file, list] of byFile)
    diagnostics.set(vscode.Uri.file(file), list);
  filesByRoot.set(root, new Set(byFile.keys()));
}

/** Where the finding sits in the output: function, cadence, repeat count, rendered line. */
function details(f: Finding): string {
  const every =
    f.period === undefined
      ? ""
      : `, ${f.guarded ? "up to " : ""}every ${f.period} tick${f.period === 1 ? "" : "s"}`;
  const count = f.count && f.count > 1 ? `, ×${f.count}` : "";
  return ` (${f.fn}${every}${count})\n${f.line}`;
}
