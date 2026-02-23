import { useFrame } from '@react-three/fiber';
import type { RaceSession } from '@/client/game/hooks/types';
import { resolveSteeringInput, resolveThrottleInput } from '@/client/game/systems/inputFrameControls';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import { getVehicleClassManifestById } from '@/shared/game/vehicle/vehicleClassManifest';
import { PROTOCOL_V2 } from '@/shared/network/protocolVersion';

const NETWORK_TICK_RATE_SECONDS = 1 / 20;

export const useInputEmitter = (sessionRef: React.RefObject<RaceSession>) => {
    useFrame((_, dt) => {
        const session = sessionRef.current;
        if (!session.isRunning || !session.networkManager) {
            return;
        }

        session.networkUpdateTimer += dt;
        if (session.networkUpdateTimer < NETWORK_TICK_RATE_SECONDS) {
            return;
        }

        const { inputManager, latestLocalSnapshot } = session;
        const nowMs = Date.now();

        const isUpPressed = inputManager.isKeyPressed('KeyW') || inputManager.isKeyPressed('ArrowUp');
        const isDownPressed = inputManager.isKeyPressed('KeyS') || inputManager.isKeyPressed('ArrowDown');
        const isLeftPressed = inputManager.isKeyPressed('KeyA') || inputManager.isKeyPressed('ArrowLeft');
        const isRightPressed = inputManager.isKeyPressed('KeyD') || inputManager.isKeyPressed('ArrowRight');
        const isPrecisionOverrideActive = inputManager.isPrecisionOverrideActive();

        const currentSpeed = latestLocalSnapshot?.speed ?? 0;
        const maxForwardSpeed = getVehicleClassManifestById(latestLocalSnapshot?.vehicleId ?? 'sport').physics
            .maxForwardSpeed;

        const throttleInput = resolveThrottleInput({
            cruiseControlEnabled: inputManager.isCruiseControlEnabled(),
            currentSpeed,
            isDownPressed,
            isPrecisionOverrideActive,
            isUpPressed,
            maxForwardSpeed,
            previousCruiseLatchActive: session.cruiseLatchActive,
        });
        session.cruiseLatchActive = throttleInput.cruiseLatchActive;

        session.localInputSequence += 1;
        session.networkManager.emitInputFrame({
            ackSnapshotSeq: useRuntimeStore.getState().lastAckedSnapshotSeq,
            controls: {
                boost: inputManager.isKeyPressed('Space'),
                brake: false,
                handbrake: isPrecisionOverrideActive,
                steering: resolveSteeringInput({
                    isLeftPressed,
                    isRightPressed,
                }),
                throttle: throttleInput.throttle,
            },
            cruiseControlEnabled: inputManager.isCruiseControlEnabled(),
            precisionOverrideActive: isPrecisionOverrideActive,
            protocolVersion: PROTOCOL_V2,
            seq: session.localInputSequence,
            timestampMs: nowMs,
        });
        session.networkUpdateTimer = 0;
    });
};
