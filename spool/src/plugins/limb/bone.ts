// Bones: block displays on the rig, each stretched along one span of the solved chain.
import { BlockDisplay, Byte, EntityType, Float, Nbt, NbtPath, Range, Relation, Selector, math } from "helix";
import type { FunctionContext, Id, Score, ScoreVec3 } from "helix";
import type { LimbState } from "./state";

/** Rotation components are stored at this scale. */
const Q = 10000;

/**
 * Writes the turn that points +z along `d` into the `left_rotation` list at `path` in `storage`.
 *
 * The shortest turn: axis +z × d, with |d| + d.z for the half angle, normalised. `w` is scratch.
 * The list must already hold four floats.
 */
export function aimRotation(ctx: FunctionContext, storage: Id, path: string, d: ScoreVec3, w: Score): void {
  math`len(${d}) + ${d.z}`.into(w, ctx);
  // z stays 0: the turn's axis is always level.
  const stored = [0, 1, 3];
  ctx
    .if(w.greaterThan(0.001), (b) => {
      const n = math`len(${d.y}, ${d.x}, ${w})`;
      [math`-${d.y} / ${n}`, math`${d.x} / ${n}`, math`${w} / ${n}`].forEach((part, i) =>
        b
          .execute()
          .storeResultStorage(storage, NbtPath(`${path}[${stored[i]}]`), "float", 1 / Q)
          .run((c) => c.compute().defaultFloat(part.floatProvider, Q)),
      );
    })
    // Pointing straight down -z, or no length at all: half a turn about y.
    .else((b) => b.storage(storage).set(NbtPath(path), Nbt([0, 1, 0, 0].map(Float))));
}

/** The frames' initial value, so the stores into them keep their types. */
export function framesInit(s: LimbState) {
  const frame = {
    transformation: { translation: [0, 0, 0].map(Float), left_rotation: [0, 0, 0, 1].map(Float) },
    start_interpolation: Byte(0),
  };
  const all: Record<string, typeof frame> = {};
  s.opts.legs.forEach((_, i) => s.opts.bones.forEach((_, k) => (all[s.boneKey(i, k)] = frame)));
  return Nbt(all);
}

/** Stores leg `i`'s solved bones into their frames: each starts at its joint and points at the next. */
export function storeFrames(s: LimbState, ctx: FunctionContext, i: number): void {
  s.opts.bones.forEach((_, k) => {
    const key = s.boneKey(i, k);
    const from = s.joints[k];
    from.components.forEach((score, axis) =>
      ctx
        .execute()
        .storeResultStorage(s.frames, NbtPath(`${key}.transformation.translation[${axis}]`), "float", 1 / score.scale)
        .run((c) => score.get(c)),
    );
    math`${s.joints[k + 1]} - ${from}`.into(s.d, ctx);
    aimRotation(ctx, s.frames, `${key}.transformation.left_rotation`, s.d, s.w);
  });
}

/**
 * Summons every bone at the executing body and mounts it on the body's rig root.
 * On the root rather than the body, since a vanilla mob seats one passenger.
 */
export function summonBones(s: LimbState, ctx: FunctionContext): void {
  const { name, block, bones, thickness = 0.08 } = s.opts;
  const fresh = `${name}.new`;
  const root = `${name}.root`;
  ctx.execute().on(Relation.PASSENGERS).run((b) => b.tag().add(Selector.self(), root));
  s.opts.legs.forEach((_, i) =>
    bones.forEach((length, k) =>
      ctx.summon(
        BlockDisplay({
          blockState: block,
          tags: [fresh, s.boneTag(i, k)],
          teleportDuration: 2,
          interpolationDuration: 2,
          transformation: Nbt({
            left_rotation: [0, 0, 0, 1].map(Float),
            right_rotation: [0, 0, 0, 1].map(Float),
            translation: [0, 0, 0].map(Float),
            // ponytail: the block's corner sits on the joint, so bones are off by half their width.
            scale: [thickness, thickness, length].map(Float),
          }),
        }),
      ),
    ),
  );
  const near = Range.atMost(2);
  // The root sits mountY up and the ride runs as a bone at the body's feet, so reach past the seat.
  const seat = Range.atMost((s.opts.mountY ?? 0) + 2);
  ctx
    .execute()
    .as(Selector.allEntities().type(EntityType.BLOCK_DISPLAY).tag(fresh).distance(near))
    .run((b) => {
      b.ride().mount(Selector.self(), Selector.allEntities().tag(root).distance(seat).limit(1));
      b.tag().remove(Selector.self(), fresh);
    });
  ctx.execute().on(Relation.PASSENGERS).run((b) => b.tag().remove(Selector.self(), root));
  ctx.tag().add(Selector.self(), s.boned);
}

/** Merges each bone's frame onto it. As the body: bones ride its rig root. */
export function poseBones(s: LimbState, ctx: FunctionContext): void {
  s.opts.legs.forEach((_, i) =>
    s.opts.bones.forEach((_, k) =>
      ctx
        .execute()
        .on(Relation.PASSENGERS)
        .on(Relation.PASSENGERS)
        .ifEntity(Selector.self().tag(s.boneTag(i, k)))
        // ponytail: one passenger scan per bone; one dispatch per passenger if legs get many bones.
        .run((b) => b.entity(Selector.self()).merge(NbtPath("{}"), b.storage(s.frames).at(NbtPath(s.boneKey(i, k))))),
    ),
  );
}
