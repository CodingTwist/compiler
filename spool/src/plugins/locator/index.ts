/**
 * A marker for reaching positions held in scores, which no command takes without macros.
 *
 *   const loc = locator(dp);
 *   loc.ensure(ctx);
 *   loc.moveTo(ctx, point);                       // point: ScoreVec3.scaled(1000)
 *   ctx.execute().at(loc.selector()).run(...);
 *
 * One per pack, moved and used within the same function, so callers can share it.
 */
import { Datapack, Double, EntityAnchor, Id, Marker, Nbt, NbtPath, Path, Pos, Selector } from "helix";
import type { FunctionContext, ScoreVec3 } from "helix";

/** The handle {@link locator} returns. */
export interface Locator {
  /** The marker, by UUID. */
  selector(): Selector;
  /** Summons the marker here if it's missing. */
  ensure(ctx: FunctionContext): void;
  /** Moves the marker to `point`, read at its scale: three storage stores and one entity write. */
  moveTo(ctx: FunctionContext, point: ScoreVec3): void;
  /** Moves the marker to the executing entity's eyes. */
  toEyes(ctx: FunctionContext): void;
  /** Reads the marker's position into `into`, at its scale. */
  read(ctx: FunctionContext, into: ScoreVec3): void;
}

const UUID = "6c6f63-0-0-0-1";
const UUID_INTS: [number, number, number, number] = [0x6c6f63, 0, 0, 1];
const BUFFER = NbtPath("pos");

const locators = new WeakMap<Datapack, Locator>();

/** The pack's locator marker. */
export function locator(dp: Datapack): Locator {
  const existing = locators.get(dp);
  if (existing) return existing;
  const storage = Id(`${dp.name}:locator`);
  // Indexed stores only write into a list that already exists.
  dp.createFunction("locator/init", "load").build((ctx) =>
    ctx.storage(storage).mergeAll(Nbt({ pos: [Double(0), Double(0), Double(0)] })),
  );
  const selector = () => Selector.uuid(UUID);
  const loc: Locator = {
    selector,
    ensure: (ctx) => ctx.execute().unlessEntity(selector()).run((b) => b.summon(Marker({ uuid: UUID_INTS }), Pos.here())),
    moveTo(ctx, point) {
      const scale = point.x.scale;
      point.components.forEach((score, axis) =>
        ctx
          .execute()
          .storeResultStorage(storage, BUFFER.index(axis), "double", 1 / scale)
          .run((c) => score.get(c)),
      );
      ctx.entity(selector()).set(Path.Entity.Pos, ctx.storage(storage).at(BUFFER));
    },
    toEyes: (ctx) => ctx.execute().anchored(EntityAnchor.EYES).positioned(Pos.local(0, 0, 0)).run((b) => b.teleport(selector(), Pos.here())),
    read: (ctx, into) => into.readEntity(selector(), Path.Entity.Pos, { ctx }),
  };
  locators.set(dp, loc);
  return loc;
}
