package proof;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.phys.Vec3;

/**
 * Live game objects rendered as JSON for the TypeScript side.
 *
 * <p>Every field is read straight off the object, never through a command or its NBT form, which is
 * the whole point of the agent.
 */
final class Snapshots {
  private Snapshots() {}

  /** Positions are relative to the test, so assertions don't depend on where it was placed. */
  static JsonObject entity(GameTestHelper helper, Entity e) {
    JsonObject o = new JsonObject();
    o.addProperty("uuid", e.getUUID().toString());
    o.addProperty("type", BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString());
    o.add("pos", vec(helper.relativeVec(e.position())));
    o.add("motion", vec(e.getDeltaMovement()));
    JsonArray rot = new JsonArray();
    rot.add(e.getYRot());
    rot.add(e.getXRot());
    o.add("rot", rot);
    o.addProperty("onGround", e.onGround());
    if (e instanceof LivingEntity living) {
      o.addProperty("health", living.getHealth());
      o.addProperty("maxHealth", living.getMaxHealth());
    }
    JsonArray tags = new JsonArray();
    for (String t : e.entityTags()) tags.add(t);
    o.add("tags", tags);
    JsonArray riders = new JsonArray();
    for (Entity p : e.getPassengers()) riders.add(p.getUUID().toString());
    o.add("passengers", riders);
    o.addProperty("vehicle", e.getVehicle() == null ? null : e.getVehicle().getUUID().toString());
    return o;
  }

  static JsonObject block(GameTestHelper helper, BlockPos relative) {
    BlockState state = helper.getBlockState(relative);
    JsonObject o = new JsonObject();
    o.addProperty("block", BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString());
    JsonObject props = new JsonObject();
    for (Property<?> p : state.getProperties()) props.addProperty(p.getName(), name(state, p));
    o.add("properties", props);
    return o;
  }

  private static <T extends Comparable<T>> String name(BlockState state, Property<T> p) {
    return p.getName(state.getValue(p));
  }

  private static JsonArray vec(Vec3 v) {
    JsonArray a = new JsonArray();
    a.add(v.x);
    a.add(v.y);
    a.add(v.z);
    return a;
  }
}
