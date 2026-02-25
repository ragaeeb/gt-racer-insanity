/**
 * Doppler effect calculation for remote car engine sounds.
 *
 * This module provides manual Doppler pitch shifting based on relative velocity
 * between the source (remote car) and listener (local player/camera).
 *
 * Formula: playbackRate = speedOfSound / (speedOfSound + relativeVelocity)
 * - Negative relativeVelocity (approaching) → playbackRate > 1.0 (higher pitch)
 * - Positive relativeVelocity (receding) → playbackRate < 1.0 (lower pitch)
 *
 * The coefficient dampens the effect to prevent motion sickness at high game speeds.
 */

import * as THREE from 'three';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';

/**
 * Calculate the Doppler pitch shift rate based on relative velocity.
 *
 * @param relativeVelocity - Velocity relative to listener (positive = receding, negative = approaching)
 * @param config - The Doppler tuning configuration
 * @returns Playback rate multiplier clamped between config.minRate and config.maxRate
 */
export const calculateDopplerRate = (
    relativeVelocity: number,
    config = DEFAULT_GAMEPLAY_TUNING.audio.doppler,
): number => {
    // Avoid division by zero with small epsilon
    const epsilon = 0.001;

    // Doppler formula: rate = speedOfSound / (speedOfSound + relativeVelocity)
    // When approaching (relativeVelocity < 0): denominator decreases → rate > 1 (higher pitch)
    // When receding (relativeVelocity > 0): denominator increases → rate < 1 (lower pitch)
    const dopplerRate = config.speedOfSound / (config.speedOfSound + relativeVelocity + epsilon);

    // Damp the effect around 1.0 while preserving direction.
    const deviation = dopplerRate - 1;
    const scaledRate = 1 + deviation * config.coefficient;

    // Clamp to prevent audio artifacts
    return Math.max(config.minRate, Math.min(config.maxRate, scaledRate));
};

/**
 * Calculate radial (line-of-sight) velocity between source and listener.
 *
 * @param sourcePosition - Position of the sound source (remote car)
 * @param sourceVelocity - Velocity vector of the source
 * @param listenerPosition - Position of the listener (local player/camera)
 * @param listenerVelocity - Velocity vector of the listener
 * @returns Radial velocity (positive = receding, negative = approaching)
 */
export const calculateRadialVelocity = (
    sourcePosition: THREE.Vector3,
    sourceVelocity: THREE.Vector3,
    listenerPosition: THREE.Vector3,
    listenerVelocity: THREE.Vector3,
): number => {
    // Direction from listener to source
    const toSource = new THREE.Vector3().subVectors(sourcePosition, listenerPosition).normalize();

    // Relative velocity (source - listener)
    const relativeVelocity = new THREE.Vector3().subVectors(sourceVelocity, listenerVelocity);

    // Project relative velocity onto line-of-sight direction
    // Positive = source moving away from listener (receding)
    // Negative = source moving toward listener (approaching)
    return relativeVelocity.dot(toSource);
};
