package dev.helix.profiler;

import java.util.Arrays;
import net.minecraft.commands.execution.TraceCallbacks;
import net.minecraft.resources.Identifier;

/**
 * Labels queue entries for {@link Session}. Vanilla calls {@code onCall(callerDepth, id)} before
 * the callee's commands run at {@code callerDepth + 1}, and {@code onCommand(depth, cmd)} as each
 * command starts. The queue is depth-first, so a per-depth "current function" and "last command"
 * is enough to attribute every entry.
 */
public final class ProfilingTracer implements TraceCallbacks {
  /** Function stack at each depth, ids joined by '\n' (depth 0 = outside any function). */
  private String[] path = {""};
  private String[] lastCommand = {null};

  private void ensure(int depth) {
    if (depth < path.length) return;
    int n = Math.max(depth + 1, path.length * 2);
    path = Arrays.copyOf(path, n);
    lastCommand = Arrays.copyOf(lastCommand, n);
  }

  @Override
  public void onCall(int depth, Identifier id, int size) {
    ensure(depth + 1);
    path[depth + 1] = depth == 0 ? id.toString() : path[depth] + "\n" + id;
    lastCommand[depth + 1] = null;
    Session session = HelixProfiler.session;
    if (session != null) session.countCall(path[depth + 1]);
  }

  @Override
  public void onCommand(int depth, String command) {
    ensure(depth);
    lastCommand[depth] = command;
  }

  /** Charge an entry that ran at {@code depth} to the command last started there. */
  void record(Session session, int depth, long selfNs) {
    if (depth >= path.length || path[depth] == null) return;
    String cmd = lastCommand[depth];
    session.record(path[depth], cmd == null ? "" : cmd, selfNs);
  }

  @Override public void onReturn(int depth, String command, int result) {}
  @Override public void onError(String message) {}
  @Override public void close() {}
}
