import type { SimPlayerState } from '@/server/sim/types';
import type { DriftConfig } from '@/shared/game/vehicle/driftConfig';
import { DriftState } from '@/shared/game/vehicle/driftConfig';

export type DriftUpdateResult = {
    /** Lateral friction multiplier for this tick (state-dependent) */
    lateralFrictionMultiplier: number;
    /** m/s boost impulse to apply this tick, 0 if no boost */
    boostImpulse: number;
};

/**
 * Updates the drift state machine for a single player. Reads player.inputState
 * and player.motion.speed, mutates player.driftContext, and returns the lateral
 * friction multiplier and any boost impulse to apply this tick.
 *
 * State transitions:
 *   GRIPPING ──(handbrake + speed + steer)──> INITIATING
 *   INITIATING ──(held for initiatingToDriftingTimeMs)──> DRIFTING
 *   INITIATING ──(released or speed drops)──> GRIPPING
 *   DRIFTING ──(handbrake released or steer neutral)──> RECOVERING
 *   DRIFTING ──(speed < threshold * 0.5)──> GRIPPING (no boost)
 *   RECOVERING ──(after recoveringDurationMs)──> GRIPPING (boost applied)
 */
export const updateDriftState = (player: SimPlayerState, nowMs: number, config: DriftConfig): DriftUpdateResult => {
    const ctx = player.driftContext;
    const input = player.inputState;
    const speed = Math.abs(player.motion.speed);
    const steer = Math.abs(input.steering);
    const timeInState = nowMs - ctx.stateEnteredAtMs;

    let boostImpulse = 0;

    switch (ctx.state) {
        case DriftState.GRIPPING: {
            // Entry condition: handbrake pressed + speed above threshold + steering above threshold
            if (
                input.handbrake &&
                speed >= config.initiationSpeedThreshold &&
                steer >= config.initiationSteerThreshold
            ) {
                ctx.state = DriftState.INITIATING;
                ctx.stateEnteredAtMs = nowMs;
                ctx.driftStartedAtMs = nowMs;
                ctx.accumulatedDriftTimeMs = 0;
                ctx.boostTier = 0;
                ctx.driftAngle = 0;
            }
            break;
        }

        case DriftState.INITIATING: {
            // Bail to GRIPPING if conditions no longer met
            if (!input.handbrake || speed < config.initiationSpeedThreshold * 0.8) {
                ctx.state = DriftState.GRIPPING;
                ctx.stateEnteredAtMs = nowMs;
                ctx.boostTier = 0;
                break;
            }

            // Safety timeout: don't remain in INITIATING forever if tuning requests a fallback.
            if (timeInState >= config.initiatingToGrippingTimeMs) {
                ctx.state = DriftState.GRIPPING;
                ctx.stateEnteredAtMs = nowMs;
                ctx.boostTier = 0;
                break;
            }

            // Transition to DRIFTING after hold time
            if (timeInState >= config.initiatingToDriftingTimeMs) {
                ctx.state = DriftState.DRIFTING;
                ctx.stateEnteredAtMs = nowMs;
                // Seed lastDriftTickMs so the first DRIFTING tick computes dtMs = 0
                ctx.lastDriftTickMs = nowMs;
            }
            break;
        }

        case DriftState.DRIFTING: {
            // Accumulate drift time using lastDriftTickMs, which tracks the previous tick
            // timestamp separately from stateEnteredAtMs (the immutable state-entry time).
            // This prevents stateEnteredAtMs from being overwritten each tick, preserving
            // its meaning for any future time-in-state queries.
            const dtMs = nowMs - ctx.lastDriftTickMs;
            ctx.accumulatedDriftTimeMs += dtMs;
            ctx.lastDriftTickMs = nowMs;

            // Update drift angle (simplified: proportional to steering input)
            ctx.driftAngle = input.steering * 0.5;

            // Determine boost tier based on accumulated drift time
            if (ctx.accumulatedDriftTimeMs >= config.boostTier3TimeMs) {
                ctx.boostTier = 3;
            } else if (ctx.accumulatedDriftTimeMs >= config.boostTier2TimeMs) {
                ctx.boostTier = 2;
            } else if (ctx.accumulatedDriftTimeMs >= config.boostTier1TimeMs) {
                ctx.boostTier = 1;
            }

            // Bail to GRIPPING if speed drops too low (no boost — penalty for losing momentum)
            if (speed < config.initiationSpeedThreshold * 0.5) {
                ctx.state = DriftState.GRIPPING;
                ctx.stateEnteredAtMs = nowMs;
                ctx.boostTier = 0;
                ctx.driftAngle = 0;
                break;
            }

            // Exit to RECOVERING: handbrake released or steer goes neutral
            if (!input.handbrake || steer < 0.1) {
                ctx.state = DriftState.RECOVERING;
                ctx.stateEnteredAtMs = nowMs;
            }
            break;
        }

        case DriftState.RECOVERING: {
            // Apply boost impulse once (consume the tier)
            if (ctx.boostTier > 0) {
                boostImpulse =
                    ctx.boostTier === 3
                        ? config.boostTier3Magnitude
                        : ctx.boostTier === 2
                          ? config.boostTier2Magnitude
                          : config.boostTier1Magnitude;
                ctx.boostTier = 0;
            }

            // Return to GRIPPING after recovery duration
            if (timeInState >= config.recoveringDurationMs) {
                ctx.state = DriftState.GRIPPING;
                ctx.stateEnteredAtMs = nowMs;
                ctx.driftAngle = 0;
            }
            break;
        }
    }

    // Determine lateral friction for the current state AFTER transitions
    const lateralFrictionMultiplier =
        ctx.state === DriftState.DRIFTING
            ? config.driftingLateralFriction
            : ctx.state === DriftState.INITIATING
              ? config.initiatingLateralFriction
              : ctx.state === DriftState.RECOVERING
                ? config.recoveringLateralFriction
                : config.grippingLateralFriction;

    return {
        lateralFrictionMultiplier,
        boostImpulse,
    };
};
