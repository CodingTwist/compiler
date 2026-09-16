// proof: runs a helix pack inside a real Minecraft server, with a Java agent compiled against
// the server jar so tests read live game objects instead of command output.
//
// Game-test mode — the test is Java, run by vanilla's own headless test server:
//
//   @Test static void golemSurvives(GameTestHelper h) { ... }   // agent/tests/proof/*.java
//   $ proof test
//
// Live mode — the test is TypeScript, driving the same agent over a socket:
//
//   const mc = await useServer(dp);
//   await mc.fn("proof:golem/summon", [2, 1, 2]);
//   await mc.tick(20);
//   expect((await mc.entity({ tag: "golem" })).health).toBeGreaterThan(0);
export { classpath, type Classpath } from "./classpath";
export { compile } from "./compile";
export { parseReport, runTests, type Result, type RunOptions } from "./gametest";
export { jarPath, serverJar } from "./jar";
export { build, launch, type LaunchOptions } from "./launch";
export * from "./live";
