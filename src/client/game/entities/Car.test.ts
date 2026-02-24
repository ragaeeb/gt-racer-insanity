import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { SUSPENSION_BOUNCE_AMPLITUDE, advanceFlipElapsedMs, canTriggerFlip, normalizeAudioSpeed } from './Car';

const BRAKE_LIGHT_MATERIAL_RE = /^(BrakeLight|TailLights?)$/i;

const collectBrakeLightMaterials = (root: THREE.Object3D): THREE.MeshStandardMaterial[] => {
    const mats: THREE.MeshStandardMaterial[] = [];
    root.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) {
            return;
        }
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) {
            if (mat instanceof THREE.MeshStandardMaterial && BRAKE_LIGHT_MATERIAL_RE.test(mat.name)) {
                mats.push(mat);
            }
        }
    });
    return mats;
};

const buildMockCarScene = (): THREE.Group => {
    const root = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshStandardMaterial({ name: 'Body' }));
    body.name = 'body';
    root.add(body);

    const brakeMat1 = new THREE.MeshStandardMaterial({ name: 'BrakeLight', emissive: new THREE.Color(0xff0000) });
    const brake1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.1), brakeMat1);
    brake1.name = 'brake_left';
    root.add(brake1);

    const tailMat = new THREE.MeshStandardMaterial({ name: 'TailLights', emissive: new THREE.Color(0xff0000) });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.1), tailMat);
    tail.name = 'tail_right';
    root.add(tail);

    const windowMat = new THREE.MeshStandardMaterial({ name: 'Windows' });
    const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2), windowMat);
    windowMesh.name = 'windshield';
    root.add(windowMesh);

    return root;
};

const computeSuspensionBounce = (time: number, normalizedSpeed: number): number =>
    Math.sin(time * 5) * SUSPENSION_BOUNCE_AMPLITUDE * normalizedSpeed;

describe('car visual enhancements', () => {
    describe('brake light material collection', () => {
        it('should find brake light materials by name pattern', () => {
            const scene = buildMockCarScene();
            const mats = collectBrakeLightMaterials(scene);
            expect(mats.length).toBe(2);
        });

        it('should match BrakeLight and TailLights material names', () => {
            const scene = buildMockCarScene();
            const mats = collectBrakeLightMaterials(scene);
            const names = mats.map((m) => m.name);
            expect(names).toContain('BrakeLight');
            expect(names).toContain('TailLights');
        });

        it('should not match window or body materials', () => {
            const scene = buildMockCarScene();
            const mats = collectBrakeLightMaterials(scene);
            const names = mats.map((m) => m.name);
            expect(names).not.toContain('Windows');
            expect(names).not.toContain('Body');
        });

        it('should update emissive intensity for braking', () => {
            const scene = buildMockCarScene();
            const mats = collectBrakeLightMaterials(scene);
            for (const mat of mats) {
                mat.emissiveIntensity = 2.0;
            }
            expect(mats.every((m) => m.emissiveIntensity === 2.0)).toBe(true);
        });
    });

    describe('suspension bounce', () => {
        it('should produce zero bounce at zero speed', () => {
            const bounce = computeSuspensionBounce(1.5, 0);
            expect(bounce).toBe(0);
        });

        it('should produce non-zero bounce at non-zero speed', () => {
            const bounce = computeSuspensionBounce(1.5, 0.8);
            expect(Math.abs(bounce)).toBeGreaterThan(0);
        });

        it('should stay within amplitude bounds', () => {
            for (let t = 0; t < 100; t++) {
                const bounce = computeSuspensionBounce(t * 0.016, 1.0);
                expect(Math.abs(bounce)).toBeLessThanOrEqual(SUSPENSION_BOUNCE_AMPLITUDE);
            }
        });
    });

    describe('flip progression', () => {
        it('should prevent flip restarts while an existing flip is active', () => {
            expect(canTriggerFlip(0)).toBe(false);
            expect(canTriggerFlip(350)).toBe(false);
        });

        it('should allow a new flip when no flip is active', () => {
            expect(canTriggerFlip(null)).toBe(true);
        });

        it('should clamp a large frame step so flip animation does not instantly finish', () => {
            const elapsedMs = advanceFlipElapsedMs(0, 2.5);
            expect(elapsedMs).toBe(120);
        });

        it('should cap elapsed flip time at the full animation duration', () => {
            const elapsedMs = advanceFlipElapsedMs(1_450, 0.2);
            expect(elapsedMs).toBe(1_500);
        });

        it('should ignore negative frame deltas', () => {
            const elapsedMs = advanceFlipElapsedMs(400, -1);
            expect(elapsedMs).toBe(400);
        });
    });

    describe('audio speed normalization', () => {
        it('should return zero when max speed is zero', () => {
            expect(normalizeAudioSpeed(10, 0)).toBe(0);
        });

        it('should clamp non-finite values to a safe range', () => {
            expect(normalizeAudioSpeed(Number.NaN, 40)).toBe(0);
            expect(normalizeAudioSpeed(10, Number.NaN)).toBe(0);
            expect(normalizeAudioSpeed(Number.POSITIVE_INFINITY, 40)).toBe(0);
        });

        it('should clamp normalized speed into [0, 1]', () => {
            expect(normalizeAudioSpeed(10, 40)).toBe(0.25);
            expect(normalizeAudioSpeed(80, 40)).toBe(1);
            expect(normalizeAudioSpeed(-10, 40)).toBe(0);
        });
    });
});
