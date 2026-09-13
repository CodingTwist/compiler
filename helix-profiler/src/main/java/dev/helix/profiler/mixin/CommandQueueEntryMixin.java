package dev.helix.profiler.mixin;

import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import dev.helix.profiler.HelixProfiler;
import dev.helix.profiler.ProfilingTracer;
import net.minecraft.commands.execution.CommandQueueEntry;
import net.minecraft.commands.execution.ExecutionContext;
import org.spongepowered.asm.mixin.Mixin;

/** Times each queue entry (one command, or one function call/continuation step). */
@Mixin(CommandQueueEntry.class)
abstract class CommandQueueEntryMixin {
  @WrapMethod(method = "execute")
  private void helixprof$time(ExecutionContext<?> ctx, Operation<Void> original) {
    if (HelixProfiler.session == null || !(ctx.tracer() instanceof ProfilingTracer tracer)) {
      original.call(ctx);
      return;
    }
    int depth = ((CommandQueueEntry<?>) (Object) this).frame().depth();
    long saved = HelixProfiler.entryStart();
    long t0 = System.nanoTime();
    try {
      original.call(ctx);
    } finally {
      HelixProfiler.entryDone(tracer, depth, System.nanoTime() - t0, saved);
    }
  }
}
