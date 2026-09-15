// The display-group setters: members, hitbox, light, timing, name and position.
import { BlockValue } from "../block";
import type { ItemValue } from "../item";
import type { ItemDisplayFields } from "../entities.generated";
import { Pos } from "../pos";
import { add } from "../transform-math";
import type {
  DisplayChild,
  DisplayContent,
  DisplayState,
  Transform,
  Vec3,
} from "./types";

/** The setters and geometry of {@link DisplayValue}; each setter returns the group for chaining. */
export class DisplayBuilder {
  readonly children: DisplayChild[] = [];
  protected readonly s: DisplayState = {
    pivot: [0, 0, 0],
    offset: [0, 0, 0],
    pos: "~ ~ ~",
  };

  constructor(
    protected content: DisplayContent,
    private readonly rootTransform: Transform = {},
  ) {}

  /** Replace the root member with a block. */
  setBlock(block: BlockValue): this {
    this.content = { kind: "block", block };
    return this;
  }

  /** Replace the root member with an item. */
  setItem(item: ItemValue, context?: ItemDisplayFields["itemDisplay"]): this {
    this.content = { kind: "item", item, context };
    return this;
  }

  /** Append a child block display at the given transform. */
  add(block: BlockValue, transform: Transform = {}): this {
    this.children.push({ content: { kind: "block", block }, transform });
    return this;
  }

  /** Adds an item display child. One custom-model item replaces many block members. */
  addItem(
    item: ItemValue,
    transform: Transform = {},
    context?: ItemDisplayFields["itemDisplay"],
  ): this {
    this.children.push({ content: { kind: "item", item, context }, transform });
    return this;
  }

  /**
   * Default interpolation ticks for transform changes, so plain `data merge` updates move
   * smoothly.
   */
  interpolation(ticks: number): this {
    this.s.interpolation = ticks;
    return this;
  }

  /**
   * Ticks to glide when teleported. Separate from {@link interpolation}; matters for rigs
   * moved by `tp`.
   */
  teleportDuration(ticks: number): this {
    this.s.teleportDuration = ticks;
    return this;
  }

  /**
   * Fixes the light level (0–15) so displays match nearby blocks instead of rendering dark.
   * `sky` defaults to `block`. Applies to every member.
   */
  brightness(block: number, sky: number = block): this {
    this.s.brightness = { block, sky };
    return this;
  }

  /**
   * Shifts every member by `v`, e.g. to cancel a vehicle's mount point height. The hitbox
   * doesn't move.
   */
  offset(v: Vec3): this {
    this.s.offset = v;
    return this;
  }

  /** The shift {@link offset} applied - what {@link members} already carries. */
  getOffset(): Vec3 {
    return this.s.offset;
  }

  /** Set the local-space pivot the group rotates about (default origin). */
  pivot(p: Vec3): this {
    this.s.pivot = p;
    return this;
  }

  getPivot(): Vec3 {
    return this.s.pivot;
  }

  /**
   * Tags every member `<name>` and `<name>_<i>` (root is 0). Required before summoning,
   * killing or animating.
   */
  named(name: string): this {
    this.s.name = name;
    return this;
  }

  /** The display's name/tag; throws if {@link named} was never called. */
  getName(): string {
    if (this.s.name === undefined) {
      throw new Error(
        "Display has no name - call .named(...) before summoning/animating it.",
      );
    }
    return this.s.name;
  }

  /** Set the position this display is summoned at. */
  at(pos: Pos | string): this {
    this.s.pos = pos;
    return this;
  }

  getPos(): Pos | string {
    return this.s.pos;
  }

  /** Members in order, root first. The hitbox isn't included, since it has no transform. */
  members(): DisplayChild[] {
    const all = [
      { content: this.content, transform: this.rootTransform },
      ...this.children,
    ];
    if (this.s.offset.every((n) => n === 0)) return all;
    return all.map((m) => ({
      ...m,
      transform: {
        ...m.transform,
        translation: add(m.transform.translation ?? [0, 0, 0], this.s.offset),
      },
    }));
  }
}
