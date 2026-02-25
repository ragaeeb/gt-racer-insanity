import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { clientConfig } from '@/client/app/config';
import type { InterpolationState, RaceSession } from '@/client/game/hooks/types';
import { useHudStore } from '@/client/game/state/hudStore';
import {
    COLLISION_YAW_CORRECTION_ALPHA,
    computeCorrectionAlpha,
    HARD_SNAP_THRESHOLD_METERS,
    lerpAngle,
    MIN_CORRECTION_THRESHOLD,
    YAW_PER_FRAME_ALPHA,
} from '@/client/game/systems/correctionSystem';
import { sampleInterpolationBuffer } from '@/client/game/systems/interpolationSystem';
import { getStatusEffectManifestById } from '@/shared/game/effects/statusEffectManifest';
import { DEFAULT_TRACK_WIDTH_METERS } from '@/shared/game/track/trackManifest';
import { DriftState } from '@/shared/game/vehicle/driftConfig';
import { PLAYER_COLLIDER_HALF_WIDTH_METERS } from '@/shared/physics/constants';

const LOCAL_TRACK_BOUNDARY_X_METERS = DEFAULT_TRACK_WIDTH_METERS * 0.5 - PLAYER_COLLIDER_HALF_WIDTH_METERS;
const COLLISION_CORRECTION_ALPHA_MIN = 0.35;
const COLLISION_HARD_SNAP_ESCAPE_THRESHOLD_METERS = 6;
const COLLISION_AUTHORITY_WINDOW_MS = 3_500;
const COLLISION_STALL_FRAME_GAP_MS = 150;

export const resolveCollisionAuthorityRecoveryMode = (
    inCollisionAuthorityWindow: boolean,
    positionError: number,
    frameGapMs: number,
): 'hard' | 'none' | 'soft' => {
    if (!inCollisionAuthorityWindow || positionError < MIN_CORRECTION_THRESHOLD) {
        return 'none';
    }

    return frameGapMs > COLLISION_STALL_FRAME_GAP_MS ? 'soft' : 'hard';
};

const interpolate = (from: InterpolationState, to: InterpolationState, alpha: number): InterpolationState => ({
    rotationY: lerpAngle(from.rotationY, to.rotationY, alpha),
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
    z: from.z + (to.z - from.z) * alpha,
});

export const useCarInterpolation = (sessionRef: React.RefObject<RaceSession>) => {
    const wallClampCountRef = useRef(0);
    const previousLocalFlippedRef = useRef(false);
    const lastLocalFlipAppliedAtMsRef = useRef<number | null>(null);
    const lastFrameAtMsRef = useRef<number | null>(null);
    // Dev-only: track previous drift values for change-detection logging
    const prevDriftStateLogRef = useRef(-1);
    const prevDriftTierLogRef = useRef(-1);

    useFrame((_, dt) => {
        const session = sessionRef.current;
        const localCar = session.localCar;
        if (!localCar) {
            return;
        }

        const nowMs = Date.now();
        const previousFrameAtMs = lastFrameAtMsRef.current;
        const frameGapMs = previousFrameAtMs === null ? dt * 1000 : nowMs - previousFrameAtMs;
        lastFrameAtMsRef.current = nowMs;
        const renderTimeMs = nowMs - clientConfig.interpolationDelayMs;
        const localCollisionDriveLockUntilMs = session.localCollisionDriveLockUntilMs;
        if (localCollisionDriveLockUntilMs !== null && nowMs >= localCollisionDriveLockUntilMs) {
            session.localCollisionDriveLockUntilMs = null;
        }
        const localCollisionHardSnapUntilMs = session.localCollisionHardSnapUntilMs;
        if (localCollisionHardSnapUntilMs !== null && nowMs >= localCollisionHardSnapUntilMs) {
            session.localCollisionHardSnapUntilMs = null;
        }
        const shouldForceCollisionSnap =
            localCollisionHardSnapUntilMs !== null && nowMs < localCollisionHardSnapUntilMs;

        const activeEffects = session.latestLocalSnapshot?.activeEffects;
        let movementMultiplier = 1;
        let localIsFlipped = false;
        let localIsStunned = false;
        let localFlipAppliedAtMs: number | null = null;
        if (activeEffects) {
            for (const effect of activeEffects) {
                if (effect.effectType === 'flipped') {
                    localIsFlipped = true;
                    localFlipAppliedAtMs = effect.appliedAtMs;
                }
                if (effect.effectType === 'stunned') {
                    localIsStunned = true;
                }
                const manifest = getStatusEffectManifestById(effect.effectType);
                if (manifest) {
                    movementMultiplier *= manifest.movementMultiplier;
                }
            }
        }
        if (localIsFlipped && !previousLocalFlippedRef.current) {
            session.lastCollisionSnapshotFlipSeenAtMs = nowMs;
        }
        previousLocalFlippedRef.current = localIsFlipped;

        localCar.setMovementMultiplier(movementMultiplier);
        if (localFlipAppliedAtMs !== null && localFlipAppliedAtMs !== lastLocalFlipAppliedAtMsRef.current) {
            const startedFlip = localCar.triggerFlip();
            if (startedFlip) {
                session.lastCollisionFlipStartedAtMs = nowMs;
            }
            lastLocalFlipAppliedAtMsRef.current = localFlipAppliedAtMs;
        } else if (localFlipAppliedAtMs === null) {
            lastLocalFlipAppliedAtMsRef.current = null;
        }

        localCar.update(dt);

        const localSnapshot = session.latestLocalSnapshot;
        if (localSnapshot) {
            localCar.syncAuthoritativeSpeed(localSnapshot.speed);

            // Sync drift visual state from authoritative server snapshot.
            if (localSnapshot.driftState !== undefined) {
                localCar.driftState = localSnapshot.driftState;
                localCar.driftAngle = localSnapshot.driftAngle ?? 0;
                localCar.driftBoostTier = localSnapshot.driftBoostTier ?? 0;
                useHudStore.getState().setDriftBoostTier(localCar.driftBoostTier);

                if (import.meta.env.DEV) {
                    if (localCar.driftState !== prevDriftStateLogRef.current) {
                        const stateNames = Object.fromEntries(
                            Object.entries(DriftState).map(([k, v]) => [v, k]),
                        ) as Record<number, string>;
                        console.debug('[drift] state →', stateNames[localCar.driftState] ?? localCar.driftState, {
                            angle: localCar.driftAngle.toFixed(3),
                            tier: localCar.driftBoostTier,
                        });
                        prevDriftStateLogRef.current = localCar.driftState;
                    }
                    if (localCar.driftBoostTier !== prevDriftTierLogRef.current) {
                        console.debug('[drift] tier →', localCar.driftBoostTier, {
                            driftState: localCar.driftState,
                            prev: prevDriftTierLogRef.current,
                        });
                        prevDriftTierLogRef.current = localCar.driftBoostTier;
                    }
                }
            }

            const snapshotSeq = session.latestLocalSnapshotSeq;
            const isNewSnapshot = snapshotSeq !== null && snapshotSeq !== session.lastReconciledSnapshotSeq;
            if (isNewSnapshot) {
                session.lastReconciledSnapshotSeq = snapshotSeq;
            }

            const positionError = Math.hypot(
                localCar.position.x - localSnapshot.x,
                localCar.position.z - localSnapshot.z,
            );
            const yawError = Math.abs(
                Math.atan2(
                    Math.sin(localSnapshot.rotationY - localCar.rotationY),
                    Math.cos(localSnapshot.rotationY - localCar.rotationY),
                ),
            );
            const inCollisionAuthorityWindow =
                session.lastCollisionEventAtMs !== null &&
                nowMs - session.lastCollisionEventAtMs <= COLLISION_AUTHORITY_WINDOW_MS &&
                (localIsFlipped || localIsStunned);

            let mode: 'hard' | 'none' | 'soft' = 'none';
            let appliedDelta = 0;

            const collisionAuthorityMode = resolveCollisionAuthorityRecoveryMode(
                inCollisionAuthorityWindow,
                positionError,
                frameGapMs,
            );

            if (collisionAuthorityMode === 'soft') {
                // If rendering stalled around collision, avoid a large one-frame teleport on recovery.
                // Pull back toward authority aggressively but preserve a visible transition.
                const alpha = Math.max(computeCorrectionAlpha(positionError), COLLISION_CORRECTION_ALPHA_MIN);
                const prevX = localCar.position.x;
                const prevZ = localCar.position.z;
                localCar.position.x += (localSnapshot.x - localCar.position.x) * alpha;
                localCar.position.z += (localSnapshot.z - localCar.position.z) * alpha;
                localCar.position.y = localSnapshot.y;
                localCar.mesh.position.copy(localCar.position);
                mode = 'soft';
                appliedDelta = Math.hypot(localCar.position.x - prevX, localCar.position.z - prevZ);
            } else if (collisionAuthorityMode === 'hard') {
                // Keep the local victim fully authoritative during the visible flip window.
                localCar.position.set(localSnapshot.x, localSnapshot.y, localSnapshot.z);
                localCar.rotationY = localSnapshot.rotationY;
                localCar.mesh.position.copy(localCar.position);
                localCar.mesh.rotation.y = localCar.rotationY;
                mode = 'hard';
                appliedDelta = positionError;
            } else if (shouldForceCollisionSnap && positionError >= COLLISION_HARD_SNAP_ESCAPE_THRESHOLD_METERS) {
                localCar.position.set(localSnapshot.x, localSnapshot.y, localSnapshot.z);
                localCar.rotationY = localSnapshot.rotationY;
                localCar.mesh.position.copy(localCar.position);
                localCar.mesh.rotation.y = localCar.rotationY;
                mode = 'hard';
                appliedDelta = positionError;
            } else if (shouldForceCollisionSnap && positionError >= MIN_CORRECTION_THRESHOLD) {
                const alpha = Math.max(computeCorrectionAlpha(positionError), COLLISION_CORRECTION_ALPHA_MIN);
                const prevX = localCar.position.x;
                const prevZ = localCar.position.z;
                localCar.position.x += (localSnapshot.x - localCar.position.x) * alpha;
                localCar.position.z += (localSnapshot.z - localCar.position.z) * alpha;
                localCar.position.y = localSnapshot.y;
                localCar.mesh.position.copy(localCar.position);
                mode = 'soft';
                appliedDelta = Math.hypot(localCar.position.x - prevX, localCar.position.z - prevZ);
            } else if (positionError >= HARD_SNAP_THRESHOLD_METERS) {
                localCar.position.set(localSnapshot.x, localSnapshot.y, localSnapshot.z);
                localCar.rotationY = localSnapshot.rotationY;
                localCar.mesh.position.copy(localCar.position);
                localCar.mesh.rotation.y = localCar.rotationY;
                mode = 'hard';
                appliedDelta = positionError;
            } else if (positionError >= MIN_CORRECTION_THRESHOLD) {
                const alpha = computeCorrectionAlpha(positionError);
                const prevX = localCar.position.x;
                const prevZ = localCar.position.z;
                localCar.position.x += (localSnapshot.x - localCar.position.x) * alpha;
                localCar.position.z += (localSnapshot.z - localCar.position.z) * alpha;
                localCar.position.y = localSnapshot.y;
                localCar.mesh.position.copy(localCar.position);
                mode = 'soft';
                appliedDelta = Math.hypot(localCar.position.x - prevX, localCar.position.z - prevZ);
            }

            if (yawError >= clientConfig.reconciliationYawThresholdRadians) {
                const yawAlpha = shouldForceCollisionSnap ? COLLISION_YAW_CORRECTION_ALPHA : YAW_PER_FRAME_ALPHA;
                localCar.rotationY = lerpAngle(localCar.rotationY, localSnapshot.rotationY, yawAlpha);
                localCar.mesh.rotation.y = localCar.rotationY;
            }

            if (isNewSnapshot) {
                const inputLead = Math.max(
                    0,
                    session.localInputSequence - Math.max(localSnapshot.lastProcessedInputSeq, 0),
                );

                session.lastCorrection = {
                    appliedPositionDelta: appliedDelta,
                    inputLead,
                    mode,
                    positionError,
                    sequence: snapshotSeq!,
                    yawError,
                };
            }

            useHudStore.getState().setSpeedKph(Math.max(0, localSnapshot.speed * 3.6));
        } else {
            useHudStore.getState().setSpeedKph(Math.max(0, localCar.getSpeed() * 3.6));
        }

        if (session.isRunning) {
            const clampedX = THREE.MathUtils.clamp(
                localCar.position.x,
                -LOCAL_TRACK_BOUNDARY_X_METERS,
                LOCAL_TRACK_BOUNDARY_X_METERS,
            );
            if (Math.abs(clampedX - localCar.position.x) > 0.0001) {
                localCar.position.x = clampedX;
                localCar.mesh.position.x = clampedX;
                wallClampCountRef.current += 1;
            }
        }

        for (const [playerId, opponentCar] of session.opponents) {
            const interpolationBuffer = session.opponentInterpolationBuffers.get(playerId);
            if (!interpolationBuffer) {
                continue;
            }

            const interpolatedState = sampleInterpolationBuffer(interpolationBuffer, renderTimeMs, interpolate);

            if (!interpolatedState) {
                continue;
            }

            opponentCar.targetPosition.set(interpolatedState.x, interpolatedState.y, interpolatedState.z);
            opponentCar.targetRotationY = interpolatedState.rotationY;
        }

        for (const [, opponentCar] of session.opponents) {
            // Get listener (local player) position and calculate approximate velocity
            const listenerPosition = localCar.mesh.position.clone();
            const localSpeed = localCar.getSpeed();
            // Approximate local car velocity direction from its rotation
            const listenerVelocity = new THREE.Vector3(
                Math.sin(localCar.rotationY) * localSpeed,
                0,
                Math.cos(localCar.rotationY) * localSpeed,
            );
            opponentCar.update(dt, listenerPosition, listenerVelocity);
        }
    });

    return wallClampCountRef;
};
