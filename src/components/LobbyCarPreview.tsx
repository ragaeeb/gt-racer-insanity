import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CAR_MODEL_CATALOG } from '@/client/game/assets/carModelCatalog';
import { applyCarPaint } from '@/client/game/paintSystem';
import { colorIdToHSL, VEHICLE_CLASS_TO_CATALOG_ID } from '@/client/game/vehicleSelections';
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

const buildWrappedCar = (sourceScene: THREE.Group, modelPath: string, colorId: string): THREE.Group => {
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

const disposeWrappedCar = (wrappedCar: THREE.Group) => {
    wrappedCar.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.geometry?.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of materials) {
                if (mat && 'map' in mat && (mat as THREE.MeshStandardMaterial).map) {
                    (mat as THREE.MeshStandardMaterial).map!.dispose();
                }
                mat?.dispose();
            }
        }
    });
};

const CarModel = ({ modelPath, colorId }: CarModelProps) => {
    const gltf = useGLTF(modelPath);
    const wrappedRef = useRef<THREE.Group | null>(null);
    const wrappedKeyRef = useRef('');
    const baseYawRef = useRef(0);
    const wrappedKey = `${gltf.scene.uuid}:${modelPath}:${colorId}`;

    if (!wrappedRef.current || wrappedKeyRef.current !== wrappedKey) {
        wrappedRef.current = buildWrappedCar(gltf.scene, modelPath, colorId);
        wrappedKeyRef.current = wrappedKey;
        baseYawRef.current = wrappedRef.current.rotation.y;
    }

    const wrapped = wrappedRef.current;

    useFrame((_, dt) => {
        wrapped.rotation.y += dt * 0.45;
        if (wrapped.rotation.y > baseYawRef.current + Math.PI * 2) {
            wrapped.rotation.y -= Math.PI * 2;
        }
    });

    useEffect(() => {
        return () => disposeWrappedCar(wrapped);
    }, [wrapped]);

    return <primitive object={wrapped} />;
};

type SceneProps = {
    vehicleClassId: VehicleClassId;
    colorId: string;
};

// Cyber dark palette for the preview scene
const PREVIEW_BG_COLOR = new THREE.Color(0x020810);
const GROUND_COLOR = new THREE.Color(0x041020);
const SKY_COLOR = new THREE.Color(0x003344);
const RIM_LIGHT_COLOR = new THREE.Color(0x00e5ff);

const PreviewScene = () => {
    return (
        <>
            <color attach="background" args={[PREVIEW_BG_COLOR.r, PREVIEW_BG_COLOR.g, PREVIEW_BG_COLOR.b]} />
            <hemisphereLight args={[SKY_COLOR, GROUND_COLOR, 0.5]} />
            <ambientLight intensity={0.7} />
            {/* Main key light — warm */}
            <directionalLight position={[4, 6, 5]} intensity={1.4} />
            {/* Cyan rim light from left */}
            <directionalLight position={[-4, 3, -2]} intensity={0.9} color={RIM_LIGHT_COLOR} />
            {/* Fill from right */}
            <directionalLight position={[3, 2, -4]} intensity={0.4} />
        </>
    );
};

// Wrap PreviewScene + CarModel together
const FullScene = ({ vehicleClassId, colorId }: SceneProps) => {
    const modelPath = getModelPathForVehicleClass(vehicleClassId);
    return (
        <>
            <PreviewScene />
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
        <div
            className="aspect-video w-full overflow-hidden"
            style={{
                background: '#020810',
                border: '1px solid rgba(0,229,255,0.18)',
                boxShadow: 'inset 0 0 20px rgba(0,229,255,0.04)',
            }}
        >
            <Canvas
                camera={{ position: [0, 2.5, 6], fov: 42 }}
                gl={{ antialias: true, alpha: false }}
                style={{ width: '100%', height: '100%', display: 'block' }}
            >
                <FullScene vehicleClassId={selectedVehicleId} colorId={selectedColorId} />
            </Canvas>
        </div>
    );
};
