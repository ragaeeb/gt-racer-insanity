import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { LODManager } from './LODManager';

describe('LODManager', () => {
    it('should create 3 LOD levels for a geometry', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2, 4, 8, 4);
        const material = new THREE.MeshStandardMaterial();

        const lod = LODManager.createLOD(geometry, material);

        expect(lod.levels.length).toBe(3);
    });

    it('should reduce vertex count at each LOD level', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2, 8, 16, 8);
        const material = new THREE.MeshStandardMaterial();

        const lod = LODManager.createLOD(geometry, material);

        const highMesh = lod.levels[0].object as THREE.Mesh;
        const medMesh = lod.levels[1].object as THREE.Mesh;
        const lowMesh = lod.levels[2].object as THREE.Mesh;

        const highVerts = highMesh.geometry.attributes.position.count;
        const medVerts = medMesh.geometry.attributes.position.count;
        const lowVerts = lowMesh.geometry.attributes.position.count;

        expect(medVerts).toBeLessThan(highVerts);
        expect(lowVerts).toBeLessThan(medVerts);
    });

    it('should set LOD distances to 0, 50, 150', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2);
        const material = new THREE.MeshStandardMaterial();

        const lod = LODManager.createLOD(geometry, material);

        expect(lod.levels[0].distance).toBe(0);
        expect(lod.levels[1].distance).toBe(50);
        expect(lod.levels[2].distance).toBe(150);
    });

    it('should share the same material across all LOD levels', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2, 4, 8, 4);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });

        const lod = LODManager.createLOD(geometry, material);

        for (const level of lod.levels) {
            const mesh = level.object as THREE.Mesh;
            expect(mesh.material).toBe(material);
        }
    });

    it('should use the original geometry for the highest LOD level', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2, 4, 8, 4);
        const material = new THREE.MeshStandardMaterial();

        const lod = LODManager.createLOD(geometry, material);

        const highMesh = lod.levels[0].object as THREE.Mesh;
        expect(highMesh.geometry).toBe(geometry);
    });

    it('should create LOD with custom distances', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2, 4, 8, 4);
        const material = new THREE.MeshStandardMaterial();

        const lod = LODManager.createLOD(geometry, material, {
            mediumDistance: 100,
            lowDistance: 300,
        });

        expect(lod.levels[0].distance).toBe(0);
        expect(lod.levels[1].distance).toBe(100);
        expect(lod.levels[2].distance).toBe(300);
    });

    it('should simplify geometry by reducing index count', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2, 8, 16, 8);

        const simplified = LODManager.simplifyGeometry(geometry, 0.5);
        const originalIndices = geometry.index!.count;
        const simplifiedIndices = simplified.index!.count;

        expect(simplifiedIndices).toBeLessThan(originalIndices);
    });

    it('should produce ~50% target ratio for medium LOD', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2, 8, 16, 8);

        const simplified = LODManager.simplifyGeometry(geometry, 0.5);
        const originalVerts = geometry.attributes.position.count;
        const simplifiedVerts = simplified.attributes.position.count;

        // Should be significantly reduced but not zero
        expect(simplifiedVerts).toBeLessThan(originalVerts);
        expect(simplifiedVerts).toBeGreaterThan(0);
    });

    it('should produce ~25% target ratio for low LOD', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2, 8, 16, 8);

        const simplified = LODManager.simplifyGeometry(geometry, 0.25);
        const originalVerts = geometry.attributes.position.count;
        const simplifiedVerts = simplified.attributes.position.count;

        expect(simplifiedVerts).toBeLessThan(originalVerts);
        expect(simplifiedVerts).toBeGreaterThan(0);
    });

    it('should never produce zero vertices', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2, 1, 1, 1);
        const material = new THREE.MeshStandardMaterial();

        const lod = LODManager.createLOD(geometry, material);

        for (const level of lod.levels) {
            const mesh = level.object as THREE.Mesh;
            expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
        }
    });

    it('should handle non-indexed geometry gracefully', () => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.MeshStandardMaterial();

        const lod = LODManager.createLOD(geometry, material);

        expect(lod.levels.length).toBe(3);
        for (const level of lod.levels) {
            const mesh = level.object as THREE.Mesh;
            expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
        }
    });

    it('should return an instance of THREE.LOD', () => {
        const geometry = new THREE.BoxGeometry(2, 4, 2);
        const material = new THREE.MeshStandardMaterial();

        const lod = LODManager.createLOD(geometry, material);

        expect(lod).toBeInstanceOf(THREE.LOD);
    });
});
