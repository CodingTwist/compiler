# Examples

Three worked examples, one per layer, each pulled from the packages' real source so
they stay accurate as the compiler evolves:

- [**Plain helix: TSTrivia**](/examples/helix-trivia) - a trivia pack authored directly
  against helix's public API, no `spool`/`twine`. Lives in `unravel/`.
- [**Spool plugin: player motion**](/examples/spool-player-motion) - launching a player
  with a typed velocity vector via an opt-in `KitPlugin`. Lives in `spool/`.
- [**Twine module: the door**](/examples/twine-door) - a configurable feature module
  (block-display door + spinning cogs) composed with `twine`'s lifecycle hooks. Lives in
  `lab/`.

Read them in order - each one assumes the concepts from the layer below.
