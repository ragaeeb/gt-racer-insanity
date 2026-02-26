import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { CameraShake } from '../cameraShake';

describe('CameraShake', () => {
    it('should initialize with zero offset', () => {
        const camera = new THREE.PerspectiveCamera();
        const shake = new CameraShake(camera);

        const offset = shake.getOffset();
        expect(offset.x).toBe(0);
        expect(offset.y).toBe(0);
        expect(offset.z).toBe(0);
    });

    it('should trigger shake with specified intensity', () => {
        const camera = new THREE.PerspectiveCamera();
        const shake = new CameraShake(camera);

        shake.trigger(1.0);
        const offset = shake.getOffset();

        expect(Math.abs(offset.x) + Math.abs(offset.y) + Math.abs(offset.z)).toBeGreaterThan(0);
    });

    it('should decay shake over time', () => {
        const camera = new THREE.PerspectiveCamera();
        const shake = new CameraShake(camera);

        shake.trigger(1.0);
        const initialMagnitude = shake.getOffset().length();

        shake.update(0.5);
        const laterMagnitude = shake.getOffset().length();

        expect(laterMagnitude).toBeLessThan(initialMagnitude);
    });

    it('should return to zero after sufficient time', () => {
        const camera = new THREE.PerspectiveCamera();
        const shake = new CameraShake(camera);

        shake.trigger(1.0);

        for (let i = 0; i < 120; i += 1) {
            shake.update(1 / 60);
        }

        const offset = shake.getOffset();
        expect(offset.length()).toBeLessThan(0.01);
    });
});
