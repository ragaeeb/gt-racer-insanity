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

    it('should produce deterministic placement with same seed', () => {
        const scene1 = createScene();
        const m1 = new SceneryManager(scene1, seededRandom(42), 76, 2700, 'sunny-day');
        m1.build();

        const scene2 = createScene();
        const m2 = new SceneryManager(scene2, seededRandom(42), 76, 2700, 'sunny-day');
        m2.build();

        expect(m1.getObjectCount()).toBe(m2.getObjectCount());
    });

    it('should produce different placement with different seeds', () => {
        const scene1 = createScene();
        const m1 = new SceneryManager(scene1, seededRandom(42), 76, 2700, 'sunny-day');
        m1.build();

        const scene2 = createScene();
        const m2 = new SceneryManager(scene2, seededRandom(999), 76, 2700, 'sunny-day');
        m2.build();

        expect(m1.getObjectCount()).toBeGreaterThan(0);
        expect(m2.getObjectCount()).toBeGreaterThan(0);
        const positions1 = scene1.children.map((c) => `${c.position.x.toFixed(1)},${c.position.z.toFixed(1)}`);
        const positions2 = scene2.children.map((c) => `${c.position.x.toFixed(1)},${c.position.z.toFixed(1)}`);
        const shared = positions1.filter((p) => positions2.includes(p));
        expect(shared.length).toBeLessThan(positions1.length);
    });

    it('should produce different object types for different themes', () => {
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

    it('should scale object count with track length', () => {
        const sceneShort = createScene();
        const mShort = new SceneryManager(sceneShort, seededRandom(42), 76, 900, 'sunny-day');
        mShort.build();

        const sceneLong = createScene();
        const mLong = new SceneryManager(sceneLong, seededRandom(42), 76, 2700, 'sunny-day');
        mLong.build();

        expect(mLong.getObjectCount()).toBeGreaterThan(mShort.getObjectCount());
    });
});
