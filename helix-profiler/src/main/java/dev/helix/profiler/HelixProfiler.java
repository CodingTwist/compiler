package dev.helix.profiler;

import static net.minecraft.commands.Commands.literal;

import com.mojang.brigadier.context.CommandContext;
import java.nio.file.Path;
import java.util.Map;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.SharedConstants;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.storage.LevelResource;

public final class HelixProfiler implements ModInitializer {
  /** The running session, or null. Mixins check this first so profiling costs nothing when off. */
  public static Session session;
  /** Time spent in queue entries nested inside the entry currently running. */
  private static long childNs;

  /** Called around every command queue entry. */
  public static void entryDone(ProfilingTracer tracer, int depth, long elapsedNs, long savedChildNs) {
    long self = elapsedNs - childNs;
    childNs = savedChildNs + elapsedNs;
    if (session != null) tracer.record(session, depth, self);
  }

  public static long entryStart() {
    long saved = childNs;
    childNs = 0;
    return saved;
  }

  @Override
  public void onInitialize() {
    CommandRegistrationCallback.EVENT.register((dispatcher, registries, selection) -> dispatcher.register(
        literal("helixprof")
            .requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
            .then(literal("start").executes(HelixProfiler::start))
            .then(literal("stop").executes(HelixProfiler::stop))));
  }

  private static int start(CommandContext<CommandSourceStack> ctx) {
    session = new Session();
    ctx.getSource().sendSuccess(() -> Component.literal("helix profiler started"), false);
    return 1;
  }

  private static int stop(CommandContext<CommandSourceStack> ctx) {
    Session s = session;
    session = null;
    CommandSourceStack src = ctx.getSource();
    if (s == null) {
      src.sendFailure(Component.literal("helix profiler is not running"));
      return 0;
    }
    try {
      Path dir = src.getServer().getWorldPath(LevelResource.ROOT).resolve("helix-profile");
      Path file = s.write(dir, SharedConstants.getCurrentVersion().name());
      src.sendSuccess(() -> Component.literal("helix profile written: " + file.normalize()), false);
    } catch (Exception e) {
      src.sendFailure(Component.literal("helix profiler: write failed: " + e));
      return 0;
    }
    s.selfByFunction().entrySet().stream()
        .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
        .limit(5)
        .forEach(e -> src.sendSuccess(
            () -> Component.literal(String.format("  %8.3f ms  %s", e.getValue() / 1e6, e.getKey())), false));
    return 1;
  }
}
