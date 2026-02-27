import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { OilSlick } from './OilSlick';

describe('OilSlick', () => {
    it('should create a mesh at the specified x and z position', () => {
        const slick = new OilSlick(10, 20, 3);
        expect(slick.mesh.position.x).toBe(10);
        expect(slick.mesh.position.z).toBe(20);
    });

    it('should place the mesh slightly above the ground with a Y offset', () => {
        const slick = new OilSlick(0, 0, 1);
        expect(slick.mesh.position.y).toBeGreaterThan(0);
        expect(slick.mesh.position.y).toBeLessThan(0.1);
    });

    it('should rotate the mesh flat (rotation.x = -PI/2) to lie on the ground', () => {
        const slick = new OilSlick(0, 0, 2);
        expect(slick.mesh.rotation.x).toBeCloseTo(-Math.PI / 2, 5);
    });

    it('should create a CircleGeometry with the given radius', () => {
        const slick = new OilSlick(0, 0, 4.5);
        expect(slick.mesh.geometry).toBeInstanceOf(THREE.CircleGeometry);
    });

    it('should use a semi-transparent dark material', () => {
        const slick = new OilSlick(0, 0, 2);
        const mat = slick.mesh.material as THREE.MeshStandardMaterial;
        expect(mat.transparent).toBeTrue();
        expect(mat.opacity).toBeGreaterThan(0);
        expect(mat.opacity).toBeLessThan(1);
    });

    it('should receive shadows', () => {
        const slick = new OilSlick(0, 0, 2);
        expect(slick.mesh.receiveShadow).toBeTrue();
    });

    it('should update position via setPosition', () => {
        const slick = new OilSlick(0, 0, 2);
        slick.setPosition(5, 15);
        expect(slick.mesh.position.x).toBe(5);
        expect(slick.mesh.position.z).toBe(15);
        // Y offset should be preserved
        expect(slick.mesh.position.y).toBeGreaterThan(0);
    });

    it('should preserve Y offset when calling setPosition', () => {
        const slick1 = new OilSlick(0, 0, 2);
        const initialY = slick1.mesh.position.y;
        slick1.setPosition(100, 200);
        expect(slick1.mesh.position.y).toBe(initialY);
    });

    it('should dispose geometry and material without throwing', () => {
        const slick = new OilSlick(0, 0, 2);
        expect(() => slick.dispose()).not.toThrow();
    });

    it('should dispose array materials without throwing', () => {
        const slick = new OilSlick(0, 0, 2);
        // Manually set an array of materials to test the Array.isArray branch
        slick.mesh.material = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
        expect(() => slick.dispose()).not.toThrow();
    });
});
