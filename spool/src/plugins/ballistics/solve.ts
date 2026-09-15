// Solves the launch velocity that makes a projectile hit a target.
import type { Vec3 } from "helix";
import {
  closestApproach,
  sampleAt,
  simulate,
  trajectoryBasis,
} from "./physics";
import { MOTION_AXIS_LIMIT, PROJECTILES } from "./projectiles";
import type { LaunchOptions, LaunchSolution } from "./launch";

/**
 * Solves a launch. Throws if nothing fits, since a shot that can't reach should fail the
 * build.
 */
export function solveLaunch(
  from: Vec3,
  to: Vec3,
  opts: LaunchOptions = {},
): LaunchSolution {
  const profile = opts.projectile ?? PROJECTILES.tnt;
  const maxTicks = Math.floor(opts.maxTicks ?? profile.defaultFuse ?? 200);
  const minTicks = Math.max(opts.minTicks ?? 1, 1);
  const samples = Math.max(1, Math.round(opts.subTickSamples ?? 1));
  const minSpeed = opts.minSpeed ?? 0;
  const maxSpeed = opts.maxSpeed ?? MOTION_AXIS_LIMIT;
  if (maxTicks < minTicks) {
    throw new Error(
      `ballistics: maxTicks (${maxTicks}) is below minTicks (${minTicks}).`,
    );
  }

  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const range = Math.hypot(dx, dz);
  // Straight up or down has no direction; use yaw 0 instead of atan2(0, 0).
  const [ux, uz] = range < 1e-9 ? [0, 0] : [dx / range, dz / range];

  // The basis only needs building once - it is a property of the projectile, not the shot.
  const { A, Ay, G } = trajectoryBasis(profile, maxTicks);

  let best: { t: number; v: Vec3; speed: number; score: number } | undefined;
  let closestSpeed = Infinity; // for the diagnostic when nothing fits the speed budget
  for (let i = minTicks * samples; i <= maxTicks * samples; i++) {
    const t = i / samples;
    const a = sampleAt(A, t);
    const ay = sampleAt(Ay, t);
    if (a <= 0 || ay <= 0) continue;

    // The exact inverse: horizontal displacement is v_h·A, vertical is v_y·Ay + G.
    const vh = range / a;
    const vy = (dy - sampleAt(G, t)) / ay;
    const v: Vec3 = [vh * ux, vy, vh * uz];
    const speed = Math.hypot(vh, vy);

    closestSpeed = Math.min(closestSpeed, speed);
    if (speed < minSpeed || speed > maxSpeed) continue;
    // Per-axis, because vanilla zeroes an axis over the limit rather than clamping it.
    if (v.some((c) => Math.abs(c) > MOTION_AXIS_LIMIT)) continue;
    const pitch = pitchOf(v);
    if (
      opts.pitchRange &&
      (pitch < opts.pitchRange[0] || pitch > opts.pitchRange[1])
    )
      continue;

    const score =
      opts.prefer === "min-time" ? t : opts.prefer === "max-time" ? -t : speed;
    if (!best || score < best.score) best = { t, v, speed, score };
  }

  if (!best)
    throw noSolution(from, to, opts, {
      minSpeed,
      maxSpeed,
      minTicks,
      maxTicks,
      closestSpeed,
    });

  // Fly the solved velocity through the real integrator and measure the actual miss.
  const path = simulate(from, best.v, profile, maxTicks);
  const hit = closestApproach(path, to);

  return {
    yaw: yawOf(best.v),
    pitch: pitchOf(best.v),
    speed: best.speed,
    velocity: best.v,
    ticks: best.t,
    impact: hit.point,
    impactTick: hit.tick,
    error: hit.distance,
    path,
    projectile: profile,
  };
}

/** `yaw = atan2(-x, z)`: the inverse of Minecraft's `(-sin y·cos p, -sin p, cos y·cos p)`. */
function yawOf(v: Vec3): number {
  const range = Math.hypot(v[0], v[2]);
  return range < 1e-9 ? 0 : (Math.atan2(-v[0], v[2]) * 180) / Math.PI;
}

/** `pitch = atan2(-y, |horizontal|)`, so upward velocity gives a negative pitch. */
function pitchOf(v: Vec3): number {
  return (Math.atan2(-v[1], Math.hypot(v[0], v[2])) * 180) / Math.PI;
}

/** Say *which* constraint bit, not just "no solution" - the speed budget is the usual one. */
function noSolution(
  from: Vec3,
  to: Vec3,
  opts: LaunchOptions,
  ctx: {
    minSpeed: number;
    maxSpeed: number;
    minTicks: number;
    maxTicks: number;
    closestSpeed: number;
  },
): Error {
  const reach = Number.isFinite(ctx.closestSpeed)
    ? `the cheapest arc in ${ctx.minTicks}-${ctx.maxTicks} ticks needs ${ctx.closestSpeed.toFixed(3)} blocks/tick`
    : `no flight time in ${ctx.minTicks}-${ctx.maxTicks} ticks reaches it`;
  const pitch = opts.pitchRange
    ? ` within pitch ${opts.pitchRange[0]}..${opts.pitchRange[1]}`
    : "";
  return new Error(
    `ballistics: no launch from [${from}] hits [${to}]${pitch} with speed in ` +
      `${ctx.minSpeed}..${ctx.maxSpeed} blocks/tick - ${reach}. ` +
      `Raise maxSpeed/maxTicks, or move the target closer.`,
  );
}
