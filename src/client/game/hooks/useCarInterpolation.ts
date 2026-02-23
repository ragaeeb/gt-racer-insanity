import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clientConfig } from '@/client/app/config';
import type { InterpolationState, RaceSession } from '@/client/game/hooks/types';
import {
    HARD_SNAP_THRESHOLD_METERS,
    MIN_CORRECTION_THRESHOLD,
    YAW_PER_FRAME_ALPHA,
    computeCorrectionAlpha,
    lerpAngle,
} from '@/client/game/systems/correctionSystem';
import { sampleInterpolationBuffer } from '@/client/game/systems/interpolationSystem';
import { useHudStore } from '@/client/game/state/hudStore';
import { getStatusEffectManifestById } from '@/shared/game/effects/statusEffectManifest';
import { DEFAULT_TRACK_WIDTH_METERS } from '@/shared/game/track/trackManifest';

const PLAYER_COLLIDER_HALF_WIDTH_METERS = 1.1;
const LOCAL_TRACK_BOUNDARY_X_METERS = DEFAULT_TRACK_WIDTH_METERS * 0.5 - PLAYER_COLLIDER_HALF_WIDTH_METERS;

const interpolate = (from: InterpolationState, to: InterpolationState, alpha: number): InterpolationState => ({
    rotationY: lerpAngle(from.rotationY, to.rotationY, alpha),
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
    z: from.z + (to.z - from.z) * alpha,
});

export const useCarInterpolation = (sessionRef: React.RefObject<RaceSession>) => {
    const wallClampCountRef = useRef(0);

    useFrame((_, dt) => {
        const session = sessionRef.current;
        const localCar = session.localCar;
        if (!localCar) {
            return;
        }

        const nowMs = Date.now();
        const renderTimeMs = nowMs - clientConfig.interpolationDelayMs;

        const activeEffects = session.latestLocalSnapshot?.activeEffects;
        let movementMultiplier = 1;
        if (activeEffects) {
            for (const effect of activeEffects) {
                const manifest = getStatusEffectManifestById(effect.effectType);
                if (manifest) {
                    movementMultiplier *= manifest.movementMultiplier;
                }
            }
        }
        localCar.setMovementMultiplier(movementMultiplier);

        localCar.update(dt);

        localCar.position.x = THREE.MathUtils.clamp(localCar.position.x, -LOCAL_TRACK_BOUNDARY_X_METERS, LOCAL_TRACK_BOUNDARY_X_METERS);
        localCar.mesh.position.x = localCar.position.x;

        const localSnapshot = session.latestLocalSnapshot;
        if (localSnapshot) {
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

            let mode: 'hard' | 'none' | 'soft' = 'none';
            let appliedDelta = 0;

            if (positionError >= HARD_SNAP_THRESHOLD_METERS) {
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
                localCar.rotationY = lerpAngle(localCar.rotationY, localSnapshot.rotationY, YAW_PER_FRAME_ALPHA);
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
            useHudStore
                .getState()
                .setSpeedKph(Math.max(0, localCar.getSpeed() * 3.6));
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

            const interpolatedState = sampleInterpolationBuffer(
                interpolationBuffer,
                renderTimeMs,
                interpolate,
            );

            if (!interpolatedState) {
                continue;
            }

            opponentCar.targetPosition.set(interpolatedState.x, interpolatedState.y, interpolatedState.z);
            opponentCar.targetRotationY = interpolatedState.rotationY;
        }

        for (const [, opponentCar] of session.opponents) {
            opponentCar.update(dt);
        }
    });

    return wallClampCountRef;
};
