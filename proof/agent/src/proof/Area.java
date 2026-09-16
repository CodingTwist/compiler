// The empty structure every test is placed in, written into the pack at startup.
//
// `minecraft:empty` is one block across, and a test area is also the only region the game keeps
// ticking: anything a test places or summons a few blocks out lands outside its own area - in a
// neighbouring test's, since areas are laid out in a grid - where entities silently freeze.
package proof;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import net.minecraft.SharedConstants;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.IntTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.NbtIo;

public final class Area {
  private Area() {}

  /** The default `structure` of a {@link Test}, as a resource id. */
  public static final String ID = Agent.NAMESPACE + ":area";

  /** Big enough for a mob to fall, walk and be looked at without leaving the ticking region. */
  private static final int WIDTH = 16, HEIGHT = 8, DEPTH = 16;

  /** Writes the template under {@code data}, replacing any earlier one. */
  public static void write(Path data) throws IOException {
    Path dir = data.resolve(Agent.NAMESPACE).resolve("structure");
    Files.createDirectories(dir);

    CompoundTag root = new CompoundTag();
    root.putInt("DataVersion", SharedConstants.getCurrentVersion().dataVersion().version());
    root.put("size", size());
    root.put("palette", new ListTag());
    root.put("blocks", new ListTag());
    root.put("entities", new ListTag());
    NbtIo.writeCompressed(root, dir.resolve("area.nbt"));
  }

  private static ListTag size() {
    ListTag size = new ListTag();
    for (int n : new int[] {WIDTH, HEIGHT, DEPTH}) size.add(IntTag.valueOf(n));
    return size;
  }
}
