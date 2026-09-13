package dev.helix.profiler;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** One profiling run. Server thread only. */
public final class Session {
  /** stack path -> command -> {queue entries, selfNs}. */
  private final Map<String, Map<String, long[]>> frames = new HashMap<>();
  private Map<String, Map<String, long[]>> tickFrames;
  private Map<String, Map<String, long[]>> worstFrames = Map.of();
  /** stack path -> times that function was entered. */
  private final Map<String, long[]> calls = new HashMap<>();
  private Map<String, long[]> tickCalls;
  private Map<String, long[]> worstCalls = Map.of();
  private final long startNs = System.nanoTime();
  private int ticks;
  private int worstIndex = -1;
  private long worstNs;

  void record(String path, String command, long selfNs) {
    add(frames, path, command, selfNs);
    if (tickFrames != null) add(tickFrames, path, command, selfNs);
  }

  void countCall(String path) {
    calls.computeIfAbsent(path, k -> new long[1])[0]++;
    if (tickCalls != null) tickCalls.computeIfAbsent(path, k -> new long[1])[0]++;
  }

  private static void add(Map<String, Map<String, long[]>> into, String path, String command, long ns) {
    long[] v = into.computeIfAbsent(path, k -> new HashMap<>()).computeIfAbsent(command, k -> new long[2]);
    v[0]++;
    v[1] += ns;
  }

  public void beginTick() {
    tickFrames = new HashMap<>();
    tickCalls = new HashMap<>();
  }

  public void endTick(long ns) {
    if (ns > worstNs) {
      worstNs = ns;
      worstIndex = ticks;
      worstFrames = tickFrames;
      worstCalls = tickCalls;
    }
    tickFrames = null;
    tickCalls = null;
    ticks++;
  }

  /** Self time per function (last id in each stack), for the chat summary. */
  Map<String, Long> selfByFunction() {
    Map<String, Long> out = new HashMap<>();
    frames.forEach((path, cmds) -> {
      String fn = path.substring(path.lastIndexOf('\n') + 1);
      long ns = cmds.values().stream().mapToLong(v -> v[1]).sum();
      out.merge(fn.isEmpty() ? "(outside functions)" : fn, ns, Long::sum);
    });
    return out;
  }

  Path write(Path dir, String mc) throws IOException {
    JsonObject root = new JsonObject();
    root.addProperty("version", 1);
    root.addProperty("mc", mc);
    root.addProperty("ticks", ticks);
    root.addProperty("wallNs", System.nanoTime() - startNs);
    root.add("calls", callsJson(calls));
    root.add("frames", toJson(frames));
    JsonObject worst = new JsonObject();
    worst.addProperty("index", worstIndex);
    worst.addProperty("ns", worstNs);
    worst.add("calls", callsJson(worstCalls));
    worst.add("frames", toJson(worstFrames));
    root.add("worstTick", worst);

    Files.createDirectories(dir);
    Path file = dir.resolve("profile-" + System.currentTimeMillis() + ".json");
    Files.writeString(file, new GsonBuilder().setPrettyPrinting().create().toJson(root));
    return file;
  }

  private static JsonArray stackJson(String path) {
    JsonArray stack = new JsonArray();
    if (!path.isEmpty()) List.of(path.split("\n")).forEach(stack::add);
    return stack;
  }

  private static JsonArray callsJson(Map<String, long[]> calls) {
    JsonArray out = new JsonArray();
    calls.forEach((path, n) -> {
      JsonObject c = new JsonObject();
      c.add("stack", stackJson(path));
      c.addProperty("count", n[0]);
      out.add(c);
    });
    return out;
  }

  private static JsonArray toJson(Map<String, Map<String, long[]>> frames) {
    JsonArray out = new JsonArray();
    frames.forEach((path, cmds) -> cmds.forEach((cmd, v) -> {
      JsonObject f = new JsonObject();
      f.add("stack", stackJson(path));
      f.addProperty("command", cmd);
      f.addProperty("entries", v[0]);
      f.addProperty("selfNs", v[1]);
      out.add(f);
    }));
    return out;
  }
}
