import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAR_MODEL_CATALOG } from '@/client/game/assets/carModelCatalog';
import type { CarAssets } from '@/client/game/entities/Car';
import type { CarAssetsBundle } from '@/client/game/hooks/types';

export const useCarAssets = (): CarAssetsBundle => {
    const carModelGltfs = useLoader(
        GLTFLoader,
        CAR_MODEL_CATALOG.map((carModel) => carModel.modelPath),
    ) as GLTF[];

    const engineAudioBuffer = useLoader(THREE.AudioLoader, '/engine.mp3');
    const accelerateAudioBuffer = useLoader(THREE.AudioLoader, '/accelerate.mp3');
    const drivingAudioBuffer = useLoader(THREE.AudioLoader, '/driving-loop.wav');
    const brakeAudioBuffer = useLoader(THREE.AudioLoader, '/brake.mp3');

    const modelVariants = useMemo(() => {
        return carModelGltfs.map((carModelGltf, index) => ({
            scene: carModelGltf.scene,
            yawOffsetRadians: CAR_MODEL_CATALOG[index]?.modelYawOffsetRadians ?? 0,
        }));
    }, [carModelGltfs]);

    const assets = useMemo<CarAssets>(
        () => ({
            accelerate: accelerateAudioBuffer,
            brake: brakeAudioBuffer,
            driving: drivingAudioBuffer,
            engine: engineAudioBuffer,
        }),
        [accelerateAudioBuffer, brakeAudioBuffer, drivingAudioBuffer, engineAudioBuffer],
    );

    return useMemo(() => ({ assets, modelVariants }), [assets, modelVariants]);
};
