/**
 * Shared collision / bump timing constants.
 *
 * All durations are in milliseconds. Tweak these to tune the feel of
 * car-to-car collisions without touching any system code.
 */

/** Minimum impact speed (m/s) for a bump to register at all. */
export const MIN_BUMP_IMPACT_SPEED_MPS = 3;

/** Impact speed (m/s) threshold above which the bumped car receives a stun. */
export const BIG_IMPACT_SPEED_MPS = 20;

/** Server-side drive-recovery lock applied to the rammer (faster car). */
export const BUMP_DRIVE_RECOVERY_MS_RAMMER = 350;

/** Server-side drive-recovery lock applied to the bumped (slower) car. */
export const BUMP_DRIVE_RECOVERY_MS_BUMPED = 2_000;

/** Per-pair cooldown before the same two cars can bump again. */
export const BUMP_PAIR_COOLDOWN_MS = 3_000;

/** Per-player cooldown before the same player can be flipped again. */
export const BUMP_FLIP_COOLDOWN_MS = 3_000;

/** Stun duration applied to the bumped car on big impacts (overrides the manifest default). */
export const COLLISION_STUN_DURATION_MS = 2_500;

/** Client-side drive lock applied when the local car is flipped (short, just masks animation start). */
export const CLIENT_DRIVE_LOCK_FLIPPED_MS = 120;

/** Client-side drive lock applied when the local car is stunned (should match BUMP_DRIVE_RECOVERY_MS_BUMPED). */
export const CLIENT_DRIVE_LOCK_STUNNED_MS = 2_000;

/** Client-side duration for hard-snapping position after a collision event. */
export const CLIENT_HARD_SNAP_MS = 160;
