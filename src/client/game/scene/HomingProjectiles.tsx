import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';

const PROJECTILE_Y = 1;
const SPHERE_RADIUS = 0.3;
const SPHERE_SEGMENTS = 8;
const TRAIL_LENGTH = 2;
const CYAN = 0x00ffff;
const POOL_SIZE = 8;

/**
 * Renders server-authoritative projectiles from snapshot data.
 *
 * Maintains a pool of sphere meshes and updates positions each frame
 * based on `snapshot.projectiles[]`. Unused pool entries are hidden.
 */
export const HomingProjectiles = () => {
    const { scene } = useThree();
    const poolRef = useRef<THREE.Group | null>(null);
    const meshesRef = useRef<THREE.Mesh[]>([]);
    const trailsRef = useRef<THREE.Line[]>([]);
    const geometryRef = useRef<THREE.SphereGeometry | null>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
    const initialised = useRef(false);

    // Lazily initialise the pool
    if (!initialised.current) {
        geometryRef.current = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
        materialRef.current = new THREE.MeshStandardMaterial({
            color: CYAN,
            emissive: CYAN,
            emissiveIntensity: 2,
        });

        const group = new THREE.Group();
        group.name = 'homing-projectiles';

        for (let i = 0; i < POOL_SIZE; i++) {
            const mesh = new THREE.Mesh(geometryRef.current, materialRef.current);
            mesh.visible = false;
            mesh.castShadow = false;

            const trailGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -TRAIL_LENGTH),
            ]);
            const trailMat = new THREE.LineBasicMaterial({
                color: CYAN,
                opacity: 0.5,
                transparent: true,
            });
            const trail = new THREE.Line(trailGeo, trailMat);
            mesh.add(trail);

            group.add(mesh);
            meshesRef.current.push(mesh);
            trailsRef.current.push(trail);
        }

        poolRef.current = group;
        scene.add(group);
        initialised.current = true;
    }

    useFrame(() => {
        const snapshot = useRuntimeStore.getState().latestSnapshot;
        const projectiles = snapshot?.projectiles ?? [];

        for (let i = 0; i < POOL_SIZE; i++) {
            const mesh = meshesRef.current[i];
            if (!mesh) {
                continue;
            }

            if (i < projectiles.length) {
                const p = projectiles[i];
                mesh.position.set(p.x, PROJECTILE_Y, p.z);
                mesh.visible = true;
            } else {
                mesh.visible = false;
            }
        }
    });

    // The pool is managed imperatively via scene.add above;
    // React only provides the mount/unmount lifecycle.
    return null;
};
