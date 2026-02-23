import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import {
    createBoundsFromCenterAndSize,
    intersectsAxisAlignedBounds,
    toAxisAlignedBounds,
} from '@/client/game/systems/obstacleCollisionSystem';

describe('obstacleCollisionSystem', () => {
    it('should detect overlap between car bounds and obstacle bounds', () => {
        const carBounds = createBoundsFromCenterAndSize(
            new THREE.Vector3(0, 0.9, 0),
            new THREE.Vector3(2.4, 1.8, 4.8)
        );
        const obstacleBounds = createBoundsFromCenterAndSize(
            new THREE.Vector3(0.8, 0.9, 1.4),
            new THREE.Vector3(2, 2, 2)
        );

        expect(intersectsAxisAlignedBounds(carBounds, obstacleBounds)).toEqual(true);
    });

    it('should not detect overlap when obstacle is out of range', () => {
        const carBounds = createBoundsFromCenterAndSize(
            new THREE.Vector3(0, 0.9, 0),
            new THREE.Vector3(2.4, 1.8, 4.8)
        );
        const obstacleBounds = createBoundsFromCenterAndSize(
            new THREE.Vector3(12, 0.9, 0),
            new THREE.Vector3(2, 2, 2)
        );

        expect(intersectsAxisAlignedBounds(carBounds, obstacleBounds)).toEqual(false);
    });

    it('should convert a THREE.Box3 into comparable bounds', () => {
        const box = new THREE.Box3(
            new THREE.Vector3(-1, -2, -3),
            new THREE.Vector3(4, 5, 6)
        );
        const bounds = toAxisAlignedBounds(box);

        expect(bounds.minX).toEqual(-1);
        expect(bounds.minY).toEqual(-2);
        expect(bounds.minZ).toEqual(-3);
        expect(bounds.maxX).toEqual(4);
        expect(bounds.maxY).toEqual(5);
        expect(bounds.maxZ).toEqual(6);
    });
});

