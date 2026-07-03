import { EntityType, Id } from "helix";

// ── Tuning knobs + the physics rationale behind them ────────────────────────
//
// Every magic number the grapple turns on lives here, each with the *why* next to
// it, so a playtester tweaks values in one file. The vector algebra that consumes
// them is in `physics.ts`; the shared state that hands them out is `context.ts`.

/**
 * **Physics: a web-swing pendulum, not a spring.** The web fixes a *radius* (the
 * distance to the anchor at the moment you fire). **The engine's own gravity does the
 * falling** - we leave it on and don't fight it. The plugin *only* applies an impulse
 * (via player_motion's `applyGlobal`, which **adds** to velocity), so a slack tick
 * applies a zero impulse and the player simply falls under engine gravity; the rope
 * acts only when *taut*. The rope's whole job is to keep you *on* that radius - so each
 * taut tick we cancel the *full radial* component of velocity (a rope is inextensible:
 * radial velocity ~0, tangential untouched) and add a small position trim (Baumgarte,
 * `(dist² − ropeLen²)/BAUMGARTE_DIV`) back onto the sphere. Cancelling only the *outward*
 * radial part felt like a bungee (the trim's inward nudge was never removed); cancelling
 * the full radial part critically damps that.
 *
 * **Tangential momentum sustain** (`+v_tang/SUSTAIN_DIV`): because the impulse model can
 * only *add* to velocity (Minecraft has no set-velocity), it can correct the rope but
 * can't stop the *engine* from dragging the player ~9 %/tick horizontally - so a raw
 * pendulum bleeds its swing speed in a second or two and feels **limp**. Each taut tick
 * we re-add the slice of *tangential* velocity that drag will remove, so the swing holds
 * speed and can be **pumped** (strafe to build amplitude, like a real swing). It's
 * tangential *only* - the radial axis (the bounce axis, already cancelled) is projected
 * out, so the sustain can't re-feed the vertical bounce.
 *
 * History to not relitigate: simulating gravity *in* the solver (engine gravity off,
 * inject the pull each tick) was tried to kill a bottom-of-swing bounce; it made the
 * swing feel sluggish and stationary grapples just hung (no gravity built any speed).
 * Letting real engine gravity do the falling and only correcting radial velocity is the
 * model that actually reads as a swing. The small late-reaction sag at the bottom is the
 * accepted trade. The vector algebra itself lives in `physics.ts`.
 *
 * No `sqrt` needed: velocity is measured as the per-tick position delta
 * (`pos - prev`), and the radial cancel is `-(v·r / r·r) · r` - the normalization
 * cancels, so it's all integer dot products.
 *
 * **Fixed-point scale is decimetres (x10 = 1 block).** This is load-bearing, not
 * arbitrary: the cancel divides by `dist²`, and that division is *integer*. The
 * radial velocity in a straight-down hang is tiny (~one gravity step) against a
 * large `dist²`, so at too fine a scale (cm) `frac = -dot·FRAC_SCALE / dist²`
 * truncates to **0** on any rope past a handful of blocks - zero impulse, free
 * fall. Decimetres keep `frac` a meaningful integer across the whole rope range
 * while `dot·FRAC_SCALE` still fits int32 on fast swings (cm overflows if you
 * raise the precision instead). `FRAC_SCALE = 1000` then matches the impulse into
 * player_motion's `10000 = 1 block/tick` units (`FRAC_SCALE / POS_PER_BLOCK · ...`).
 */
export const POS_PER_BLOCK = 10;
/** Default raycast steps (0.5 blocks each) when `maxReach` is unset - 50 blocks. */
export const MAX_STEPS = 100;
/**
 * Per-axis clamp on the constraint impulse, in player_motion's `10000 = 1
 * block/tick` units (so `8000` ≈ 0.8 block/tick). The pendulum impulse is already
 * bounded by radial speed / overshoot, but the *first* taut tick after firing
 * while moving fast can overshoot the rope a lot; this caps that single yank so a
 * grapple never flings the player. Raise for a snappier reel-in, lower for a
 * softer rope.
 */
export const MAX_IMPULSE = 8000;

/* ── Feel knobs (tweak these, rebuild, playtest) ──────────────────────────── */
/**
 * Stiffness of the position trim: the constraint divides the radius overshoot by
 * this before pulling you back onto the rope sphere. The *full radial-velocity
 * cancel* does the actual holding, so this term only needs to gently undo drift -
 * keep it **soft**. **Higher = softer, less bouncy rope; lower = stiffer/springier;
 * `0` disables the trim entirely** (pure velocity-cancel, which holds the radius on
 * its own; only re-enable if a long swing visibly droops/lengthens).
 *
 * Was `8`, and the log proved that too stiff: at a deep catch (overshoot ~9400) the
 * trim added `+1178` on top of the `+1672` velocity-cancel - a ~70 % over-correction
 * that flung the player *past* the rope into slack, where gravity free-fell them into
 * a harder next catch → a **growing vertical limit-cycle bounce** that out-pumped the
 * drag. Softened to `32` so the catch critically damps instead of over-correcting (at
 * that same overshoot the trim is now only ~18 % of the cancel, which the drag absorbs).
 * Even at `32` it still flung: see {@link BAUMGARTE_MAX}, which caps the trim so a deep
 * overshoot can no longer kick the player off the rope.
 */
export const BAUMGARTE_DIV = 32;
/**
 * **Hard cap on the Baumgarte trim - the actual bounce killer.** The trim is
 * `(dist² − ropeLen²)/BAUMGARTE_DIV`, i.e. **proportional to overshoot with no ceiling**,
 * and that was the engine of the residual hang bounce: a per-tick log of a straight-down
 * hang showed the player fall through the slack zone, catch the rope ~1.8 blocks *past* the
 * sphere, and then - with radial velocity already fully cancelled to **0** - get accelerated
 * by the (huge, uncapped) trim from `0 → +7 → +14` dm/tick *upward* over two ticks, flinging
 * it back **through** the sphere into slack, where it free-fell into the next catch: a stable
 * ±2.5-block vertical limit cycle that never decayed. The velocity-cancel (`−dot`) holds the
 * rope on its own; the trim only needs to undo the slow ~1-gravity-step/tick *sag*, never to
 * yank a deep overshoot back in one go. So clamp it: a small overshoot (drift) is corrected at
 * full strength, but a deep one (the bounce) is limited to a gentle pull that can't out-run the
 * `−dot` cancel and can't punt the player off the rope. `80` (in dist²/scale² units, ≈ a
 * +1.5-2 dm/tick max correction - a touch above the ~1 dm/tick² gravity sag so a hang still
 * slowly recovers to the sphere instead of drooping). **Lower = softer/floppier rope that
 * recovers droop slower; higher = firmer and toward the old fling; very high disables the cap.**
 * Only meaningful while `BAUMGARTE_DIV > 0`.
 */
export const BAUMGARTE_MAX = 80;
/**
 * **Tangential momentum sustain - the #1 feel knob (anti-limp).** Each taut tick the
 * solver re-adds `v_tang / SUSTAIN_DIV` of the player's *tangential* velocity, to undo
 * the engine's own horizontal drag (~9 %/tick) which the add-only impulse model can't
 * otherwise fight. **`SUSTAIN_DIV ≈ 10` exactly cancels engine drag** (perpetual swing);
 * a touch higher decays gently; *below* break-even the swing **gains** energy each tick
 * and runs away / flings you. Playtest correction: `12` read as "very strong and crazy"
 * in-game (still building amplitude), so the real engine-drag break-even sits *above* the
 * ~10 paper estimate. History: `20` (carried but settled fast) → `16` → `13` chasing "more
 * swing", but **`13` ran away**: playtest reported getting "stuck in a feedback loop, spinning
 * around the point and not slowing down" - i.e. below the drag break-even the sustain pumps in
 * more energy per orbit than drag removes, so the orbit self-amplifies into a perpetual spin.
 * The break-even (perpetual orbit) sits around ~14-15, so anything ≤14 runs away. Set to **`18`**:
 * safely on the *decaying* side (you slow down and come out of the swing) while still carrying
 * more momentum than the old `20`. **This is a hard floor on liveliness - you can't get an
 * ever-bigger swing by lowering it further without falling back into the spin-forever loop;
 * amplitude has to come from how you fire + gravity, not the pump.** Lower = livelier but toward
 * runaway; higher = limper; `0` disables it. Radial velocity is excluded, so this never feeds the bounce.
 */
export const SUSTAIN_DIV = 18;
/**
 * **Radial overdamping - DISABLED; it was a rebound generator, not a damper.** The idea was
 * to bleed an *extra* `1/RADIAL_DAMP_DIV` of radial velocity beyond the full `−dot` cancel to
 * settle the hang bounce. But the cancel already drives the *measured* radial velocity to
 * **exactly 0** (an inextensible rope's physical maximum); subtracting a further fraction of
 * that same velocity doesn't damp anything that's left - it *reverses* it, so a player falling
 * in at `−v` leaves at `+v/RADIAL_DAMP_DIV` **upward**. That's literally a coefficient of
 * restitution: a *bouncier* rope. In-game it made the hang **more** springy at every setting
 * (`4`, then `2`), exactly backwards. The real bounce driver was the uncapped Baumgarte trim
 * (see {@link BAUMGARTE_MAX}), not under-damping. Left wired but **`0` (off)**: the full cancel
 * is the correct, rebound-free behaviour, and any value here only adds restitution back. Don't
 * re-enable expecting it to calm a bounce - it does the opposite.
 */
export const RADIAL_DAMP_DIV = 0;
/** Fixed-point multiplier that preserves precision across the integer `/dist²` divide (see POS_PER_BLOCK). */
export const FRAC_SCALE = 1000;

/**
 * **Release fling - the one-shot kick when you let go of the rope.** Minecraft's air drag
 * (~9 %/tick horizontal, and worse vertically) bleeds a swing's speed to near-nothing within
 * a second of release, so letting go at the bottom of a fast arc feels like hitting a wall
 * instead of being *launched*. On `grapple/stop` we add a single impulse **along the player's
 * line of sight** (player_motion's local `forward` axis - you fling *where you're looking*,
 * pitch included, so look up to go up). Momentum is still kept in mind two ways: the launch
 * **adds** to velocity (Minecraft has no set-velocity), so your existing swing momentum carries
 * through untouched *and* the kick's magnitude scales with how fast you were swinging.
 *
 * Magnitude is scaled by swing **speed²** (`v·v`), not speed: an honest `|v|` needs a sqrt the
 * command layer doesn't have, and `v·v` is the same integer dot product the solver already uses
 * (`lengthSquared`). Quadratic is a fine trade here - it just makes fast swings fling
 * *dramatically* harder (the fun) and gentle releases stay gentle - and it's capped so it can't
 * run away. Units: `velocity` is the per-tick position delta in **decimetres** (`pos − prev`),
 * so `v·v` is in dm²; the launch input is `10000 = 1 block/tick`. `RELEASE_KICK` is therefore
 * *launch units per dm² of swing speed²*: at `120`, a ~1 block/tick swing (`|v|` = 10 dm →
 * `v·v` = 100) flings at ~1.2 block/tick. **Lower = gentler let-go; higher = bigger launch;
 * `0` disables the kick** (release just drops the rope). {@link RELEASE_KICK_MAX} caps the
 * result so a very fast swing can't fling absurdly far; the kick is otherwise *not* clamped by
 * `MAX_IMPULSE` (that's the per-tick rope correction, a different thing).
 *
 * Tuning history: `120` (a ~1 block/tick swing → ~1.2 block/tick fling) was "TOO much", halved to
 * `60` ("kick was fine" but then "I want a bigger kick"), so split the difference to **`90`** (that
 * same swing → ~0.9 block/tick). The quadratic means a fast swing still flings noticeably harder;
 * the cap below keeps the top end sane.
 */
export const RELEASE_KICK = 90;
/**
 * Hard cap on the {@link RELEASE_KICK} fling, in launch units (`10000 = 1 block/tick`). The kick
 * scales with swing *speed²*, so without a ceiling a very fast swing would fling absurdly far;
 * this clamps it. `16000` ≈ 1.6 block/tick max launch (between the original `20000` ≈ 2 b/t and the
 * "too much" trim to `12000`). **Lower = a tighter lid on fast releases; higher = lets fast swings fling further.**
 */
export const RELEASE_KICK_MAX = 16000;

/**
 * The anchor is a single `marker` entity summoned at the hit point (see
 * `attach.ts`): a no-hitbox, no-render, no-AI position holder. Its only jobs are
 * to hand its `Pos` to the swing scores once at attach time and to give the rope a
 * target to aim at each tick. `grapple/stop` kills it.
 *
 * **Why not a leashed mob?** A real lead can't be drawn by poking the `leash` NBT
 * of an already-spawned entity - vanilla only broadcasts the rope-render packet
 * when the leash is restored on *entity load*, so a live `data modify` sets the
 * field silently and nothing draws. It would also hard-break past ~10 blocks. The
 * rope is instead a per-tick particle line (see `rope.ts`), which always renders
 * and has no reach cap.
 */
export const ANCHOR_TYPE = EntityType("marker");

/**
 * Flip to `false` to strip all in-game diagnostics. When on: `grapple/start`
 * announces the anchor it found (or that the raycast missed), and `grapple/drive`
 * shows a live action-bar readout (dist²/rope/dot + whether the rope is taut) so
 * you can see, in-game, exactly which stage isn't firing.
 */
export const DEBUG = true;

/**
 * **Kill engine gravity while grappling** (the bounce's energy *source*). The residual
 * hang bounce is gravity shoving the player past the rope every tick and the discrete
 * reactive rope springing them back; with gravity off there is no pump, so the radial
 * channel goes quiet and a hang is dead-still. The trade is an **identity shift**: the
 * swing stops being a gravitational pendulum (fall → arc up the far side) and becomes a
 * **momentum orbit** - a grapple fired *moving* keeps its speed and circles the anchor
 * (the tangential sustain carries it), while a grapple fired *standing still* just hangs
 * where you fired it instead of dropping to plumb. Flip back to `false` to restore the
 * engine-gravity swing (and the bounce) if the orbit feels worse.
 *
 * Implemented as a **removable attribute modifier** (`add_multiplied_total −1` forces the
 * total to exactly 0 regardless of the player's base/other gravity, and removing it
 * restores them exactly) added on attach beside the `grappling` tag and removed in
 * `grapple/stop` - non-destructive, multiplayer-safe. Keyed by {@link GRAVITY_MODIFIER_ID}.
 */
export const ZERO_GRAVITY = false;
/** The stable id the zero-gravity attach modifier is keyed by; `grapple/stop` removes it. */
export const GRAVITY_MODIFIER_ID = Id("grapple:zero_gravity");

/**
 * Flip to `true` to spam **chat** (not the action bar) with a full per-tick state line
 * per grappling player - frame, position, velocity, dist²/rope²/dot. Minecraft writes
 * chat to `logs/latest.log`, so this dumps the whole swing trajectory to a file that can
 * be read back offline to diagnose exactly where a swing misbehaves. Noisy by design
 * (~20 lines/sec while swinging); turn off for normal play.
 */
export const LOG = true;
