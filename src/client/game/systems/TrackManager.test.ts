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

const toLuminance = (color: THREE.Color): number => {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
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

        it('should keep neon-city road readable against dark cars', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 99, 'neon-city');
            const mats = manager as unknown as {
                lineMat: THREE.MeshStandardMaterial;
                roadMat: THREE.MeshStandardMaterial;
            };

            const roadLuminance = toLuminance(mats.roadMat.color);
            const lineLuminance = toLuminance(mats.lineMat.color);

            expect(roadLuminance).toBeGreaterThan(0.04);
            expect(lineLuminance).toBeGreaterThan(roadLuminance + 0.25);
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

    describe('syncPowerups and syncHazards', () => {
        it('should add powerup orbs to the scene when syncPowerups is called', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            manager.syncPowerups([{ id: 'pu-1', powerupId: 'powerup-speed', isActive: true, x: 10, z: 20 }]);

            const orb = scene.children.find((c) => c.name === 'powerup-orb');
            expect(orb).toBeDefined();
        });

        it('should update powerup visibility based on isActive flag', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            manager.syncPowerups([{ id: 'pu-1', powerupId: 'powerup-speed', isActive: false, x: 0, z: 0 }]);

            const orb = scene.children.find((c) => c.name === 'powerup-orb');
            expect(orb?.visible).toBeFalse();
        });

        it('should not duplicate powerup orbs when syncPowerups is called twice', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const powerup = { id: 'pu-1', powerupId: 'powerup-speed', isActive: true, x: 0, z: 0 };

            manager.syncPowerups([powerup]);
            manager.syncPowerups([powerup]);

            const orbs = scene.children.filter((c) => c.name === 'powerup-orb');
            expect(orbs).toHaveLength(1);
        });

        it('should add spike strip to the scene when syncHazards is called with spike-strip id', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            manager.syncHazards([{ id: 'hz-1', hazardId: 'spike-strip', x: 5, z: 15 }]);

            const strip = scene.children.find((c) => c.name === 'spike-strip');
            expect(strip).toBeDefined();
        });

        it('should add puddle trap to the scene when syncHazards is called with puddle-trap id', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            manager.syncHazards([{ id: 'hz-2', hazardId: 'puddle-trap', x: 0, z: 50 }]);

            const puddle = scene.children.find((c) => c.name === 'puddle-trap');
            expect(puddle).toBeDefined();
        });

        it('should not duplicate hazard visuals when syncHazards is called twice', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const hazard = { id: 'hz-1', hazardId: 'spike-strip', x: 0, z: 0 };

            manager.syncHazards([hazard]);
            manager.syncHazards([hazard]);

            const strips = scene.children.filter((c) => c.name === 'spike-strip');
            expect(strips).toHaveLength(1);
        });
    });

    describe('dispose powerups and hazards during reset', () => {
        it('should dispose powerup orbs when reset is called after syncPowerups', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            manager.syncPowerups([{ id: 'pu-1', powerupId: 'powerup-speed', isActive: true, x: 5, z: 5 }]);
            const orbBefore = scene.children.find((c) => c.name === 'powerup-orb');
            expect(orbBefore).toBeDefined();

            manager.reset();

            const orbAfter = scene.children.find((c) => c.name === 'powerup-orb');
            expect(orbAfter).toBeUndefined();
        });

        it('should dispose hazard visuals when reset is called after syncHazards', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            manager.syncHazards([{ id: 'hz-1', hazardId: 'spike-strip', x: 0, z: 10 }]);
            const stripBefore = scene.children.find((c) => c.name === 'spike-strip');
            expect(stripBefore).toBeDefined();

            manager.reset();

            const stripAfter = scene.children.find((c) => c.name === 'spike-strip');
            expect(stripAfter).toBeUndefined();
        });

        it('should dispose hazard visuals when dispose is called after syncHazards', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');

            manager.syncHazards([{ id: 'hz-1', hazardId: 'puddle-trap', x: 0, z: 15 }]);
            manager.dispose();

            const puddleAfter = scene.children.find((c) => c.name === 'puddle-trap');
            expect(puddleAfter).toBeUndefined();
        });
    });

    describe('setTrack and setSeed', () => {
        it('should change track and rebuild the finish line when setTrack is called', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const oldGroup = manager.finishLineGroup;

            manager.setTrack('canyon-sprint');

            expect(manager.finishLineGroup).not.toBe(oldGroup);
            expect(manager.getTrackId()).toBe('canyon-sprint');
        });

        it('should rebuild the track when setSeed is called', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const oldGroup = manager.finishLineGroup;

            manager.setSeed(99);

            expect(manager.finishLineGroup).not.toBe(oldGroup);
        });
    });

    describe('accessors', () => {
        it('should return the track id via getTrackId', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'neon-city');
            expect(manager.getTrackId()).toBe('neon-city');
        });

        it('should return the track length via getTrackLengthMeters', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            expect(manager.getTrackLengthMeters()).toBeGreaterThan(0);
        });

        it('should return the total laps via getTotalLaps', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            expect(manager.getTotalLaps()).toBeGreaterThan(0);
        });

        it('should return race distance as trackLength * totalLaps via getRaceDistanceMeters', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            expect(manager.getRaceDistanceMeters()).toBe(manager.getTrackLengthMeters() * manager.getTotalLaps());
        });

        it('should return active obstacles array via getActiveObstacles', () => {
            const scene = new THREE.Scene();
            const manager = new TrackManager(scene, 42, 'sunset-loop');
            const obstacles = manager.getActiveObstacles();
            expect(Array.isArray(obstacles)).toBeTrue();
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
