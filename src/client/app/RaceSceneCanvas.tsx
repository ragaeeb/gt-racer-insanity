import { Canvas, type RootState } from '@react-three/fiber';
import { lazy, memo, Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import type { ConnectionStatus, RaceState } from '@/shared/network/types';

const RaceWorld = lazy(async () => {
    const module = await import('@/client/game/scene/RaceWorld');
    return { default: module.RaceWorld };
});

export type RaceSceneCanvasProps = {
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

const RACE_CANVAS_CAMERA = { fov: 60, near: 0.1, far: 1000, position: [0, 30, -30] as [number, number, number] };
const RACE_CANVAS_SHADOWS = { type: THREE.PCFShadowMap as THREE.ShadowMapType };
const RACE_CANVAS_GL: Parameters<typeof Canvas>[0]['gl'] = {
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance',
};
const RACE_CANVAS_FALLBACK_CLEAR_COLOR = 0x060a14;
const THREE_CLOCK_DEPRECATION_WARNING =
    'THREE.THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.';
const RAPIER_DEPRECATION_WARNING =
    'using deprecated parameters for the initialization function; pass a single object instead';

const SUPPRESSED_PATTERNS = [
    THREE_CLOCK_DEPRECATION_WARNING,
    RAPIER_DEPRECATION_WARNING,
    'THREE.WebGLRenderer: Context Lost.',
];

const matchesSuppressedPattern = (value: unknown): boolean =>
    typeof value === 'string' && SUPPRESSED_PATTERNS.some((p) => value.includes(p));

const suppressThreeDeprecationWarnings = () => {
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);
    const suppressedMessages = new Set<string>();

    const wrapLogger =
        (original: typeof console.warn): typeof console.warn =>
        (...args: unknown[]) => {
            const firstArg = args[0];
            if (matchesSuppressedPattern(firstArg)) {
                const key = firstArg as string;
                if (!suppressedMessages.has(key)) {
                    suppressedMessages.add(key);
                    original(`[GT Racer] Suppressing repeated message until dependency upgrade: ${key}`);
                }
                return;
            }
            original(...args);
        };

    const wrappedWarn = wrapLogger(originalWarn);
    const wrappedError = wrapLogger(originalError);
    console.warn = wrappedWarn;
    console.error = wrappedError;

    return () => {
        if (console.warn === wrappedWarn) {
            console.warn = originalWarn;
        }
        if (console.error === wrappedError) {
            console.error = originalError;
        }
    };
};

const parseRenderDebugFlag = () => {
    if (typeof window === 'undefined') {
        return false;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const queryFlag = searchParams.get('renderDebug');
    if (queryFlag === '1' || queryFlag === 'true') {
        return true;
    }

    const localStorageFlag = window.localStorage.getItem('gt-render-debug');
    return localStorageFlag === '1' || localStorageFlag === 'true';
};

type RenderDiagnosticEntry = {
    details?: unknown;
    kind: 'error' | 'info' | 'warn';
    message: string;
    tMs: number;
};

export const RaceSceneCanvas = memo(
    ({
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
    }: RaceSceneCanvasProps) => {
        const renderProbeRef = useRef<{
            camera: THREE.Camera;
            canvas: HTMLCanvasElement;
            gl: THREE.WebGLRenderer;
            rootState: RootState;
            scene: THREE.Scene;
        } | null>(null);
        const renderLogsRef = useRef<RenderDiagnosticEntry[]>([]);
        const renderCleanupRef = useRef<(() => void) | null>(null);
        const renderDebugEnabledRef = useRef(parseRenderDebugFlag());

        const appendRenderLog = (kind: RenderDiagnosticEntry['kind'], message: string, details?: unknown) => {
            const entry: RenderDiagnosticEntry = {
                details,
                kind,
                message,
                tMs: Date.now(),
            };
            renderLogsRef.current.push(entry);
            if (renderLogsRef.current.length > 80) {
                renderLogsRef.current.shift();
            }

            if (kind === 'error') {
                console.error('[render]', message, details ?? '');
            } else if (kind === 'warn') {
                console.warn('[render]', message, details ?? '');
            } else if (renderDebugEnabledRef.current) {
                console.info('[render]', message, details ?? '');
            }
        };

        const handleCreated = (rootState: RootState) => {
            const { gl, camera, scene } = rootState;
            gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            gl.setClearColor(RACE_CANVAS_FALLBACK_CLEAR_COLOR, 1);

            const canvas = gl.domElement;
            const onContextLost = (event: Event) => {
                event.preventDefault();
                appendRenderLog('error', 'webglcontextlost');
            };
            const onContextRestored = () => {
                appendRenderLog('warn', 'webglcontextrestored');
            };
            const onContextCreationError = () => {
                appendRenderLog('error', 'webglcontextcreationerror');
            };

            canvas.addEventListener('webglcontextlost', onContextLost, false);
            canvas.addEventListener('webglcontextrestored', onContextRestored, false);
            canvas.addEventListener('webglcontextcreationerror', onContextCreationError, false);

            renderProbeRef.current = { camera, canvas, gl, rootState, scene };
            renderCleanupRef.current = () => {
                canvas.removeEventListener('webglcontextlost', onContextLost);
                canvas.removeEventListener('webglcontextrestored', onContextRestored);
                canvas.removeEventListener('webglcontextcreationerror', onContextCreationError);
            };
        };

        useEffect(() => {
            // TODO(gt-212): Remove this temporary suppression after upgrading Three.js/Rapier.
            return suppressThreeDeprecationWarnings();
        }, []);

        useEffect(() => {
            const getRenderState = () => {
                const probe = renderProbeRef.current;
                if (!probe) {
                    return null;
                }

                const { camera, gl, rootState, scene } = probe;
                scene.updateMatrixWorld(true);
                camera.updateMatrixWorld(true);

                const cameraFrustum = new THREE.Frustum();
                const viewProjectionMatrix = new THREE.Matrix4().multiplyMatrices(
                    camera.projectionMatrix,
                    camera.matrixWorldInverse,
                );
                cameraFrustum.setFromProjectionMatrix(viewProjectionMatrix);

                let meshCount = 0;
                let visibleMeshCount = 0;
                let visiblePointsCount = 0;
                let frustumMeshCount = 0;
                let lightCount = 0;
                let directionalLightCount = 0;
                let nearestVisibleMeshDistance = Number.POSITIVE_INFINITY;
                let farthestVisibleMeshDistance = 0;
                const frustumMeshSamples: Array<{
                    colorHex: string | null;
                    distance: number;
                    materialType: string;
                    meshName: string;
                    opacity: number | null;
                }> = [];
                const scratchWorldPosition = new THREE.Vector3();
                const scratchBoundingSphere = new THREE.Sphere();
                scene.traverse((child) => {
                    const object3D = child as THREE.Object3D & { isMesh?: boolean; isPoints?: boolean };
                    if (object3D.isMesh) {
                        meshCount += 1;
                        if (object3D.visible) {
                            visibleMeshCount += 1;

                            object3D.getWorldPosition(scratchWorldPosition);
                            const meshDistance = scratchWorldPosition.distanceTo(camera.position);
                            nearestVisibleMeshDistance = Math.min(nearestVisibleMeshDistance, meshDistance);
                            farthestVisibleMeshDistance = Math.max(farthestVisibleMeshDistance, meshDistance);

                            if (object3D instanceof THREE.Mesh) {
                                const geometry = object3D.geometry;
                                if (!geometry.boundingSphere) {
                                    geometry.computeBoundingSphere();
                                }
                                if (geometry.boundingSphere) {
                                    scratchBoundingSphere
                                        .copy(geometry.boundingSphere)
                                        .applyMatrix4(object3D.matrixWorld);
                                    if (cameraFrustum.intersectsSphere(scratchBoundingSphere)) {
                                        frustumMeshCount += 1;
                                        if (frustumMeshSamples.length < 8) {
                                            const material = Array.isArray(object3D.material)
                                                ? object3D.material[0]
                                                : object3D.material;
                                            const colorHex =
                                                material && 'color' in material && material.color instanceof THREE.Color
                                                    ? `#${material.color.getHexString()}`
                                                    : null;
                                            const opacity =
                                                material &&
                                                'opacity' in material &&
                                                typeof material.opacity === 'number'
                                                    ? Number(material.opacity.toFixed(3))
                                                    : null;
                                            frustumMeshSamples.push({
                                                colorHex,
                                                distance: Number(meshDistance.toFixed(3)),
                                                materialType: material?.type ?? 'unknown',
                                                meshName: object3D.name || object3D.type,
                                                opacity,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if ((object3D as THREE.Object3D & { isPoints?: boolean }).isPoints && object3D.visible) {
                        visiblePointsCount += 1;
                    }
                    if (child instanceof THREE.Light) {
                        lightCount += 1;
                        if (child instanceof THREE.DirectionalLight) {
                            directionalLightCount += 1;
                        }
                    }
                });

                const cameraDirection = new THREE.Vector3();
                camera.getWorldDirection(cameraDirection);
                const sceneBackground =
                    scene.background instanceof THREE.Color ? `#${scene.background.getHexString()}` : null;
                const sceneFog =
                    scene.fog instanceof THREE.Fog
                        ? {
                              color: `#${scene.fog.color.getHexString()}`,
                              far: Number(scene.fog.far.toFixed(3)),
                              near: Number(scene.fog.near.toFixed(3)),
                          }
                        : null;
                return {
                    cameraDirection: {
                        x: Number(cameraDirection.x.toFixed(3)),
                        y: Number(cameraDirection.y.toFixed(3)),
                        z: Number(cameraDirection.z.toFixed(3)),
                    },
                    cameraPosition: {
                        x: Number(camera.position.x.toFixed(3)),
                        y: Number(camera.position.y.toFixed(3)),
                        z: Number(camera.position.z.toFixed(3)),
                    },
                    cameraRotation: {
                        x: Number(camera.rotation.x.toFixed(3)),
                        y: Number(camera.rotation.y.toFixed(3)),
                        z: Number(camera.rotation.z.toFixed(3)),
                    },
                    drawCalls: gl.info.render.calls,
                    lines: gl.info.render.lines,
                    meshCount,
                    frustumMeshCount,
                    directionalLightCount,
                    lightCount,
                    nearestVisibleMeshDistance: Number.isFinite(nearestVisibleMeshDistance)
                        ? Number(nearestVisibleMeshDistance.toFixed(3))
                        : null,
                    frustumMeshSamples,
                    points: gl.info.render.points,
                    sceneChildren: scene.children.length,
                    sceneBackground,
                    sceneFog,
                    frameSubscriberPriorities: rootState.internal.subscribers.map((subscriber) => subscriber.priority),
                    triangles: gl.info.render.triangles,
                    visibleMeshCount,
                    visiblePointsCount,
                    farthestVisibleMeshDistance: Number(farthestVisibleMeshDistance.toFixed(3)),
                };
            };

            const renderWindow = window as Window & {
                __GT_RENDER__?: {
                    getLogs: () => RenderDiagnosticEntry[];
                    getState: () => ReturnType<typeof getRenderState>;
                };
            };

            renderWindow.__GT_RENDER__ = {
                getLogs: () => [...renderLogsRef.current],
                getState: () => getRenderState(),
            };

            const onUnhandledError = (event: ErrorEvent) => {
                appendRenderLog('error', 'window-error', {
                    message: event.message,
                    source: event.filename,
                });
            };
            const onUnhandledRejection = (event: PromiseRejectionEvent) => {
                appendRenderLog('error', 'window-unhandledrejection', {
                    reason: String(event.reason),
                });
            };

            window.addEventListener('error', onUnhandledError);
            window.addEventListener('unhandledrejection', onUnhandledRejection);

            return () => {
                delete renderWindow.__GT_RENDER__;
                window.removeEventListener('error', onUnhandledError);
                window.removeEventListener('unhandledrejection', onUnhandledRejection);
                renderCleanupRef.current?.();
                renderCleanupRef.current = null;
                renderProbeRef.current = null;
            };
        }, []);

        return (
            <Canvas
                camera={RACE_CANVAS_CAMERA}
                dpr={[1, 2]}
                gl={RACE_CANVAS_GL}
                onCreated={handleCreated}
                shadows={RACE_CANVAS_SHADOWS}
                style={{ background: '#060A14' }}
            >
                <Suspense fallback={null}>
                    {playerName && roomId ? (
                        <RaceWorld
                            cruiseControlEnabled={cruiseControlEnabled}
                            onConnectionStatusChange={onConnectionStatusChange}
                            onGameOverChange={onGameOverChange}
                            onRaceStateChange={onRaceStateChange}
                            playerName={playerName}
                            roomId={roomId}
                            resetNonce={resetNonce}
                            selectedColorId={selectedColorId}
                            selectedTrackId={selectedTrackId}
                            selectedVehicleId={selectedVehicleId}
                        />
                    ) : null}
                </Suspense>
            </Canvas>
        );
    },
);

RaceSceneCanvas.displayName = 'RaceSceneCanvas';
