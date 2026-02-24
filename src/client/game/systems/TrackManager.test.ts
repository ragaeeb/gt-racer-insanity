import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { TrackManager } from './TrackManager';

const collectNames = (root: THREE.Object3D): string[] => {
    const names: string[] = [];
    root.traverse((child) => {
        if (child.name) {
            names.push(child.name);
        }
    });
    return names;
};

const collectMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            meshes.push(child);
        }
    });
    return meshes;
};

describe('TrackManager', () => {
    describe('finish line', () => {
        it('should create a finish line group in the scene', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            expect(manager.finishLineGroup).not.toBeNull();
            expect(manager.finishLineGroup!.name).toBe('finish-line');
        });

        it('should position the finish line near the end of the track', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const trackLength = manager.getRaceDistanceMeters();

            expect(manager.finishLineGroup!.position.z).toBeGreaterThan(trackLength * 0.8);
            expect(manager.finishLineGroup!.position.z).toBeLessThanOrEqual(trackLength);
        });

        it('should include a finish banner mesh', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const names = collectNames(manager.finishLineGroup!);

            expect(names).toContain('finish-banner');
        });

        it('should include two finish flag meshes', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const names = collectNames(manager.finishLineGroup!);
            const flagCount = names.filter((n) => n === 'finish-flag').length;

            expect(flagCount).toBe(2);
        });

        it('should include checkered road tiles', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const meshes = collectMeshes(manager.finishLineGroup!);
            const planeMeshes = meshes.filter(
                (m) => m.geometry instanceof THREE.PlaneGeometry && m.rotation.x === -Math.PI / 2,
            );

            expect(planeMeshes.length).toBeGreaterThan(0);
        });

        it('should include gantry poles and crossbar', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const meshes = collectMeshes(manager.finishLineGroup!);

            const cylinders = meshes.filter((m) => m.geometry instanceof THREE.CylinderGeometry);
            expect(cylinders.length).toBeGreaterThanOrEqual(2);

            const boxes = meshes.filter((m) => m.geometry instanceof THREE.BoxGeometry && m.position.y === 10);
            expect(boxes.length).toBeGreaterThanOrEqual(1);
        });

        it('should add the finish line group to the scene', () => {
            const scene = new THREE.Scene();
            new TrackManager(scene, 42, 'sunset-loop');

            const finishInScene = scene.children.find(
                (child) => child instanceof THREE.Group && child.name === 'finish-line',
            );
            expect(finishInScene).toBeDefined();
        });
    });

    describe('finish line across tracks', () => {
        it('should create a finish line on canyon-sprint track', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 99, 'canyon-sprint');

            expect(manager.finishLineGroup).not.toBeNull();
            expect(manager.finishLineGroup!.name).toBe('finish-line');

            const names = collectNames(manager.finishLineGroup!);
            expect(names).toContain('finish-banner');
            expect(names.filter((n) => n === 'finish-flag').length).toBe(2);
        });
    });

    describe('reset and dispose', () => {
        it('should recreate the finish line after reset', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const originalGroup = manager.finishLineGroup;

            manager.reset();

            expect(manager.finishLineGroup).not.toBeNull();
            expect(manager.finishLineGroup).not.toBe(originalGroup);
            expect(manager.finishLineGroup!.name).toBe('finish-line');
        });

        it('should remove the finish line from the scene after dispose', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            manager.dispose();

            expect(manager.finishLineGroup).toBeNull();
            const finishInScene = scene.children.find(
                (child) => child instanceof THREE.Group && child.name === 'finish-line',
            );
            expect(finishInScene).toBeUndefined();
        });
    });

    describe('flag animation', () => {
        it('should have flags with modifiable vertex positions', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            const flagMeshes: THREE.Mesh[] = [];
            manager.finishLineGroup!.traverse((child) => {
                if (child instanceof THREE.Mesh && child.name === 'finish-flag') {
                    flagMeshes.push(child);
                }
            });

            expect(flagMeshes.length).toBe(2);
            for (const flag of flagMeshes) {
                const positions = flag.geometry.attributes.position;
                expect(positions).toBeDefined();
                expect(positions.count).toBeGreaterThan(4);
            }
        });

        it('should modify flag vertex Z positions during update', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            const flag = manager.finishLineGroup!.children.find(
                (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.name === 'finish-flag',
            )!;

            const positionsBefore = new Float32Array(flag.geometry.attributes.position.array);
            manager.update(0);
            const positionsAfter = flag.geometry.attributes.position.array;

            let anyDifferent = false;
            for (let i = 0; i < positionsBefore.length; i++) {
                if (positionsBefore[i] !== positionsAfter[i]) {
                    anyDifferent = true;
                    break;
                }
            }
            expect(anyDifferent).toBeTrue();
        });
    });
});
