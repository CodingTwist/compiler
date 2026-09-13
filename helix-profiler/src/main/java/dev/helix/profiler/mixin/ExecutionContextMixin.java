package dev.helix.profiler.mixin;

import dev.helix.profiler.HelixProfiler;
import dev.helix.profiler.ProfilingTracer;
import net.minecraft.commands.execution.ExecutionContext;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Give every new context our tracer while profiling. `/debug function` sets its own tracer
 * after construction, which replaces ours, so that context just goes unprofiled.
 */
@Mixin(ExecutionContext.class)
abstract class ExecutionContextMixin {
  @Inject(method = "<init>", at = @At("RETURN"))
  private void helixprof$install(CallbackInfo ci) {
    if (HelixProfiler.session != null) ((ExecutionContext<?>) (Object) this).tracer(new ProfilingTracer());
  }
}
