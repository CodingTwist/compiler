// Feet: turning points between world and body frame, planting, and stepping to the ground.
import { BLOCK_TAGS, Block, NbtPath, Path, Pos, Selector, and, math } from "helix";
import type { FunctionContext, FunctionRef, ScoreVec3 } from "helix";
import { MM, type LimbState } from "./state";
import type { Local } from "./types";

const AIR = Block.tag(BLOCK_TAGS.AIR);
/** Blocks a ground probe looks down from two above the body. */
const PROBE_DEPTH = 5;

/** Reads the executing body's position and yaw. */
export function readBody(s: LimbState, ctx: FunctionContext): void {
  s.body.readEntity(Selector.self(), Path.Entity.Pos, { ctx });
  ctx.execute().storeResultScore(s.yaw).run((c) => c.entity(Selector.self()).get(NbtPath("Rotation[0]"), MM));
  math`sin(${s.yaw} * ${Math.PI / 180})`.into(s.sin, ctx);
  math`cos(${s.yaw} * ${Math.PI / 180})`.into(s.cos, ctx);
}

/** Writes the world point at `local` (like `^ ^ ^`) from the body into `into`. */
export function toWorld(s: LimbState, ctx: FunctionContext, [left, up, fwd]: Local, into: ScoreVec3): void {
  math`${s.body.x} + ${s.cos} * ${left} - ${s.sin} * ${fwd}`.into(into.x, ctx);
  math`${s.body.y} + ${up}`.into(into.y, ctx);
  math`${s.body.z} + ${s.sin} * ${left} + ${s.cos} * ${fwd}`.into(into.z, ctx);
}

/** Writes world point `p` into {@link LimbState.local}: the body's frame, measured from the rig's seat. */
function toLocal(s: LimbState, ctx: FunctionContext, p: ScoreVec3): void {
  const { body, sin, cos, local } = s;
  math`${cos} * (${p.x} - ${body.x}) + ${sin} * (${p.z} - ${body.z})`.into(local.x, ctx);
  math`${p.y} - ${body.y} - ${s.opts.mountY ?? 0}`.into(local.y, ctx);
  math`${cos} * (${p.z} - ${body.z}) - ${sin} * (${p.x} - ${body.x})`.into(local.z, ctx);
}

/** Counts each group's stepping legs, for the gait gate. */
export function countSteps(s: LimbState, ctx: FunctionContext): void {
  s.stepping.forEach((g) => g.set(0, ctx));
  s.opts.legs.forEach((leg, i) => ctx.if(s.legs[i].clock.atLeast(1), (c) => s.stepping[leg.group].add(1, c)));
}

/** Puts every foot at its rest point, the first time a body is seen. */
export function plant(s: LimbState, ctx: FunctionContext): void {
  s.opts.legs.forEach((leg, i) => toWorld(s, ctx, leg.rest, s.legs[i].foot));
}

/**
 * `probe_<leg>`: finds the ground under the leg's rest point and starts a step there.
 * A rest point over a drop deeper than the probe starts nothing, so the foot stays put.
 */
export function buildProbe(s: LimbState, ctx: FunctionContext, i: number): void {
  const { rest, group } = s.opts.legs[i];
  const leg = s.legs[i];
  const loc = s.locator;
  toWorld(s, ctx, [rest[0], 2, rest[2]], s.world);
  loc.moveTo(ctx, s.world);
  // ponytail: probes whole blocks against the air tag, so a foot lands on grass and misses slabs.
  for (let n = 0; n < PROBE_DEPTH; n++)
    ctx.execute().at(loc.selector()).ifBlock(Pos.rel(0, -1, 0), AIR).run((b) => b.teleport(loc.selector(), Pos.rel(0, -1, 0)));
  ctx
    .execute()
    .at(loc.selector())
    .unlessBlock(Pos.rel(0, -1, 0), AIR)
    .run((b) => {
      loc.read(b, leg.to);
      math`floor(${leg.to.y})`.into(leg.to.y, b);
      leg.from.assign(leg.foot, b);
      leg.clock.set(s.opts.stepPolls ?? 3, b);
      s.stepping[group].add(1, b);
    });
}

/** Starts the leg's step if its foot has drifted and the other group is planted, then moves a stepping foot. */
export function step(s: LimbState, ctx: FunctionContext, i: number, probe: FunctionRef): void {
  const { rest, group } = s.opts.legs[i];
  const { foot, from, to, clock } = s.legs[i];
  const stride = s.opts.stride ?? 0.9;
  const polls = s.opts.stepPolls ?? 3;
  const lift = s.opts.lift ?? 0.4;
  toLocal(s, ctx, foot);
  const { local, w } = s;
  math`(${local.x} - ${rest[0]}) * (${local.x} - ${rest[0]}) + (${local.z} - ${rest[2]}) * (${local.z} - ${rest[2]})`.into(w, ctx);
  ctx.if(and(clock.equal(0), w.greaterThan(stride * stride), s.stepping[1 - group].equal(0)), (c) => c.call(probe));
  ctx.if(clock.atLeast(1), (c) => {
    clock.remove(1, c);
    math`(${polls} - ${clock}) / ${polls}`.into(w, c);
    math`${from} + (${to} - ${from}) * ${w}`.into(foot, c);
    math`${foot.y} + ${lift} * sin(${w} * ${Math.PI})`.into(foot.y, c);
    toLocal(s, c, foot);
  });
}
