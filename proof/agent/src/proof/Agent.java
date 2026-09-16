// The proof agent: vanilla's own headless game-test server, with our tests added to it.
//
//   java -Dproof.classes=<compiled tests> -Dproof.instances=<pack>/data \
//        -cp "<server classpath>:<agent classes>" proof.Agent \
//        --universe <dir> --packs <folder> --tests "proof:*" --report <file.xml>
//
// Nothing here is a mod: the server jar ships unobfuscated and `TestFunctionLoader` is a public
// static hook, so the tests are plain Java compiled against the jar.
package proof;

import java.nio.file.Path;
import java.util.List;
import java.util.function.Consumer;
import net.minecraft.SharedConstants;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.gametest.framework.GameTestMainUtil;
import net.minecraft.gametest.framework.TestFunctionLoader;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;

public final class Agent {
  private Agent() {}

  /** Namespace of the Java game tests, so `--tests "proof:*"` selects exactly those. */
  public static final String NAMESPACE = "proof";

  /** The live session sits in its own namespace so a game-test run never selects it. */
  public static final String LIVE_NAMESPACE = "proof_live";

  public static void main(String[] args) throws Exception {
    SharedConstants.tryDetectVersion();

    List<Discovery.Case> cases = Discovery.scan(Path.of(System.getProperty("proof.classes")));
    Path data = Path.of(System.getProperty("proof.instances"));
    Area.write(data);
    Discovery.writeInstances(cases, data);
    Bridge.writeInstance(data);

    TestFunctionLoader.registerLoader(
        out -> {
          for (Discovery.Case c : cases)
            out.accept(key(NAMESPACE, c.name()), helper -> Discovery.run(c, helper));
          out.accept(key(LIVE_NAMESPACE, Bridge.NAME), Bridge::session);
        });

    GameTestMainUtil.runGameTestServer(args, p -> {});
  }

  static ResourceKey<Consumer<GameTestHelper>> key(String namespace, String name) {
    return ResourceKey.create(
        Registries.TEST_FUNCTION, Identifier.fromNamespaceAndPath(namespace, name));
  }
}
