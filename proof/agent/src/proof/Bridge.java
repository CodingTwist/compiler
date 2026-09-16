package proof;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.BlockingQueue;
import net.minecraft.commands.CommandSource;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.ReadOnlyScoreInfo;
import net.minecraft.world.scores.ScoreHolder;

/**
 * The live session: a game test that hands control of the server to the TypeScript side.
 *
 * <p>It parks the server thread at a tick boundary and only lets a tick run when asked, which is
 * both exact stepping and a guarantee that every read sees a settled world.
 */
final class Bridge {
  private Bridge() {}

  static final String NAME = "session";

  /** Ticks the session may consume in total. Only spent when a test asks to advance. */
  private static final int TICK_BUDGET = 200_000;

  private static BlockingQueue<Link.Req> queue;
  private static Link.Req ticking;
  private static int remaining;

  /** Declares the session as data, the same way a game test is declared. */
  static void writeInstance(Path data) throws IOException {
    JsonObject o = new JsonObject();
    o.addProperty("type", "minecraft:function");
    o.addProperty("environment", "minecraft:default");
    o.addProperty("function", Agent.LIVE_NAMESPACE + ":" + NAME);
    o.addProperty("structure", Area.ID);
    o.addProperty("max_ticks", TICK_BUDGET);
    o.addProperty("setup_ticks", 0);
    o.addProperty("required", true);
    o.addProperty("padding", 8);
    Path dir = data.resolve(Agent.LIVE_NAMESPACE).resolve("test_instance");
    Files.createDirectories(dir);
    Files.writeString(dir.resolve(NAME + ".json"), o.toString(), StandardCharsets.UTF_8);
  }

  static void session(GameTestHelper helper) {
    try {
      queue = Link.open();
    } catch (IOException e) {
      throw new RuntimeException("could not open the proof link", e);
    }
    pump(helper);
  }

  /**
   * Serves requests, then lets exactly one tick pass before running again.
   *
   * <p>It reschedules itself rather than using {@code onEachTick}, which would allocate a slot for
   * every tick in the budget up front.
   */
  private static void pump(GameTestHelper helper) {
    if (ticking != null && --remaining <= 0) {
      ticking.reply().complete(JsonNull.INSTANCE);
      ticking = null;
    }
    if (ticking == null && !idle(helper)) return;
    helper.runAtTickTime(helper.getTick() + 1, () -> pump(helper));
  }

  /** Answers requests until one asks for time to pass. False means the session is over. */
  private static boolean idle(GameTestHelper helper) {
    for (; ; ) {
      Link.Req req;
      try {
        req = queue.take();
      } catch (InterruptedException e) {
        throw new RuntimeException(e);
      }
      switch (req.op()) {
        case "tick" -> {
          int n = req.intArg("n", 1);
          if (n <= 0) {
            req.reply().complete(JsonNull.INSTANCE);
            continue;
          }
          ticking = req;
          remaining = n;
          return true;
        }
        case "stop" -> {
          req.reply().complete(JsonNull.INSTANCE);
          helper.succeed();
          return false;
        }
        default -> {
          try {
            req.reply().complete(serve(helper, req));
          } catch (Throwable t) {
            req.reply().completeExceptionally(t);
          }
        }
      }
    }
  }

  private static JsonElement serve(GameTestHelper helper, Link.Req req) {
    MinecraftServer server = helper.getLevel().getServer();
    return switch (req.op()) {
      case "cmd" -> command(helper, req.strArg("text"));
      case "fn" -> function(helper, req.strArg("function"), pos(req));
      case "entities" -> entities(helper, req.strArg("type"), req.strArg("tag"));
      case "block" -> Snapshots.block(helper, BlockPos.containing(pos(req)));
      case "score" -> score(server, req.strArg("holder"), req.strArg("objective"));
      case "reset" -> reset(helper);
      default -> throw new IllegalArgumentException("unknown op " + req.op());
    };
  }

  private static Vec3 pos(Link.Req req) {
    JsonArray a = req.body().getAsJsonArray("pos");
    return a == null
        ? Vec3.ZERO
        : new Vec3(a.get(0).getAsDouble(), a.get(1).getAsDouble(), a.get(2).getAsDouble());
  }

  /** Runs a command as the console would, capturing its real result and its output. */
  private static JsonElement command(GameTestHelper helper, String text) {
    JsonArray output = new JsonArray();
    JsonObject result = new JsonObject();
    CommandSource sink =
        new CommandSource() {
          public void sendSystemMessage(Component message) {
            output.add(message.getString());
          }

          public boolean acceptsSuccess() {
            return true;
          }

          public boolean acceptsFailure() {
            return true;
          }

          public boolean shouldInformAdmins() {
            return false;
          }
        };
    CommandSourceStack source =
        source(helper)
            .withSource(sink)
            .withCallback(
                (success, value) -> {
                  result.addProperty("success", success);
                  result.addProperty("result", value);
                });
    helper.getLevel().getServer().getCommands().performPrefixedCommand(source, text);
    result.add("output", output);
    return result;
  }

  private static JsonElement function(GameTestHelper helper, String id, Vec3 relative) {
    var functions = helper.getLevel().getServer().getFunctions();
    var fn =
        functions
            .get(Identifier.parse(id))
            .orElseThrow(() -> new IllegalArgumentException("no function " + id));
    functions.execute(fn, source(helper).withPosition(helper.absoluteVec(relative)));
    return JsonNull.INSTANCE;
  }

  /** Console-level permissions, positioned at the test origin so `~` means the test's corner. */
  private static CommandSourceStack source(GameTestHelper helper) {
    return helper
        .getLevel()
        .getServer()
        .createCommandSourceStack()
        .withPosition(helper.absoluteVec(Vec3.ZERO));
  }

  private static JsonElement entities(GameTestHelper helper, String type, String tag) {
    JsonArray out = new JsonArray();
    for (Entity e : helper.getLevel().getAllEntities()) {
      if (e.isRemoved()) continue;
      if (tag != null && !e.entityTags().contains(tag)) continue;
      if (type != null && !BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString().equals(type))
        continue;
      out.add(Snapshots.entity(helper, e));
    }
    return out;
  }

  private static JsonElement score(MinecraftServer server, String holder, String objective) {
    Objective obj = server.getScoreboard().getObjective(objective);
    if (obj == null) return JsonNull.INSTANCE;
    ReadOnlyScoreInfo info =
        server.getScoreboard().getPlayerScoreInfo(ScoreHolder.forNameOnly(holder), obj);
    return info == null ? JsonNull.INSTANCE : new JsonPrimitive(info.value());
  }

  private static JsonElement reset(GameTestHelper helper) {
    int killed = 0;
    for (Entity e : helper.getLevel().getAllEntities()) {
      if (e instanceof Player || e.isRemoved()) continue;
      e.discard();
      killed++;
    }
    return new JsonPrimitive(killed);
  }
}
