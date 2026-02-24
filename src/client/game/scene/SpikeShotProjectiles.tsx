import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useAbilityFxStore } from '@/client/game/state/abilityFxStore';

const DURATION_MS = 500;
const POOL_SIZE = 4;

export const SpikeShotProjectiles = () => {
    const groupRef = useRef<THREE.Group>(null);
    const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

    const geometry = useMemo(() => new THREE.ConeGeometry(0.25, 0.8, 8), []);
    const material = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: 0xffcc00,
                emissive: 0xff8800,
                emissiveIntensity: 1.2,
                metalness: 0.3,
                roughness: 0.4,
            }),
        [],
    );

    useFrame(() => {
        const store = useAbilityFxStore.getState();
        const pending = store.pendingSpikeShots;

        if (pending.length > 0) {
            store.removeExpiredSpikeShots(Date.now());
        }

        const nowMs = Date.now();
        for (let i = 0; i < POOL_SIZE; i++) {
            const mesh = meshRefs.current[i];
            if (!mesh) {
                continue;
            }

            if (i < pending.length) {
                const p = pending[i];
                const alpha = Math.min(1, (nowMs - p.triggeredAtMs) / DURATION_MS);
                mesh.position.set(
                    p.sourceX + (p.targetX - p.sourceX) * alpha,
                    0.6,
                    p.sourceZ + (p.targetZ - p.sourceZ) * alpha,
                );
                mesh.visible = true;
            } else {
                mesh.visible = false;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: POOL_SIZE }, (_, i) => (
                <mesh
                    key={i}
                    ref={(el: THREE.Mesh | null) => {
                        meshRefs.current[i] = el;
                    }}
                    geometry={geometry}
                    material={material}
                    visible={false}
                    castShadow={false}
                />
            ))}
        </group>
    );
};
