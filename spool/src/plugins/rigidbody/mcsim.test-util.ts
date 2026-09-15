// A tiny interpreter for the command subset rb/step emits, over a floor and a wall, so tests
// run the real integer and /compute maths (Java int wrap-around included) without a game.

/** Top of the floor: every block below y=64 is solid. */
export const FLOOR = 64;
/** A wall: every block at x ≥ 3 is solid. */
export const WALL = 3;
const PROBE = "7262-0-0-0-1";

type Json = number | { type: string; [k: string]: unknown };

export class Sim {
  scores = new Map<string, number>();
  storage = new Map<string, number>();
  probe: [number, number, number] = [0, 0, 0];
  wraps = 0;
  constructor(readonly files: Map<string, string>) {}

  key = (h: string, o: string) => `${h} ${o}`;
  get = (h: string, o: string) => this.scores.get(this.key(h, o)) ?? 0;
  set = (h: string, o: string, v: number) => this.scores.set(this.key(h, o), v);

  int(v: number): number {
    const w = v | 0;
    if (w !== v) this.wraps++;
    return w;
  }

  call(fn: string, at: [number, number, number] = [0, 0, 0]): void {
    const body = this.files.get(fn.replace(/^test:/, ""));
    if (body === undefined) throw new Error(`no function ${fn}`);
    for (const line of body.split("\n")) if (line) this.run(line, at);
  }

  run(cmd: string, at: [number, number, number]): void {
    const t = cmd.split(" ");
    if (t[0] === "function") return this.call(t[1], at);
    if (t[0] === "scoreboard") return this.scoreboard(t);
    if (t[0] === "data") {
      if (t[3] === PROBE) this.probe = [0, 1, 2].map((i) => this.storage.get(`probe[${i}]`)!) as never;
      return; // render merge: nothing to simulate
    }
    if (t[0] === "execute") return this.execute(cmd, at);
    throw new Error(`unsupported: ${cmd}`);
  }

  scoreboard(t: string[]): void {
    const [, , verb, h, o, a, b, c] = t;
    if (verb === "set") return void this.set(h, o, +a);
    if (verb === "add") return void this.set(h, o, this.int(this.get(h, o) + +a));
    if (verb === "remove") return void this.set(h, o, this.int(this.get(h, o) - +a));
    if (verb === "operation") {
      const x = this.get(h, o);
      const y = this.get(b, c);
      const r: Record<string, number> = {
        "=": y, "+=": x + y, "-=": x - y, "*=": x * y,
        "/=": Math.floor(x / y), "%=": x - Math.floor(x / y) * y, "<": Math.min(x, y), ">": Math.max(x, y),
      };
      return void this.set(h, o, this.int(r[a]));
    }
    if (verb === "get") return;
    throw new Error(`unsupported scoreboard ${t.join(" ")}`);
  }

  execute(cmd: string, at: [number, number, number]): void {
    const run = cmd.indexOf(" run ");
    const head = cmd.slice(8, run).split(" ");
    const tail = cmd.slice(run + 5);
    let store: ((v: number) => void) | undefined;
    for (let i = 0; i < head.length; ) {
      const w = head[i];
      if (w === "at") { at = [...this.probe]; i += 2; continue; }
      if (w === "store") {
        if (head[i + 2] === "score") { const [h, o] = [head[i + 3], head[i + 4]]; store = (v) => this.set(h, o, v); i += 5; }
        else { const [p, scale] = [head[i + 4], +head[i + 6]]; store = (v) => this.storage.set(p, v * scale); i += 7; }
        continue;
      }
      const want = w === "if";
      if (head[i + 1] === "block") {
        const off = head.slice(i + 2, i + 5).map((s) => +(s.slice(1) || 0));
        const [bx, by] = [Math.floor(at[0] + off[0]), Math.floor(at[1] + off[1])];
        if ((by >= FLOOR && bx < WALL) !== want) return; // the tag is passthrough: open air
        i += 6; continue;
      }
      if (head[i + 1] === "score") {
        const v = this.get(head[i + 2], head[i + 3]);
        let ok: boolean;
        if (head[i + 4] === "matches") {
          const [lo, hi] = head[i + 5].includes("..") ? head[i + 5].split("..") : [head[i + 5], head[i + 5]];
          ok = (lo === "" || v >= +lo) && (hi === "" || v <= +hi);
          i += 6;
        } else {
          const u = this.get(head[i + 5], head[i + 6]);
          ok = { "<": v < u, ">": v > u, "=": v === u, "<=": v <= u, ">=": v >= u }[head[i + 4]]!;
          i += 7;
        }
        if (ok !== want) return;
        continue;
      }
      throw new Error(`unsupported execute part ${w} in ${cmd}`);
    }
    if (tail.startsWith("compute default integer ")) {
      const v = this.compute(JSON.parse(tail.slice(24)));
      store!(Math.trunc(v));
      return;
    }
    if (tail.startsWith("scoreboard players get")) {
      const t = tail.split(" ");
      return store!(this.get(t[3], t[4]));
    }
    this.run(tail, at);
  }

  /** Evaluates a provider; int nodes wrap like Java ints, float nodes (any float input) don't. */
  compute(n: Json): number {
    return this.eval(n)[0];
  }

  eval(n: Json): [number, boolean] {
    if (typeof n === "number") return [n, !Number.isInteger(n)];
    const c = (k: string) => this.eval(n[k] as Json);
    const all = () => (n.inputs as Json[]).map((x) => this.eval(x));
    const fold = (xs: [number, boolean][], f: (a: number, b: number) => number): [number, boolean] => {
      const float = xs.some((x) => x[1]);
      const v = xs.map((x) => x[0]).reduce(f);
      return [float ? v : this.int(v), float];
    };
    switch (n.type) {
      case "score": {
        const t = n.target as { type: string; name?: string };
        return [this.get(t.type === "context" ? "@s" : t.name!, n.score as string), false];
      }
      case "add": return fold(all(), (a, b) => a + b);
      case "mul": return fold(all(), (a, b) => a * b);
      case "sub": return fold([c("left"), c("right")], (a, b) => a - b);
      case "negate": { const [v, f] = c("input"); return [-v, f]; }
      case "floor_div": return [Math.floor(c("left")[0] / c("right")[0]), false];
      case "floor_mod": { const a = c("left")[0], b = c("right")[0]; return [a - Math.floor(a / b) * b, false]; }
      case "min": { const xs = all(); return [Math.min(...xs.map((x) => x[0])), xs.some((x) => x[1])]; }
      case "max": { const xs = all(); return [Math.max(...xs.map((x) => x[0])), xs.some((x) => x[1])]; }
      case "from_int": return [c("input")[0], true];
      case "from_float": return [Math.trunc(c("input")[0]), false];
      case "length": return [Math.hypot(...all().map((x) => x[0])), true];
      case "div": return [c("left")[0] / c("right")[0], true];
      default: throw new Error(`unsupported compute ${n.type}`);
    }
  }
}

