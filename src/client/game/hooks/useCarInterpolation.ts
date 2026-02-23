import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clientConfig } from '@/client/app/config';
import type { InterpolationState, RaceSession } from '@/client/game/hooks/types';
import { sampleInterpolationBuffer } from '@/client/game/systems/interpolationSystem';
import { useHudStore } from '@/client/game/state/hudStore';

const TRACK_WIDTH_METERS = 76;
const PLAYER_COLLIDER_HALF_WIDTH_METERS = 1.1;
const LOCAL_TRACK_BOUNDARY_X_METERS = TRACK_WIDTH_METERS * 0.5 - PLAYER_COLLIDER_HALF_WIDTH_METERS;

const lerpAngle = (from: number, to: number, alpha: number) => {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * alpha;
};

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

        const localInterpolatedState = sampleInterpolationBuffer(
            session.localInterpolationBuffer,
            renderTimeMs,
            interpolate,
        );
        if (localInterpolatedState) {
            localCar.targetPosition.set(localInterpolatedState.x, localInterpolatedState.y, localInterpolatedState.z);
            localCar.targetRotationY = localInterpolatedState.rotationY;
        } else if (session.latestLocalSnapshot) {
            localCar.targetPosition.set(
                session.latestLocalSnapshot.x,
                session.latestLocalSnapshot.y,
                session.latestLocalSnapshot.z,
            );
            localCar.targetRotationY = session.latestLocalSnapshot.rotationY;
        }
        localCar.update(dt);

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

        session.opponents.forEach((opponentCar) => opponentCar.update(dt));

        const localSnapshot = session.latestLocalSnapshot;
        if (localSnapshot) {
            const snapshotSeq = session.latestLocalSnapshotSeq;
            if (snapshotSeq !== null && snapshotSeq !== session.lastReconciledSnapshotSeq) {
                session.lastReconciledSnapshotSeq = snapshotSeq;
                const inputLead = Math.max(
                    0,
                    session.localInputSequence - Math.max(localSnapshot.lastProcessedInputSeq, 0),
                );
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
                session.lastCorrection = {
                    appliedPositionDelta: 0,
                    inputLead,
                    mode: 'none',
                    positionError,
                    sequence: snapshotSeq,
                    yawError,
                };
            }
            useHudStore.getState().setSpeedKph(Math.max(0, localSnapshot.speed * 3.6));
        } else {
            useHudStore
                .getState()
                .setSpeedKph(Math.max(0, localCar.position.distanceTo(localCar.targetPosition) * 36));
        }
    });

    return wallClampCountRef;
};
