import { Suspense, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { CAR_MODEL_CATALOG } from '@/client/game/assets/carModelCatalog';
import { applyCarPaint } from '@/client/game/paintSystem';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';

const VEHICLE_CLASS_TO_CATALOG_ID: Record<VehicleClassId, string> = {
    sport: 'sport',
    muscle: 'suv',
    truck: 'pickup',
};

const getModelPathForVehicleClass = (vehicleClassId: VehicleClassId): string => {
    const catalogId = VEHICLE_CLASS_TO_CATALOG_ID[vehicleClassId] ?? 'sport';
    const entry = CAR_MODEL_CATALOG.find((c) => c.id === catalogId);
    return entry?.modelPath ?? CAR_MODEL_CATALOG[0].modelPath;
};

const COLOR_ID_TO_HEX: Record<string, number> = {
    blue: 0x1e88e5,
    gold: 0xffd700,
    gray: 0x6b7280,
    green: 0x22c55e,
    orange: 0xf97316,
    red: 0xe53935,
    silver: 0xc0c0c0,
    white: 0xfafafa,
    yellow: 0xeab308,
};

const paintColorFromId = (colorId: string): THREE.Color =>
    new THREE.Color(COLOR_ID_TO_HEX[colorId] ?? COLOR_ID_TO_HEX.red);

type CarModelProps = {
    modelPath: string;
    colorId: string;
};

const buildWrappedCar = (
    sourceScene: THREE.Group,
    modelPath: string,
    colorId: string,
): THREE.Group => {
    const color = paintColorFromId(colorId);
    const scene = sourceScene.clone();
    const yawOffset = CAR_MODEL_CATALOG.find((c) => c.modelPath === modelPath)?.modelYawOffsetRadians ?? 0;
    const wrapper = new THREE.Group();
    const bbox = new THREE.Box3().setFromObject(scene);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    scene.position.set(-center.x, -bbox.min.y, -center.z);
    wrapper.add(scene);
    const maxDim = Math.max(size.x, size.z);
    const scaleFactor = 4 / maxDim;
    wrapper.scale.set(scaleFactor, scaleFactor, scaleFactor);
    wrapper.rotation.y = size.x > size.z ? -Math.PI / 2 + yawOffset : Math.PI + yawOffset;
    applyCarPaint(scene, color);
    return wrapper;
};

const CarModel = ({ modelPath, colorId }: CarModelProps) => {
    const gltf = useGLTF(modelPath);
    const wrapped = useMemo(
        () => buildWrappedCar(gltf.scene, modelPath, colorId),
        [gltf.scene, modelPath, colorId],
    );
    return <primitive object={wrapped} />;
};

type SceneProps = {
    vehicleClassId: VehicleClassId;
    colorId: string;
};

const PreviewScene = ({ vehicleClassId, colorId }: SceneProps) => {
    const modelPath = getModelPathForVehicleClass(vehicleClassId);
    return (
        <>
            <ambientLight intensity={0.9} />
            <directionalLight position={[4, 6, 5]} intensity={1.2} />
            <directionalLight position={[-3, 4, -4]} intensity={0.4} />
            <Suspense fallback={null}>
                <CarModel modelPath={modelPath} colorId={colorId} />
            </Suspense>
        </>
    );
};

type LobbyCarPreviewProps = {
    selectedVehicleId: VehicleClassId;
    selectedColorId: string;
};

const PRELOAD_PATHS = [
    getModelPathForVehicleClass('sport'),
    getModelPathForVehicleClass('muscle'),
    getModelPathForVehicleClass('truck'),
];

export const LobbyCarPreview = ({ selectedVehicleId, selectedColorId }: LobbyCarPreviewProps) => {
    useEffect(() => {
        for (const path of PRELOAD_PATHS) {
            useGLTF.preload(path);
        }
    }, []);
    return (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-[#1D1F2D] border border-[#BCAE8A]/30">
            <Canvas
                camera={{ position: [0, 2.5, 6], fov: 42 }}
                gl={{ antialias: true, alpha: false }}
                style={{ width: '100%', height: '100%', display: 'block' }}
            >
                <PreviewScene vehicleClassId={selectedVehicleId} colorId={selectedColorId} />
            </Canvas>
        </div>
    );
};
