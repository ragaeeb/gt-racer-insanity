import { useLoader } from '@react-three/fiber';
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
    ) as GLTF[];

    const engineAudioBuffer = useLoader(THREE.AudioLoader, '/engine.mp3');
    const accelerateAudioBuffer = useLoader(THREE.AudioLoader, '/accelerate.mp3');
    const drivingAudioBuffer = useLoader(THREE.AudioLoader, '/driving-loop.wav');
    const brakeAudioBuffer = useLoader(THREE.AudioLoader, '/brake.mp3');
    // squeal.mp3: dedicated tire-squeal asset (loops during drift on asphalt, pitch-shifted per surface)
    // rumble uses driving-loop.wav as stand-in (low-frequency loop at low volume on gravel)
    const squealAudioBuffer = useLoader(THREE.AudioLoader, '/squeal.mp3');
    const rumbleAudioBuffer = useLoader(THREE.AudioLoader, '/driving-loop.wav');

    const modelVariantScenesRef = useRef<THREE.Group[]>([]);
    const modelVariantsRef = useRef<CarAssetsBundle['modelVariants']>([]);
    const assetDepsRef = useRef<{
        accelerate: AudioBuffer;
        brake: AudioBuffer;
        driving: AudioBuffer;
        engine: AudioBuffer;
        rumble: AudioBuffer;
        squeal: AudioBuffer;
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
        assetDepsRef.current.driving !== drivingAudioBuffer ||
        assetDepsRef.current.engine !== engineAudioBuffer ||
        assetDepsRef.current.squeal !== squealAudioBuffer ||
        assetDepsRef.current.rumble !== rumbleAudioBuffer;

    if (hasAssetBuffersChanged) {
        assetsRef.current = {
            accelerate: accelerateAudioBuffer,
            brake: brakeAudioBuffer,
            driving: drivingAudioBuffer,
            engine: engineAudioBuffer,
            squeal: squealAudioBuffer,
            rumble: rumbleAudioBuffer,
        };
        assetDepsRef.current = {
            accelerate: accelerateAudioBuffer,
            brake: brakeAudioBuffer,
            driving: drivingAudioBuffer,
            engine: engineAudioBuffer,
            squeal: squealAudioBuffer,
            rumble: rumbleAudioBuffer,
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
