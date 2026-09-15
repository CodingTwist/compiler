// The simulator's world: scores, storage, entities and blocks, and running functions over them.
import { CommandError } from "./compute";
import { runCommand, Return } from "./commands";
import type { Compound } from "./nbt";
import { canonicalUuid, uuidFromInts } from "./selector";
import type { SimEntity, SimSource, V3 } from "./types";

/** The world a {@link Sim} runs in. */
export interface SimOptions {
  /** The block id at a block position. Defaults to air everywhere. */
  readonly block?: (x: number, y: number, z: number) => string;
  /** Members of vanilla block tags the pack tests, e.g. `{ "minecraft:air": ["minecraft:air"] }`. */
  readonly blockTags?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Runs a built datapack's functions without the game, for tests. Covers the command subset
 * helix packs emit and throws on anything else.
 *
 *   const sim = new Sim(buildDatapack(dp), { block: (x, y) => (y < 64 ? "minecraft:stone" : "minecraft:air") });
 *   sim.load();
 *   sim.run("execute positioned 0 70 0 run function demo:spawn");
 *   sim.tick();
 *   expect(sim.errors).toEqual([]);
 */
export class Sim {
  /** Live entities, in summon order. */
  readonly entities: SimEntity[] = [];
  /** Commands that failed as they would in game (int overflow, missing score…), with why. */
  readonly errors: string[] = [];
  private readonly scores = new Map<string, number>();
  private readonly storages = new Map<string, Compound>();
  /** Blocks placed by `setblock`/`fill`, over `options.block`. */
  private readonly placed = new Map<string, string>();
  private nextUuid = 1;

  constructor(
    readonly files: ReadonlyMap<string, string>,
    readonly options: SimOptions = {},
  ) {}

  /** Runs the `#minecraft:load` functions. */
  load(): void {
    this.callTag("minecraft:load");
  }

  /** Runs one game tick: the `#minecraft:tick` functions. */
  tick(): void {
    this.callTag("minecraft:tick");
  }

  /** Runs one command as the server, at the world origin unless `source` says otherwise. */
  run(command: string, source: Partial<Omit<SimSource, "sim">> = {}): number {
    const src: SimSource = { sim: this, self: null, at: [0, 0, 0], ...source };
    try {
      return runCommand(this, command, src);
    } catch (e) {
      if (e instanceof Return) return e.value;
      if (!(e instanceof CommandError)) throw e;
      this.errors.push(`${command}: ${e.message}`);
      return 0;
    }
  }

  /** Runs a function (`ns:path`) line by line; returns its `return` value, or 0. */
  call(id: string, src: SimSource): number {
    const [ns, path] = id.split(":");
    const body = this.file(ns, ["function", "functions"], path, ".mcfunction");
    if (body === undefined) throw new Error(`no function ${id}`);
    for (const line of body.split("\n")) {
      if (!line.trim() || line.startsWith("#")) continue;
      try {
        runCommand(this, line, src);
      } catch (e) {
        if (e instanceof Return) return e.value;
        if (!(e instanceof CommandError)) throw e;
        this.errors.push(`${id}: ${line}: ${e.message}`);
      }
    }
    return 0;
  }

  /** A score, or undefined when it's unset. `holder` is a name or an entity's UUID. */
  score(holder: string, objective: string): number | undefined {
    return this.scores.get(`${holder} ${objective}`);
  }

  setScore(holder: string, objective: string, value: number): void {
    this.scores.set(`${holder} ${objective}`, value);
  }

  resetScore(holder: string, objective?: string): void {
    for (const key of this.scores.keys()) {
      if (objective ? key === `${holder} ${objective}` : key.startsWith(`${holder} `)) this.scores.delete(key);
    }
  }

  /** A command storage compound, created empty on first use. */
  storage(id: string): Compound {
    const key = id.includes(":") ? id : `minecraft:${id}`;
    if (!this.storages.has(key)) this.storages.set(key, {});
    return this.storages.get(key)!;
  }

  /** Adds an entity. `Tags` and `UUID` in `nbt` become its tags and UUID. */
  summon(type: string, pos: V3, nbt: Compound = {}): SimEntity {
    const ints = nbt.UUID as number[] | undefined;
    const uuid = ints ? uuidFromInts(ints) : canonicalUuid(`0-0-0-0-${(this.nextUuid++).toString(16)}`)!;
    const entity: SimEntity = {
      uuid,
      type: type.includes(":") ? type : `minecraft:${type}`,
      tags: new Set((nbt.Tags as string[] | undefined) ?? []),
      nbt: { ...structuredClone(nbt), Pos: [...pos] },
    };
    this.entities.push(entity);
    return entity;
  }

  kill(entity: SimEntity): void {
    this.entities.splice(this.entities.indexOf(entity), 1);
    this.resetScore(entity.uuid);
  }

  /** Whether the block at `pos` is `id`, or in `#tag`. */
  blockIs(pos: V3, id: string): boolean {
    const [x, y, z] = pos.map(Math.floor);
    const block = this.placed.get(`${x} ${y} ${z}`) ?? this.options.block?.(x, y, z) ?? "minecraft:air";
    return this.tagMembers("block", id).has(block);
  }

  /** Places `id` (block states dropped) at a block position. */
  setBlock(pos: V3, id: string): void {
    const name = id.split(/[[{]/)[0];
    this.placed.set(pos.map(Math.floor).join(" "), name.includes(":") ? name : `minecraft:${name}`);
  }

  private tagMembers(registry: string, id: string, seen = new Set<string>()): Set<string> {
    if (!id.startsWith("#")) return new Set([id.includes(":") ? id : `minecraft:${id}`]);
    const name = id.slice(1).includes(":") ? id.slice(1) : `minecraft:${id.slice(1)}`;
    const out = new Set<string>();
    if (seen.has(name)) return out;
    seen.add(name);
    const [ns, path] = name.split(":");
    const json = this.file(ns, [`tags/${registry}`, `tags/${registry}s`], path, ".json");
    const given = registry === "block" ? this.options.blockTags?.[name] : undefined;
    if (!json && !given) throw new Error(`unknown ${registry} tag #${name}; pass block tags in SimOptions.blockTags`);
    const values: unknown[] = json ? JSON.parse(json).values : given!;
    for (const v of values) {
      const member = typeof v === "string" ? v : (v as { id: string }).id;
      for (const m of this.tagMembers(registry, member, seen)) out.add(m);
    }
    return out;
  }

  private callTag(name: string): void {
    const [ns, path] = name.split(":");
    if (!this.file(ns, ["tags/function", "tags/functions"], path, ".json")) return;
    for (const id of this.tagMembers("function", `#${name}`)) {
      this.call(id, { sim: this, self: null, at: [0, 0, 0] });
    }
  }

  private file(ns: string, folders: string[], path: string, ext: string): string | undefined {
    for (const folder of folders) {
      const body = this.files.get(`data/${ns}/${folder}/${path}${ext}`);
      if (body !== undefined) return body;
    }
    return undefined;
  }
}
