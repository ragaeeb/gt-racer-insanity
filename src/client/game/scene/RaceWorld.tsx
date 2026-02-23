import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { InputManager } from '@/client/game/systems/InputManager';
import { useAudioListener } from '@/client/game/hooks/useAudioListener';
import { useCameraFollow } from '@/client/game/hooks/useCameraFollow';
import { useCarAssets } from '@/client/game/hooks/useCarAssets';
import { useCarInterpolation } from '@/client/game/hooks/useCarInterpolation';
import { useDiagnostics } from '@/client/game/hooks/useDiagnostics';
import { useInputEmitter } from '@/client/game/hooks/useInputEmitter';
import { useNetworkConnection } from '@/client/game/hooks/useNetworkConnection';
import { useRaceSession } from '@/client/game/hooks/useRaceSession';
import type { RaceWorldCallbacks } from '@/client/game/hooks/types';
import { SceneEnvironment } from '@/client/game/scene/environment/SceneEnvironment';
import { getSceneEnvironmentProfile } from '@/client/game/scene/environment/sceneEnvironmentProfiles';
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

    const inputManager = useMemo(() => new InputManager(), []);
    useEffect(() => {
        inputManager.setCruiseControlEnabled(cruiseControlEnabled);
    }, [cruiseControlEnabled, inputManager]);
    useEffect(() => () => inputManager.dispose(), [inputManager]);

    const carAssetsBundle = useCarAssets();
    const audioListenerRef = useAudioListener();
    const sessionRef = useRaceSession(inputManager);

    const callbacks = useMemo<RaceWorldCallbacks>(
        () => ({
            onConnectionStatusChange,
            onGameOverChange,
            onRaceStateChange,
        }),
        [onConnectionStatusChange, onGameOverChange, onRaceStateChange],
    );

    const sceneEnvironmentId = useNetworkConnection({
        audioListenerRef,
        carAssetsBundle,
        callbacks,
        playerName,
        resetNonce,
        roomId,
        selectedColorId,
        selectedVehicleId,
        sessionRef,
    });

    const activeSceneEnvironment = useMemo(
        () => getSceneEnvironmentProfile(sceneEnvironmentId),
        [sceneEnvironmentId],
    );

    const wallClampCountRef = useCarInterpolation(sessionRef);
    useInputEmitter(sessionRef);
    const cameraMetricsRef = useCameraFollow(sessionRef, activeSceneEnvironment, dirLightRef);
    useDiagnostics(sessionRef, cameraMetricsRef, wallClampCountRef);

    return (
        <>
            <SceneEnvironment profileId={sceneEnvironmentId} sunLightRef={dirLightRef} />
        </>
    );
};
