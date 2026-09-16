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

  /** Where a mob is summoned: one block above a floor the test lays down itself. */
  private static final BlockPos SPAWN = new BlockPos(2, 2, 2);

  @Test(maxTicks = 60)
  static void golemSummonsWithItsRig(GameTestHelper h) {
    floor(h);
    summonGolem(h);

    h.succeedOnTickWhen(
        20,
        () -> {
          Entity golem = tagged(h, "golem");
          h.assertTrue(golem instanceof LivingEntity, "the golem is not a living entity");
          h.assertTrue(((LivingEntity) golem).getHealth() > 0, "the golem died");
          h.assertTrue(
              !h.findEntities(EntityTypes.BLOCK_DISPLAY, h.absoluteVec(vec(SPAWN)), 16).isEmpty(),
              "the golem has no rig");
        });
  }

  @Test(maxTicks = 80)
  static void golemStaysOnTheFloor(GameTestHelper h) {
    floor(h);
    summonGolem(h);

    h.succeedOnTickWhen(
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

    h.succeedOnTickWhen(
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

  private static void floor(GameTestHelper h) {
    for (int x = 0; x < 5; x++)
      for (int z = 0; z < 5; z++) h.setBlock(new BlockPos(x, 1, z), Blocks.STONE);
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

  /** The one entity carrying `tag`, or an assertion naming what was there instead. */
  private static Entity tagged(GameTestHelper h, String tag) {
    for (Entity e : h.getLevel().getAllEntities())
      if (!e.isRemoved() && e.entityTags().contains(tag)) return e;
    throw h.assertionException("no entity tagged " + tag);
  }

  private static net.minecraft.world.phys.Vec3 vec(BlockPos p) {
    return new net.minecraft.world.phys.Vec3(p.getX(), p.getY(), p.getZ());
  }
}
