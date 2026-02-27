import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { MeshoptDecoder } from 'meshoptimizer';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAR_MODEL_CATALOG } from '@/client/game/assets/carModelCatalog';
import { applyCarPaint } from '@/client/game/paintSystem';
import {
    colorIdToHexString,
    colorIdToHSL,
    isHexColorString,
    VEHICLE_CLASS_TO_CATALOG_ID,
} from '@/client/game/vehicleSelections';
import { Input } from '@/components/ui/input';
import { TRACK_MANIFESTS } from '@/shared/game/track/trackManifest';
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

const configureMeshopt = (loader: GLTFLoader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
};

const CarModel = ({ modelPath, colorId }: CarModelProps) => {
    const gltf = useLoader(GLTFLoader, modelPath, configureMeshopt);
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
            <hemisphereLight args={[SKY_COLOR, GROUND_COLOR, 1.5]} />
            <ambientLight intensity={1.5} />
            {/* Main key light — warm */}
            <directionalLight position={[4, 6, 5]} intensity={3.5} />
            {/* Cyan rim light from left */}
            <directionalLight position={[-4, 3, -2]} intensity={2.0} color={RIM_LIGHT_COLOR} />
            {/* Fill from right */}
            <directionalLight position={[3, 2, -4]} intensity={1.5} />
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
    allowTrackSelection?: boolean;
    onSelectColor: (colorId: string) => void;
    selectedVehicleId: VehicleClassId;
    selectedColorId: string;
    selectedTrackId: string;
    onSelectTrack: (trackId: string) => void;
};

const PRELOAD_PATHS = [
    getModelPathForVehicleClass('sport'),
    getModelPathForVehicleClass('muscle'),
    getModelPathForVehicleClass('patrol'),
    getModelPathForVehicleClass('truck'),
];

for (const path of PRELOAD_PATHS) {
    useLoader.preload(GLTFLoader, path, configureMeshopt);
}

export const LobbyCarPreview = ({
    allowTrackSelection = true,
    onSelectColor,
    selectedVehicleId,
    selectedColorId,
    selectedTrackId,
    onSelectTrack,
}: LobbyCarPreviewProps) => {
    const [isPaintModuleOpen, setIsPaintModuleOpen] = useState(false);
    const [draftColor, setDraftColor] = useState(() => colorIdToHexString(selectedColorId));
    const previewHexColor = useMemo(() => colorIdToHexString(selectedColorId), [selectedColorId]);

    useEffect(() => {
        setDraftColor(previewHexColor);
    }, [previewHexColor]);

    return (
        <div className="flex flex-col gap-4">
            {allowTrackSelection ? (
                <fieldset className="space-y-2 border-none p-0 m-0">
                    <legend className="font-mono text-[9px] tracking-[0.2em] text-[#00E5FF]/40 uppercase mb-2 block">
                        DESTINATION
                    </legend>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => onSelectTrack('')}
                            className="py-3 px-2 font-mono text-xs uppercase tracking-wider transition-all"
                            style={{
                                background: selectedTrackId === '' ? 'rgba(0,229,255,0.12)' : 'rgba(0,0,0,0.3)',
                                border:
                                    selectedTrackId === ''
                                        ? '1px solid rgba(0,229,255,0.6)'
                                        : '1px solid rgba(0,229,255,0.12)',
                                color: selectedTrackId === '' ? '#00E5FF' : 'rgba(0,229,255,0.4)',
                                boxShadow: selectedTrackId === '' ? '0 0 12px rgba(0,229,255,0.15)' : 'none',
                            }}
                        >
                            <div className="flex flex-col items-center gap-0.5">
                                <span className="font-bold">RANDOM</span>
                                <span className="text-[9px] tracking-wide opacity-70">ANY TRACK</span>
                            </div>
                        </button>
                        {TRACK_MANIFESTS.map((track) => {
                            const isSelected = selectedTrackId === track.id;
                            return (
                                <button
                                    key={track.id}
                                    type="button"
                                    onClick={() => onSelectTrack(track.id)}
                                    className="py-3 px-2 font-mono text-xs uppercase tracking-wider transition-all"
                                    style={{
                                        background: isSelected ? 'rgba(0,229,255,0.12)' : 'rgba(0,0,0,0.3)',
                                        border: isSelected
                                            ? '1px solid rgba(0,229,255,0.6)'
                                            : '1px solid rgba(0,229,255,0.12)',
                                        color: isSelected ? '#00E5FF' : 'rgba(0,229,255,0.4)',
                                        boxShadow: isSelected ? '0 0 12px rgba(0,229,255,0.15)' : 'none',
                                    }}
                                >
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="font-bold leading-tight text-center">{track.label}</span>
                                        <span className="text-[9px] tracking-wide opacity-70">
                                            {(track.lengthMeters / 1000).toFixed(1)}KM
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>
            ) : null}

            <div className="mt-4">
                <button
                    aria-expanded={isPaintModuleOpen}
                    aria-label="Open paint module"
                    className="aspect-video w-full overflow-hidden shrink-0 relative text-left cursor-pointer"
                    onClick={() => setIsPaintModuleOpen((open) => !open)}
                    style={{
                        background: '#020810',
                        border: '1px solid rgba(0,229,255,0.18)',
                        boxShadow: 'inset 0 0 20px rgba(0,229,255,0.04)',
                    }}
                    type="button"
                >
                    <Canvas
                        camera={{ position: [0, 2.5, 6], fov: 42 }}
                        gl={{ antialias: true, alpha: false }}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                    >
                        <FullScene vehicleClassId={selectedVehicleId} colorId={selectedColorId} />
                    </Canvas>
                    <div className="pointer-events-none absolute left-3 bottom-3 font-mono text-[10px] tracking-[0.2em] uppercase text-[#00E5FF]/65">
                        Click Car To {isPaintModuleOpen ? 'Close' : 'Open'} Paint Module
                    </div>
                </button>
                {isPaintModuleOpen ? (
                    <div
                        className="mt-2 p-3"
                        style={{
                            background: 'rgba(0,8,20,0.75)',
                            border: '1px solid rgba(0,229,255,0.2)',
                        }}
                    >
                        <div className="font-mono text-[9px] tracking-[0.2em] text-[#00E5FF]/50 uppercase mb-2">
                            Paint Module
                        </div>
                        <HexColorPicker
                            color={previewHexColor}
                            onChange={(next) => {
                                const normalized = next.toUpperCase();
                                setDraftColor(normalized);
                                onSelectColor(normalized);
                            }}
                        />
                        <Input
                            className="mt-3 font-mono uppercase"
                            maxLength={7}
                            onChange={(event) => {
                                const next = event.currentTarget.value.toUpperCase();
                                setDraftColor(next);
                                if (isHexColorString(next)) {
                                    onSelectColor(next);
                                }
                            }}
                            value={draftColor}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
};
