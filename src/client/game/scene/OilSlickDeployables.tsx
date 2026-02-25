import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { OilSlick } from '@/client/game/entities/OilSlick';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import type { SnapshotDeployableState } from '@/shared/network/snapshot';

const EMPTY_DEPLOYABLES: SnapshotDeployableState[] = [];

export const OilSlickDeployables = () => {
    const { scene } = useThree();
    const deployables = useRuntimeStore((state) => state.latestSnapshot?.deployables ?? EMPTY_DEPLOYABLES);
    const oilSlickByIdRef = useRef(new Map<number, OilSlick>());

    useEffect(() => {
        const activeIds = new Set<number>();

        for (const deployable of deployables) {
            if (deployable.kind !== 'oil-slick') {
                continue;
            }

            activeIds.add(deployable.id);
            const existing = oilSlickByIdRef.current.get(deployable.id);
            if (existing) {
                existing.setPosition(deployable.x, deployable.z);
                continue;
            }

            const oilSlick = new OilSlick(deployable.x, deployable.z, deployable.radius);
            scene.add(oilSlick.mesh);
            oilSlickByIdRef.current.set(deployable.id, oilSlick);
        }

        for (const [id, oilSlick] of oilSlickByIdRef.current) {
            if (activeIds.has(id)) {
                continue;
            }
            scene.remove(oilSlick.mesh);
            oilSlick.dispose();
            oilSlickByIdRef.current.delete(id);
        }
    }, [deployables, scene]);

    useEffect(() => {
        return () => {
            for (const oilSlick of oilSlickByIdRef.current.values()) {
                scene.remove(oilSlick.mesh);
                oilSlick.dispose();
            }
            oilSlickByIdRef.current.clear();
        };
    }, [scene]);

    return null;
};
