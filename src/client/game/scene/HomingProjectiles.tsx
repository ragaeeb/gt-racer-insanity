import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';

const PROJECTILE_VISUALS = {
    color: 0x00ffff, // Cyan
    emissiveIntensity: 2,
    renderHeightY: 1,
    sphereRadius: 0.3,
    sphereSegments: 8,
    trailLength: 2,
    trailOpacity: 0.5,
};

const POOL_SIZE = DEFAULT_GAMEPLAY_TUNING.combat.projectileMaxPerRoom;

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

    useEffect(() => {
        if (initialised.current) {
            return;
        }

        geometryRef.current = new THREE.SphereGeometry(
            PROJECTILE_VISUALS.sphereRadius,
            PROJECTILE_VISUALS.sphereSegments,
            PROJECTILE_VISUALS.sphereSegments,
        );
        materialRef.current = new THREE.MeshStandardMaterial({
            color: PROJECTILE_VISUALS.color,
            emissive: PROJECTILE_VISUALS.color,
            emissiveIntensity: PROJECTILE_VISUALS.emissiveIntensity,
        });

        const group = new THREE.Group();
        group.name = 'homing-projectiles';

        for (let i = 0; i < POOL_SIZE; i++) {
            const mesh = new THREE.Mesh(geometryRef.current, materialRef.current);
            mesh.visible = false;
            mesh.castShadow = false;

            const trailGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -PROJECTILE_VISUALS.trailLength),
            ]);
            const trailMat = new THREE.LineBasicMaterial({
                color: PROJECTILE_VISUALS.color,
                opacity: PROJECTILE_VISUALS.trailOpacity,
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

        return () => {
            if (poolRef.current) {
                scene.remove(poolRef.current);
            }

            for (const trail of trailsRef.current) {
                trail.geometry.dispose();
                (trail.material as THREE.Material).dispose();
            }

            geometryRef.current?.dispose();
            materialRef.current?.dispose();
            meshesRef.current = [];
            trailsRef.current = [];
            poolRef.current = null;
            geometryRef.current = null;
            materialRef.current = null;
            initialised.current = false;
        };
    }, [scene]);

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
                mesh.position.set(p.x, PROJECTILE_VISUALS.renderHeightY, p.z);
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
