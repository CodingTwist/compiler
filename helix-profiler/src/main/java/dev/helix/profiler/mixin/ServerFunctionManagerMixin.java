package dev.helix.profiler.mixin;

import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import dev.helix.profiler.HelixProfiler;
import dev.helix.profiler.Session;
import net.minecraft.server.ServerFunctionManager;
import org.spongepowered.asm.mixin.Mixin;

/** Tick boundaries, for the worst-tick capture. */
@Mixin(ServerFunctionManager.class)
abstract class ServerFunctionManagerMixin {
  @WrapMethod(method = "tick")
  private void helixprof$tick(Operation<Void> original) {
    Session s = HelixProfiler.session;
    if (s == null) {
      original.call();
      return;
    }
    s.beginTick();
    long t0 = System.nanoTime();
    try {
      original.call();
    } finally {
      s.endTick(System.nanoTime() - t0);
    }
  }
}
