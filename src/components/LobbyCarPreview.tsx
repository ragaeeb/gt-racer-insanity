import { Suspense, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { CAR_MODEL_CATALOG } from '@/client/game/assets/carModelCatalog';
import { applyCarPaint } from '@/client/game/paintSystem';
import { VEHICLE_CLASS_TO_CATALOG_ID, colorIdToHSL } from '@/client/game/vehicleSelections';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';

const getModelPathForVehicleClass = (vehicleClassId: VehicleClassId): string => {
    const catalogId = VEHICLE_CLASS_TO_CATALOG_ID[vehicleClassId] ?? 'sport';
    const entry = CAR_MODEL_CATALOG.find((c) => c.id === catalogId);
    return entry?.modelPath ?? CAR_MODEL_CATALOG[0].modelPath;
};

const paintColorFromId = (colorId: string): THREE.Color => {
    const hsl = colorIdToHSL(colorId);
    return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
};

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

    useEffect(() => {
        return () => {
            wrapped.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.geometry?.dispose();
                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    for (const mat of materials) {
                        if (mat instanceof THREE.MeshStandardMaterial && mat.map) {
                            mat.map.dispose();
                        }
                        mat?.dispose();
                    }
                }
            });
        };
    }, [wrapped]);

    return <primitive object={wrapped} />;
};

type SceneProps = {
    vehicleClassId: VehicleClassId;
    colorId: string;
};

const PREVIEW_BG_COLOR = new THREE.Color(0x1d1f2d);
const GROUND_COLOR = new THREE.Color(0x2a2d40);
const SKY_COLOR = new THREE.Color(0x3a3f55);

const PreviewScene = ({ vehicleClassId, colorId }: SceneProps) => {
    const modelPath = getModelPathForVehicleClass(vehicleClassId);
    return (
        <>
            <color attach="background" args={[PREVIEW_BG_COLOR.r, PREVIEW_BG_COLOR.g, PREVIEW_BG_COLOR.b]} />
            <hemisphereLight args={[SKY_COLOR, GROUND_COLOR, 0.6]} />
            <ambientLight intensity={1.0} />
            <directionalLight position={[4, 6, 5]} intensity={1.4} />
            <directionalLight position={[-3, 4, -4]} intensity={0.6} />
            <directionalLight position={[0, 2, -5]} intensity={0.3} />
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
    getModelPathForVehicleClass('patrol'),
    getModelPathForVehicleClass('truck'),
];

for (const path of PRELOAD_PATHS) {
    useGLTF.preload(path);
}

export const LobbyCarPreview = ({ selectedVehicleId, selectedColorId }: LobbyCarPreviewProps) => {
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
