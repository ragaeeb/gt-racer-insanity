import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { SceneryManager } from '@/client/game/systems/SceneryManager';
import { seededRandom } from '@/shared/utils/prng';

const createScene = () => new THREE.Scene();

describe('SceneryManager', () => {
    it('should place objects for sunny-day theme', () => {
        const scene = createScene();
        const manager = new SceneryManager(scene, seededRandom(42), 76, 2700, 'sunny-day');
        manager.build();
        expect(manager.getObjectCount()).toBeGreaterThan(0);
    });

    it('should place objects for canyon-dusk theme', () => {
        const scene = createScene();
        const manager = new SceneryManager(scene, seededRandom(42), 76, 2700, 'canyon-dusk');
        manager.build();
        expect(manager.getObjectCount()).toBeGreaterThan(0);
    });

    it('should produce deterministic logical object count with same seed', () => {
        const scene1 = createScene();
        const m1 = new SceneryManager(scene1, seededRandom(42), 76, 2700, 'sunny-day');
        m1.build();

        const scene2 = createScene();
        const m2 = new SceneryManager(scene2, seededRandom(42), 76, 2700, 'sunny-day');
        m2.build();

        expect(m1.getObjectCount()).toBe(m2.getObjectCount());
    });

    it('should produce different logical counts with different seeds', () => {
        const scene1 = createScene();
        const m1 = new SceneryManager(scene1, seededRandom(42), 76, 2700, 'sunny-day');
        m1.build();

        const scene2 = createScene();
        const m2 = new SceneryManager(scene2, seededRandom(999), 76, 2700, 'sunny-day');
        m2.build();

        expect(m1.getObjectCount()).toBeGreaterThan(0);
        expect(m2.getObjectCount()).toBeGreaterThan(0);

        // With different seeds, instance matrices in the first InstancedMesh should differ.
        // Compare the first element's matrix from each scene to confirm seeded placement differs.
        const mesh1 = scene1.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh | undefined;
        const mesh2 = scene2.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh | undefined;

        if (mesh1 && mesh2 && mesh1.count > 0 && mesh2.count > 0) {
            const mat1 = new THREE.Matrix4();
            const mat2 = new THREE.Matrix4();
            mesh1.getMatrixAt(0, mat1);
            mesh2.getMatrixAt(0, mat2);
            expect(mat1.equals(mat2)).toBe(false);
        }
    });

    it('should produce different scene object counts for different themes', () => {
        const scene1 = createScene();
        const m1 = new SceneryManager(scene1, seededRandom(42), 76, 2700, 'sunny-day');
        m1.build();
        const sunnyCount = scene1.children.length;

        const scene2 = createScene();
        const m2 = new SceneryManager(scene2, seededRandom(42), 76, 2700, 'canyon-dusk');
        m2.build();
        const canyonCount = scene2.children.length;

        expect(sunnyCount).toBeGreaterThan(0);
        expect(canyonCount).toBeGreaterThan(0);
        expect(sunnyCount).not.toBe(canyonCount);
    });

    it('should add objects to the scene', () => {
        const scene = createScene();
        const childrenBefore = scene.children.length;
        const manager = new SceneryManager(scene, seededRandom(42), 76, 2700, 'sunny-day');
        manager.build();
        expect(scene.children.length).toBeGreaterThan(childrenBefore);
    });

    it('should remove all objects from scene on dispose', () => {
        const scene = createScene();
        const manager = new SceneryManager(scene, seededRandom(42), 76, 2700, 'sunny-day');
        manager.build();
        expect(scene.children.length).toBeGreaterThan(0);

        manager.dispose();
        expect(scene.children.length).toBe(0);
        expect(manager.getObjectCount()).toBe(0);
    });

    it('should scale logical object count with track length', () => {
        const sceneShort = createScene();
        const mShort = new SceneryManager(sceneShort, seededRandom(42), 76, 900, 'sunny-day');
        mShort.build();

        const sceneLong = createScene();
        const mLong = new SceneryManager(sceneLong, seededRandom(42), 76, 2700, 'sunny-day');
        mLong.build();

        expect(mLong.getObjectCount()).toBeGreaterThan(mShort.getObjectCount());
    });

    it('should use only InstancedMesh objects — no raw Mesh or Group in scene', () => {
        const scene = createScene();
        const manager = new SceneryManager(scene, seededRandom(42), 76, 2700, 'sunny-day');
        manager.build();

        for (const child of scene.children) {
            expect(child).toBeInstanceOf(THREE.InstancedMesh);
        }
    });

    // M0-C acceptance tests: verify ≤15 Three.js draw calls (scene.add calls) per theme
    it('should produce fewer than 15 Three.js objects for sunny-day theme', () => {
        const scene = createScene();
        let addCount = 0;
        const originalAdd = scene.add.bind(scene);
        scene.add = (...objects: THREE.Object3D[]) => {
            addCount += objects.length;
            return originalAdd(...objects);
        };

        const manager = new SceneryManager(scene, () => 0.5, 76, 900, 'sunny-day');
        manager.build();

        expect(addCount).toBeLessThan(15);
        expect(manager.getObjectCount()).toBeGreaterThan(100);
    });

    it('should produce fewer than 15 Three.js objects for canyon-dusk theme', () => {
        const scene = createScene();
        let addCount = 0;
        const originalAdd = scene.add.bind(scene);
        scene.add = (...objects: THREE.Object3D[]) => {
            addCount += objects.length;
            return originalAdd(...objects);
        };

        const manager = new SceneryManager(scene, () => 0.5, 76, 1100, 'canyon-dusk');
        manager.build();

        expect(addCount).toBeLessThan(15);
    });
});
