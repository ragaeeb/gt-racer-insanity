import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { OilSlick } from '@/client/game/entities/OilSlick';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';

const POOL_SIZE = DEFAULT_GAMEPLAY_TUNING.combat.deployableMaxPerRoom;

/**
 * Renders server-authoritative oil slick deployables from snapshot data.
 *
 * Maintains a pool of OilSlick objects and updates positions each frame
 * based on `snapshot.deployables[]`. Unused pool entries are hidden.
 */
export const OilSlickDeployables = () => {
    const { scene } = useThree();
    const poolRef = useRef<THREE.Group | null>(null);
    const slicksRef = useRef<OilSlick[]>([]);
    const initialised = useRef(false);

    // Lazily initialise the pool
    if (!initialised.current) {
        const group = new THREE.Group();
        group.name = 'oil-slick-deployables';

        const radius = DEFAULT_GAMEPLAY_TUNING.combat.deployableOilSlickRadius;
        for (let i = 0; i < POOL_SIZE; i++) {
            const slick = new OilSlick(0, 0, radius);
            slick.mesh.visible = false;

            group.add(slick.mesh);
            slicksRef.current.push(slick);
        }

        poolRef.current = group;
        scene.add(group);
        initialised.current = true;
    }

    useFrame(() => {
        const snapshot = useRuntimeStore.getState().latestSnapshot;
        const deployables = snapshot?.deployables ?? [];

        // Filter just oil slicks to be safe, though currently it's the only type
        const oilSlicks = deployables.filter((d) => d.kind === 'oil-slick');

        for (let i = 0; i < POOL_SIZE; i++) {
            const slick = slicksRef.current[i];
            if (!slick) {
                continue;
            }

            if (i < oilSlicks.length) {
                const d = oilSlicks[i];
                slick.setPosition(d.x, d.z);
                slick.mesh.visible = true;
            } else {
                slick.mesh.visible = false;
            }
        }
    });

    // The pool is managed imperatively via scene.add above;
    // React only provides the mount/unmount lifecycle.
    return null;
};
