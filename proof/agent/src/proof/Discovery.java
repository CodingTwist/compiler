package proof;

import com.google.gson.JsonObject;
import java.io.IOException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import net.minecraft.gametest.framework.GameTestHelper;

/** Finds {@link Test} methods in compiled classes and declares them to the game. */
public final class Discovery {
  private Discovery() {}

  public record Case(String name, Method method, Test spec) {}

  /** Every {@link Test} method in the classes under {@code classDir}, sorted by name. */
  public static List<Case> scan(Path classDir) throws IOException {
    List<Case> found = new ArrayList<>();
    try (Stream<Path> files = Files.walk(classDir)) {
      for (Path f : files.filter(p -> p.toString().endsWith(".class")).toList()) {
        String cls = classDir.relativize(f).toString().replace(".class", "").replace('/', '.');
        for (Method m : load(cls).getDeclaredMethods()) {
          Test spec = m.getAnnotation(Test.class);
          if (spec == null) continue;
          if (!Modifier.isStatic(m.getModifiers()) || m.getParameterCount() != 1)
            throw new IllegalStateException(m + " must be static and take one GameTestHelper");
          m.setAccessible(true);
          found.add(new Case(id(m.getName()), m, spec));
        }
      }
    }
    found.sort((a, b) -> a.name().compareTo(b.name()));
    return found;
  }

  /** Resource paths only allow {@code [a-z0-9/._-]}, so a camelCase method becomes snake_case. */
  private static String id(String method) {
    return method.replaceAll("(?<=[a-z0-9])(?=[A-Z])", "_").toLowerCase(java.util.Locale.ROOT);
  }

  private static Class<?> load(String name) {
    try {
      return Class.forName(name, false, Discovery.class.getClassLoader());
    } catch (ClassNotFoundException e) {
      throw new IllegalStateException("could not load " + name, e);
    }
  }

  /** Runs one case, unwrapping reflection so a game-test assertion still reads as itself. */
  public static void run(Case c, GameTestHelper helper) {
    try {
      c.method().invoke(null, helper);
    } catch (java.lang.reflect.InvocationTargetException e) {
      Throwable cause = e.getCause();
      if (cause instanceof RuntimeException r) throw r;
      if (cause instanceof Error err) throw err;
      throw new RuntimeException(cause);
    } catch (IllegalAccessException e) {
      throw new RuntimeException(e);
    }
  }

  /**
   * Writes one {@code test_instance} JSON per case under a pack's {@code data} directory.
   *
   * <p>The game only runs tests it can find as data, so these must land in the pack before the
   * server reads it. Stale files are cleared, or a deleted test would keep running.
   */
  public static void writeInstances(List<Case> cases, Path data) throws IOException {
    Path dir = data.resolve(Agent.NAMESPACE).resolve("test_instance");
    if (Files.isDirectory(dir))
      try (Stream<Path> old = Files.list(dir)) {
        for (Path p : old.toList()) Files.delete(p);
      }
    Files.createDirectories(dir);
    for (Case c : cases) {
      JsonObject o = new JsonObject();
      o.addProperty("type", "minecraft:function");
      o.addProperty("environment", "minecraft:default");
      o.addProperty("function", Agent.NAMESPACE + ":" + c.name());
      o.addProperty("structure", c.spec().structure());
      o.addProperty("max_ticks", c.spec().maxTicks());
      o.addProperty("setup_ticks", c.spec().setupTicks());
      o.addProperty("required", c.spec().required());
      o.addProperty("padding", c.spec().padding());
      Files.writeString(dir.resolve(c.name() + ".json"), o.toString(), StandardCharsets.UTF_8);
    }
  }
}
