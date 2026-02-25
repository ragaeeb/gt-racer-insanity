import { useControls } from 'leva';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { useAbilityEmitter } from '@/client/game/hooks/useAbilityEmitter';
import { useAudioListener } from '@/client/game/hooks/useAudioListener';
import { useCameraFollow } from '@/client/game/hooks/useCameraFollow';
import { useCarAssets } from '@/client/game/hooks/useCarAssets';
import { useCarInterpolation } from '@/client/game/hooks/useCarInterpolation';
import { useDiagnostics } from '@/client/game/hooks/useDiagnostics';
import { useInputEmitter } from '@/client/game/hooks/useInputEmitter';
import { useNetworkConnection } from '@/client/game/hooks/useNetworkConnection';
import { useRaceSession } from '@/client/game/hooks/useRaceSession';
import { SceneEnvironment } from '@/client/game/scene/environment/SceneEnvironment';
import { getSceneEnvironmentProfile } from '@/client/game/scene/environment/sceneEnvironmentProfiles';
import { HomingProjectiles } from '@/client/game/scene/HomingProjectiles';
import { OilSlickDeployables } from '@/client/game/scene/OilSlickDeployables';
import { SpikeShotProjectiles } from '@/client/game/scene/SpikeShotProjectiles';
import { InputManager } from '@/client/game/systems/InputManager';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import type { ConnectionStatus, RaceState } from '@/shared/network/types';

type RaceWorldProps = {
    cruiseControlEnabled: boolean;
    onConnectionStatusChange: (status: ConnectionStatus) => void;
    onGameOverChange: (isGameOver: boolean) => void;
    onRaceStateChange: (state: RaceState | null) => void;
    playerName: string;
    resetNonce: number;
    roomId: string;
    selectedColorId: string;
    selectedVehicleId: VehicleClassId;
};

export const RaceWorld = ({
    cruiseControlEnabled,
    onConnectionStatusChange,
    onGameOverChange,
    onRaceStateChange,
    playerName,
    resetNonce,
    roomId,
    selectedColorId,
    selectedVehicleId,
}: RaceWorldProps) => {
    const dirLightRef = useRef<THREE.DirectionalLight>(null);
    const inputManagerRef = useRef<InputManager | null>(null);
    if (!inputManagerRef.current) {
        inputManagerRef.current = new InputManager();
    }
    const inputManager = inputManagerRef.current;

    useEffect(() => {
        inputManager.setCruiseControlEnabled(cruiseControlEnabled);
    }, [cruiseControlEnabled, inputManager]);
    useEffect(() => () => inputManager.dispose(), [inputManager]);

    const carAssetsBundle = useCarAssets();
    const audioListenerRef = useAudioListener();
    const sessionRef = useRaceSession(inputManager);

    const sceneEnvironmentId = useNetworkConnection({
        audioListenerRef,
        carAssetsBundle,
        onConnectionStatusChange,
        onGameOverChange,
        onRaceStateChange,
        playerName,
        resetNonce,
        roomId,
        selectedColorId,
        selectedVehicleId,
        sessionRef,
    });

    const activeSceneEnvironment = getSceneEnvironmentProfile(sceneEnvironmentId);

    // Hook order matters: interpolation updates car state -> input emits -> ability emits -> camera follows -> diagnostics captures
    const wallClampCountRef = useCarInterpolation(sessionRef);
    useInputEmitter(sessionRef);
    useAbilityEmitter(sessionRef);
    const cameraMetricsRef = useCameraFollow(sessionRef, activeSceneEnvironment, dirLightRef);
    useDiagnostics(sessionRef, cameraMetricsRef, wallClampCountRef);

    // TODO: Wire these to server config (requires server RPC or config sync)
    // For now, they're display-only for manual tuning reference.
    // Hook must be called unconditionally to satisfy React rules-of-hooks.
    useControls(
        'Drift Tuning',
        import.meta.env.DEV
            ? {
                  initiationSpeed: { value: 10, min: 6, max: 15, step: 0.5 },
                  initiationSteer: { value: 0.7, min: 0.3, max: 0.9, step: 0.05 },
                  driftingFriction: { value: 0.15, min: 0.05, max: 0.35, step: 0.05 },
                  boostTier1Time: { value: 1000, min: 500, max: 1500, step: 100 },
                  boostTier3Magnitude: { value: 14, min: 10, max: 25, step: 1 },
              }
            : {},
    );

    return (
        <>
            <SceneEnvironment profileId={sceneEnvironmentId} sunLightRef={dirLightRef} />
            <OilSlickDeployables />
            <SpikeShotProjectiles />
            <HomingProjectiles />
        </>
    );
};
