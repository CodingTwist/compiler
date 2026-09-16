// The handle a live test drives the game with.
//
// Every read here is a field off a live object inside the server, so a test measures the game
// rather than the game's command output.
import type { Client } from "./client";

export type Vec3 = [number, number, number];

/** An entity as it is right now. Positions are relative to the test area's corner. */
export interface EntityView {
  uuid: string;
  type: string;
  pos: Vec3;
  motion: Vec3;
  /** Yaw then pitch, in degrees. */
  rot: [number, number];
  onGround: boolean;
  /** Living entities only. */
  health?: number;
  maxHealth?: number;
  tags: string[];
  /** UUIDs of whatever is riding this entity. */
  passengers: string[];
  vehicle: string | null;
}

export interface BlockView {
  block: string;
  properties: Record<string, string>;
}

export interface CommandResult {
  success: boolean;
  result: number;
  output: string[];
}

/** Narrows which entities to look at. Omitting everything returns all of them. */
export interface EntityFilter {
  type?: string;
  tag?: string;
}

export interface Mc {
  /** Lets exactly `n` ticks run. The game is parked either side, so reads are settled. */
  tick(n?: number): Promise<void>;
  /** Runs a command as the console does, returning its real result and output. */
  cmd(text: string): Promise<CommandResult>;
  /** Runs a datapack function at `pos`, without going through a command. */
  fn(id: string, pos?: Vec3): Promise<void>;
  entities(filter?: EntityFilter): Promise<EntityView[]>;
  /** The single matching entity. Throws when there isn't exactly one. */
  entity(filter?: EntityFilter): Promise<EntityView>;
  block(pos: Vec3): Promise<BlockView>;
  /** A scoreboard value, or null when the holder or objective has none. */
  score(holder: string, objective: string): Promise<number | null>;
  /** Removes every non-player entity, for a clean slate between tests. */
  reset(): Promise<number>;
  /** Ends the session and lets the server shut down. */
  stop(): Promise<void>;
}

export function mc(client: Client): Mc {
  const send = client.send;
  return {
    tick: async (n = 1) => void (await send("tick", { n })),
    cmd: (text) => send("cmd", { text }) as Promise<CommandResult>,
    fn: async (id, pos = [0, 0, 0]) => void (await send("fn", { id, pos })),
    entities: (filter = {}) => send("entities", filter) as Promise<EntityView[]>,
    async entity(filter = {}) {
      const found = await this.entities(filter);
      if (found.length !== 1)
        throw new Error(`expected one entity matching ${JSON.stringify(filter)}, found ${found.length}`);
      return found[0];
    },
    block: (pos) => send("block", { pos }) as Promise<BlockView>,
    score: (holder, objective) => send("score", { holder, objective }) as Promise<number | null>,
    reset: () => send("reset") as Promise<number>,
    stop: async () => void (await send("stop")),
  };
}
