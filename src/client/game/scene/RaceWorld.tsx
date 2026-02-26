import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import type { RaceSession } from '@/client/game/hooks/types';
import { useAbilityEmitter } from '@/client/game/hooks/useAbilityEmitter';
import { useAudioListener } from '@/client/game/hooks/useAudioListener';
import { useCameraFollow } from '@/client/game/hooks/useCameraFollow';
import { useCarAssets } from '@/client/game/hooks/useCarAssets';
import { useCarInterpolation } from '@/client/game/hooks/useCarInterpolation';
import { useDiagnostics } from '@/client/game/hooks/useDiagnostics';
import { useInputEmitter } from '@/client/game/hooks/useInputEmitter';
import { useNetworkConnection } from '@/client/game/hooks/useNetworkConnection';
import { useRaceSession } from '@/client/game/hooks/useRaceSession';
import { ErrorBoundary } from '@/client/game/scene/ErrorBoundary';
import { SceneEnvironment } from '@/client/game/scene/environment/SceneEnvironment';
import { getSceneEnvironmentProfile } from '@/client/game/scene/environment/sceneEnvironmentProfiles';
import { HomingProjectiles } from '@/client/game/scene/HomingProjectiles';
import { OilSlickDeployables } from '@/client/game/scene/OilSlickDeployables';
import { CameraShake, registerCameraShakeTrigger } from '@/client/game/systems/cameraShake';
import { InputManager } from '@/client/game/systems/InputManager';
import { ParticlePool, setGlobalParticlePool } from '@/client/game/systems/ParticlePool';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import type { ConnectionStatus, RaceState } from '@/shared/network/types';

/**
 * Wire a particle pool to any cars in the session that haven't been wired yet.
 * Uses a WeakSet as a guard to avoid redundant setParticlePool calls every frame.
 */
const wireParticlePoolToCars = (
    pool: ParticlePool,
    session: RaceSession | undefined,
    wiredCars: WeakSet<object>,
): void => {
    const localCar = session?.localCar;
    if (localCar && !wiredCars.has(localCar)) {
        localCar.setParticlePool(pool);
        wiredCars.add(localCar);
    }
    if (session?.opponents) {
        for (const [, opponentCar] of session.opponents) {
            if (!wiredCars.has(opponentCar)) {
                opponentCar.setParticlePool(pool);
                wiredCars.add(opponentCar);
            }
        }
    }
};

export const resolveParticlePoolCapacity = (hardwareConcurrency: number | undefined): number => {
    const safeConcurrency =
        typeof hardwareConcurrency === 'number' && Number.isFinite(hardwareConcurrency) ? hardwareConcurrency : 8;
    return safeConcurrency < 4 ? 200 : 512;
};

type RaceWorldProps = {
    cruiseControlEnabled: boolean;
    onConnectionStatusChange: (status: ConnectionStatus) => void;
    onGameOverChange: (isGameOver: boolean) => void;
    onRaceStateChange: (state: RaceState | null) => void;
    playerName: string;
    resetNonce: number;
    roomId: string;
    selectedColorId: string;
    selectedTrackId: string;
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
    selectedTrackId,
    selectedVehicleId,
}: RaceWorldProps) => {
    const { camera, scene } = useThree();
    const dirLightRef = useRef<THREE.DirectionalLight>(null);
    const inputManagerRef = useRef<InputManager | null>(null);
    const cameraShakeRef = useRef<CameraShake | null>(null);
    const particlePoolRef = useRef<ParticlePool | null>(null);
    const wiredCarsRef = useRef<WeakSet<object>>(new WeakSet<object>());

    if (!inputManagerRef.current) {
        inputManagerRef.current = new InputManager();
    }
    const inputManager = inputManagerRef.current;

    useEffect(() => {
        inputManager.setCruiseControlEnabled(cruiseControlEnabled);
    }, [cruiseControlEnabled, inputManager]);
    useEffect(() => () => inputManager.dispose(), [inputManager]);
    useEffect(() => {
        const cameraShake = new CameraShake(camera);
        cameraShakeRef.current = cameraShake;
        registerCameraShakeTrigger((intensity) => {
            cameraShake.trigger(intensity);
        });

        const hardwareConcurrency = typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
        const maxParticles = resolveParticlePoolCapacity(hardwareConcurrency);

        // Initialize particle pool (reduced capacity on low-end devices).
        const particlePool = new ParticlePool(scene, maxParticles);
        particlePoolRef.current = particlePool;
        setGlobalParticlePool(particlePool);

        return () => {
            cameraShake.reset();
            if (cameraShakeRef.current === cameraShake) {
                cameraShakeRef.current = null;
            }
            registerCameraShakeTrigger(null);
            particlePool.dispose();
            if (particlePoolRef.current === particlePool) {
                particlePoolRef.current = null;
            }
            setGlobalParticlePool(null);
            // Reset wired-cars tracking so the next pool creation rewires everything.
            wiredCarsRef.current = new WeakSet<object>();
        };
    }, [camera, scene]);

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
        selectedTrackId,
        selectedVehicleId,
        sessionRef,
    });

    const activeSceneEnvironment = getSceneEnvironmentProfile(sceneEnvironmentId);

    // Hook order matters: interpolation updates car state -> input emits -> ability emits -> camera follows -> shake -> diagnostics
    const wallClampCountRef = useCarInterpolation(sessionRef);
    useInputEmitter(sessionRef);
    useAbilityEmitter(sessionRef);
    const cameraMetricsRef = useCameraFollow(sessionRef, activeSceneEnvironment, dirLightRef);
    useFrame((_, dt) => {
        const cameraShake = cameraShakeRef.current;
        const particlePool = particlePoolRef.current;

        // Update camera shake
        if (cameraShake) {
            cameraShake.update(dt);
            cameraShake.apply();
        }

        // Update particle system and wire it to all cars (local + opponents)
        if (particlePool) {
            particlePool.update(dt);
            wireParticlePoolToCars(particlePool, sessionRef.current, wiredCarsRef.current);
        }
    });
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
            <ErrorBoundary key={`deployables-${resetNonce}`}>
                <OilSlickDeployables />
            </ErrorBoundary>
            <ErrorBoundary key={`projectiles-${resetNonce}`}>
                <HomingProjectiles />
            </ErrorBoundary>
        </>
    );
};
