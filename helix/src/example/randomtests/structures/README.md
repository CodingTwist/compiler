# Structure assets

Drop `.nbt` structure files here. Each is shipped verbatim into the built pack at
`data/example/<structure|structures>/<name>.nbt` (the folder name is chosen from
the target version), and is loadable by its template id:

```
structures/cog.nbt          ->  /place template example:cog
structures/doors/big.nbt    ->  /place template example:doors/big
```

Author one by building it in-world, saving it via a structure block's **SAVE**
GUI (Java has no command to capture a region at runtime), then copying the
generated `.nbt` from the world's `generated/<ns>/structures/` into this folder.

Wired up in `example.ts` via `dp.addStructures(...)`; restore them around an
animation with `clip.swaps("example:<name>", from, to)`.
