// Live mode: plain TypeScript tests driving a real server through the Java agent.
//
//   const mc = await useServer(dp);
//   await mc.fn("proof:golem/summon", [2, 1, 2]);
//   await mc.tick(20);
//   expect((await mc.entity({ tag: "golem" })).health).toBeGreaterThan(0);
export { connect, type Client } from "./client";
export {
  mc,
  type BlockView,
  type CommandResult,
  type EntityFilter,
  type EntityView,
  type Mc,
  type Vec3,
} from "./mc";
export { server, useServer, type ServerOptions } from "./session";
