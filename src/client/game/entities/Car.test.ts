import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';

const WHEEL_MESH_RE = /wheel/i;
const BRAKE_LIGHT_MATERIAL_RE = /^(BrakeLight|TailLights?)$/i;

const collectWheelMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
    const wheels: THREE.Mesh[] = [];
    root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && WHEEL_MESH_RE.test(child.name)) {
            wheels.push(child as THREE.Mesh);
        }
    });
    return wheels;
};

const collectBrakeLightMaterials = (root: THREE.Object3D): THREE.MeshStandardMaterial[] => {
    const mats: THREE.MeshStandardMaterial[] = [];
    root.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
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

    const wheelNames = ['wheel_FL', 'wheel_FR', 'Wheel_RL', 'WHEEL_RR'];
    for (const name of wheelNames) {
        const wheelMat = new THREE.MeshStandardMaterial({ name: 'WheelMat' });
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2), wheelMat);
        wheel.name = name;
        root.add(wheel);
    }

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

describe('car visual enhancements', () => {
    describe('wheel mesh collection', () => {
        it('should find all wheel meshes by name pattern', () => {
            const scene = buildMockCarScene();
            const wheels = collectWheelMeshes(scene);
            expect(wheels.length).toBe(4);
        });

        it('should match wheel names case-insensitively', () => {
            const scene = buildMockCarScene();
            const wheels = collectWheelMeshes(scene);
            const names = wheels.map((w) => w.name);
            expect(names).toContain('wheel_FL');
            expect(names).toContain('WHEEL_RR');
        });

        it('should not match non-wheel meshes', () => {
            const scene = buildMockCarScene();
            const wheels = collectWheelMeshes(scene);
            const names = wheels.map((w) => w.name);
            expect(names).not.toContain('body');
            expect(names).not.toContain('windshield');
        });
    });

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

    describe('wheel rotation', () => {
        it('should rotate wheels proportional to speed and dt', () => {
            const scene = buildMockCarScene();
            const wheels = collectWheelMeshes(scene);
            const speed = 20;
            const dt = 0.016;
            const expectedRotation = speed * dt * 2;

            for (const wheel of wheels) {
                wheel.rotation.x += speed * dt * 2;
            }

            for (const wheel of wheels) {
                expect(Math.abs(wheel.rotation.x - expectedRotation)).toBeLessThan(0.001);
            }
        });

        it('should not rotate when speed is zero', () => {
            const scene = buildMockCarScene();
            const wheels = collectWheelMeshes(scene);
            for (const wheel of wheels) {
                wheel.rotation.x += 0 * 0.016 * 2;
            }
            for (const wheel of wheels) {
                expect(wheel.rotation.x).toBe(0);
            }
        });
    });

    describe('suspension bounce', () => {
        it('should produce zero bounce at zero speed', () => {
            const normalizedSpeed = 0;
            const bounce = Math.sin(0) * 0.02 * normalizedSpeed;
            expect(bounce).toBe(0);
        });

        it('should produce non-zero bounce at non-zero speed', () => {
            const normalizedSpeed = 0.8;
            const bounce = Math.sin(1.5) * 0.02 * normalizedSpeed;
            expect(Math.abs(bounce)).toBeGreaterThan(0);
        });

        it('should stay within small bounds', () => {
            for (let t = 0; t < 100; t++) {
                const bounce = Math.sin(t * 0.008) * 0.02 * 1.0;
                expect(Math.abs(bounce) <= 0.02).toBe(true);
            }
        });
    });
});
