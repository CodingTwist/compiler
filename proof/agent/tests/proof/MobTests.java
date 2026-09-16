// Game tests for the spool mob in `tests/pack.ts`, run by vanilla's headless test server.
//
//   $ proof test            # all of them
//   $ proof test golem      # just the ones whose name contains "golem"
//
// Everything asserted here is read off the live entity, never out of a command's output.
package proof;

import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.block.Blocks;

public final class MobTests {
  private MobTests() {}

  /** Where a mob is summoned: one block above the middle of a floor the test lays down itself. */
  private static final BlockPos SPAWN = new BlockPos(4, 2, 4);

  @Test(maxTicks = 60)
  static void golemSummonsWithItsRig(GameTestHelper h) {
    floor(h);
    summonGolem(h);

    at(
        h,
        20,
        () -> {
          Entity golem = tagged(h, "golem");
          h.assertTrue(golem instanceof LivingEntity, "the golem is not a living entity");
          h.assertTrue(((LivingEntity) golem).getHealth() > 0, "the golem died");
          h.assertTrue(
              golem.getPassengers().stream().anyMatch(p -> p.getType() == EntityTypes.BLOCK_DISPLAY),
              "the golem carries no block display");
        });
  }

  @Test(maxTicks = 80)
  static void golemStaysOnTheFloor(GameTestHelper h) {
    floor(h);
    summonGolem(h);

    at(
        h,
        40,
        () -> {
          Entity golem = tagged(h, "golem");
          h.assertTrue(golem.onGround(), "the golem never landed");
          // The floor is at y=1, so a mob standing on it sits at exactly y=2 relative.
          double y = h.relativeVec(golem.position()).y;
          h.assertTrue(Math.abs(y - 2) < 0.01, "the golem rests at y=" + y + ", not 2");
        });
  }

  @Test(maxTicks = 40)
  static void golemRigRidesIt(GameTestHelper h) {
    floor(h);
    summonGolem(h);

    at(
        h,
        20,
        () -> {
          Entity golem = tagged(h, "golem");
          h.assertFalse(golem.getPassengers().isEmpty(), "nothing is riding the golem");
        });
  }

  /** A deliberate failure, so a run that reports nothing is obviously broken. */
  @Test(maxTicks = 20, required = false)
  static void deliberateFailure(GameTestHelper h) {
    h.succeedIf(() -> h.assertTrue(false, "this test fails on purpose"));
  }

  /**
   * Asserts once, on tick {@code tick}, and passes if nothing threw.
   *
   * <p>Not {@code succeedOnTickWhen}, which fails a state that was already true earlier.
   */
  private static void at(GameTestHelper h, int tick, Runnable asserts) {
    h.runAtTickTime(
        tick,
        () -> {
          asserts.run();
          h.succeed();
        });
  }

  /** Wide enough that the mob cannot wander off an edge and fall while a test is watching. */
  private static void floor(GameTestHelper h) {
    for (int x = 0; x < 9; x++)
      for (int z = 0; z < 9; z++) h.setBlock(new BlockPos(x, 1, z), Blocks.STONE);
  }

  private static void summonGolem(GameTestHelper h) {
    var server = h.getLevel().getServer();
    var summon =
        server
            .getFunctions()
            .get(net.minecraft.resources.Identifier.parse("proof:golem/summon"))
            .orElseThrow(() -> h.assertionException("the pack has no proof:golem/summon"));
    server
        .getFunctions()
        .execute(summon, server.createCommandSourceStack().withPosition(h.absoluteVec(vec(SPAWN))));
    h.getLevel().getServer().getFunctions().get(net.minecraft.resources.Identifier.parse("proof:wake"))
        .ifPresent(fn -> server.getFunctions().execute(fn, server.createCommandSourceStack()));
  }

  /**
   * The one entity in this test's area carrying `tag`.
   *
   * <p>Bounded on purpose: tests run side by side in one world, so a level-wide scan can return a
   * neighbouring test's mob.
   */
  private static Entity tagged(GameTestHelper h, String tag) {
    for (Entity e : h.getLevel().getAllEntities())
      if (!e.isRemoved() && e.entityTags().contains(tag) && h.getBounds().contains(e.position()))
        return e;
    throw h.assertionException("no entity tagged " + tag + " in this test's area");
  }

  private static net.minecraft.world.phys.Vec3 vec(BlockPos p) {
    return new net.minecraft.world.phys.Vec3(p.getX(), p.getY(), p.getZ());
  }
}
