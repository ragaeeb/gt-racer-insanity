import { useLoader } from '@react-three/fiber';
import { MeshoptDecoder } from 'meshoptimizer';
import { useRef } from 'react';
import * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAR_MODEL_CATALOG } from '@/client/game/assets/carModelCatalog';
import type { CarAssets } from '@/client/game/entities/Car';
import type { CarAssetsBundle } from '@/client/game/hooks/types';

export const useCarAssets = (): CarAssetsBundle => {
    const carModelGltfs = useLoader(
        GLTFLoader,
        CAR_MODEL_CATALOG.map((carModel) => carModel.modelPath),
        (loader) => {
            loader.setMeshoptDecoder(MeshoptDecoder);
        },
    ) as GLTF[];

    const engineAudioBuffer = useLoader(THREE.AudioLoader, '/engine.mp3');
    const accelerateAudioBuffer = useLoader(THREE.AudioLoader, '/accelerate.mp3');
    const drivingAudioBuffer = useLoader(THREE.AudioLoader, '/rpm_high.mp3');
    const boostAudioBuffer = useLoader(THREE.AudioLoader, '/boost.mp3');
    const brakeAudioBuffer = useLoader(THREE.AudioLoader, '/brake.mp3');
    const collisionAudioBuffer = useLoader(THREE.AudioLoader, '/collision.mp3');
    const ignitionAudioBuffer = useLoader(THREE.AudioLoader, '/ignition.mp3');
    const empFireAudioBuffer = useLoader(THREE.AudioLoader, '/emp_fire.mp3');
    const empStunAudioBuffer = useLoader(THREE.AudioLoader, '/emp_stun.mp3');
    const finishAudioBuffer = useLoader(THREE.AudioLoader, '/finish.mp3');
    const flatAudioBuffer = useLoader(THREE.AudioLoader, '/flat.mp3');
    const oilDeployAudioBuffer = useLoader(THREE.AudioLoader, '/oil_deploy.mp3');
    const obstacleAudioBuffer = useLoader(THREE.AudioLoader, '/obstacle.mp3');
    const oilTriggerAudioBuffer = useLoader(THREE.AudioLoader, '/oil_trigger.mp3');
    const powerupAudioBuffer = useLoader(THREE.AudioLoader, '/powerup.mp3');
    const squealAudioBuffer = useLoader(THREE.AudioLoader, '/squeal.mp3');
    const rumbleAudioBuffer = useLoader(THREE.AudioLoader, '/gravel.mp3');
    const trapAudioBuffer = useLoader(THREE.AudioLoader, '/trap.mp3');

    const modelVariantScenesRef = useRef<THREE.Group[]>([]);
    const modelVariantsRef = useRef<CarAssetsBundle['modelVariants']>([]);
    const assetDepsRef = useRef<{
        accelerate: AudioBuffer;
        brake: AudioBuffer;
        boost: AudioBuffer;
        collision: AudioBuffer;
        driving: AudioBuffer;
        empFire: AudioBuffer;
        empStun: AudioBuffer;
        engine: AudioBuffer;
        finish: AudioBuffer;
        flat: AudioBuffer;
        ignition: AudioBuffer;
        obstacle: AudioBuffer;
        oilDeploy: AudioBuffer;
        oilTrigger: AudioBuffer;
        powerup: AudioBuffer;
        rumble: AudioBuffer;
        squeal: AudioBuffer;
        trap: AudioBuffer;
    } | null>(null);
    const assetsRef = useRef<CarAssets>({});
    const bundleRef = useRef<CarAssetsBundle | null>(null);

    const modelScenes = carModelGltfs.map((carModelGltf) => carModelGltf.scene);
    const hasModelVariantsChanged =
        modelVariantScenesRef.current.length !== modelScenes.length ||
        modelScenes.some((scene, index) => scene !== modelVariantScenesRef.current[index]);

    if (hasModelVariantsChanged) {
        modelVariantScenesRef.current = modelScenes;
        modelVariantsRef.current = modelScenes.map((scene, index) => ({
            scene,
            yawOffsetRadians: CAR_MODEL_CATALOG[index]?.modelYawOffsetRadians ?? 0,
        }));
    }

    const hasAssetBuffersChanged =
        !assetDepsRef.current ||
        assetDepsRef.current.accelerate !== accelerateAudioBuffer ||
        assetDepsRef.current.brake !== brakeAudioBuffer ||
        assetDepsRef.current.boost !== boostAudioBuffer ||
        assetDepsRef.current.collision !== collisionAudioBuffer ||
        assetDepsRef.current.driving !== drivingAudioBuffer ||
        assetDepsRef.current.empFire !== empFireAudioBuffer ||
        assetDepsRef.current.empStun !== empStunAudioBuffer ||
        assetDepsRef.current.engine !== engineAudioBuffer ||
        assetDepsRef.current.finish !== finishAudioBuffer ||
        assetDepsRef.current.flat !== flatAudioBuffer ||
        assetDepsRef.current.ignition !== ignitionAudioBuffer ||
        assetDepsRef.current.obstacle !== obstacleAudioBuffer ||
        assetDepsRef.current.oilDeploy !== oilDeployAudioBuffer ||
        assetDepsRef.current.oilTrigger !== oilTriggerAudioBuffer ||
        assetDepsRef.current.powerup !== powerupAudioBuffer ||
        assetDepsRef.current.squeal !== squealAudioBuffer ||
        assetDepsRef.current.rumble !== rumbleAudioBuffer ||
        assetDepsRef.current.trap !== trapAudioBuffer;

    if (hasAssetBuffersChanged) {
        assetsRef.current = {
            accelerate: accelerateAudioBuffer,
            brake: brakeAudioBuffer,
            boost: boostAudioBuffer,
            collision: collisionAudioBuffer,
            driving: drivingAudioBuffer,
            empFire: empFireAudioBuffer,
            empStun: empStunAudioBuffer,
            engine: engineAudioBuffer,
            finish: finishAudioBuffer,
            flat: flatAudioBuffer,
            ignition: ignitionAudioBuffer,
            obstacle: obstacleAudioBuffer,
            oilDeploy: oilDeployAudioBuffer,
            oilTrigger: oilTriggerAudioBuffer,
            powerup: powerupAudioBuffer,
            squeal: squealAudioBuffer,
            rumble: rumbleAudioBuffer,
            trap: trapAudioBuffer,
        };
        assetDepsRef.current = {
            accelerate: accelerateAudioBuffer,
            brake: brakeAudioBuffer,
            boost: boostAudioBuffer,
            collision: collisionAudioBuffer,
            driving: drivingAudioBuffer,
            empFire: empFireAudioBuffer,
            empStun: empStunAudioBuffer,
            engine: engineAudioBuffer,
            finish: finishAudioBuffer,
            flat: flatAudioBuffer,
            ignition: ignitionAudioBuffer,
            obstacle: obstacleAudioBuffer,
            oilDeploy: oilDeployAudioBuffer,
            oilTrigger: oilTriggerAudioBuffer,
            powerup: powerupAudioBuffer,
            squeal: squealAudioBuffer,
            rumble: rumbleAudioBuffer,
            trap: trapAudioBuffer,
        };
    }

    if (!bundleRef.current) {
        bundleRef.current = {
            assets: assetsRef.current,
            modelVariants: modelVariantsRef.current,
        };
    }

    bundleRef.current.assets = assetsRef.current;
    bundleRef.current.modelVariants = modelVariantsRef.current;

    return bundleRef.current;
};
