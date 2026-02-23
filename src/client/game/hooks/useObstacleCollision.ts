import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RaceSession, RaceWorldCallbacks } from '@/client/game/hooks/types';
import {
    createBoundsFromCenterAndSize,
    intersectsAxisAlignedBounds,
    toAxisAlignedBounds,
} from '@/client/game/systems/obstacleCollisionSystem';

export const useObstacleCollision = (
    sessionRef: React.RefObject<RaceSession>,
    callbacks: RaceWorldCallbacks,
) => {
    const carBoundingBoxRef = useRef(new THREE.Box3());
    const obstacleBoundingBoxRef = useRef(new THREE.Box3());
    const carCollisionCenterRef = useRef(new THREE.Vector3());
    const carCollisionSizeRef = useRef(new THREE.Vector3(2.4, 1.8, 4.8));

    useFrame(() => {
        const session = sessionRef.current;
        if (!session.isRunning || !session.localCar || !session.trackManager) {
            return;
        }

        const localCar = session.localCar;
        carCollisionCenterRef.current.set(localCar.position.x, localCar.position.y + 0.9, localCar.position.z);
        carBoundingBoxRef.current.setFromCenterAndSize(carCollisionCenterRef.current, carCollisionSizeRef.current);
        const carBounds = createBoundsFromCenterAndSize(carCollisionCenterRef.current, carCollisionSizeRef.current);

        const obstacles = session.trackManager.getActiveObstacles();
        for (const obstacle of obstacles) {
            obstacleBoundingBoxRef.current.setFromObject(obstacle);
            const obstacleBounds = toAxisAlignedBounds(obstacleBoundingBoxRef.current);
            if (!intersectsAxisAlignedBounds(carBounds, obstacleBounds)) {
                continue;
            }

            session.isRunning = false;
            callbacks.onGameOverChange(true);
            break;
        }
    });
};
