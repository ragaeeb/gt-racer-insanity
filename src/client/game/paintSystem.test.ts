import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { applyCarPaint, cloneTextureForPaint } from '@/client/game/paintSystem';

const createTexturedMaterial = (name: string, colorHex: number) => {
    const texture = new THREE.Texture();
    return new THREE.MeshStandardMaterial({
        color: colorHex,
        map: texture,
        name,
    });
};

describe('paintSystem', () => {
    it('should clone texture instances before assigning to cloned materials', () => {
        const sourceTexture = new THREE.Texture();
        const cloned = cloneTextureForPaint(sourceTexture);
        expect(cloned).not.toBe(sourceTexture);
        expect(cloned.image).toBe(sourceTexture.image);
    });

    it('should avoid sharing texture map instances with source materials', () => {
        const scene = new THREE.Group();
        const sourceMaterial = createTexturedMaterial('TailLights', 0xffffff);
        const sourceMap = sourceMaterial.map;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
        scene.add(mesh);

        applyCarPaint(scene, new THREE.Color(0xff0055));

        const paintedMaterial = mesh.material as THREE.MeshStandardMaterial;
        expect(paintedMaterial.map).toBeDefined();
        expect(paintedMaterial.map).not.toBe(sourceMap);
        expect(paintedMaterial.color.getHex()).toBe(0xffffff);
    });

    it('should paint non-wheel materials while keeping map ownership local', () => {
        const scene = new THREE.Group();
        const sourceMaterial = createTexturedMaterial('Body', 0xffffff);
        const sourceMap = sourceMaterial.map;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
        mesh.name = 'body';
        scene.add(mesh);

        applyCarPaint(scene, new THREE.Color(0x00ff00));

        const paintedMaterial = mesh.material as THREE.MeshStandardMaterial;
        expect(paintedMaterial.color.getHex()).toBe(0x00ff00);
        expect(paintedMaterial.map).toBeDefined();
        expect(paintedMaterial.map).not.toBe(sourceMap);
    });

    it('should not recolor wheel meshes', () => {
        const scene = new THREE.Group();
        const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, name: 'Body' });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
        mesh.name = 'wheel_front_left';
        scene.add(mesh);

        applyCarPaint(scene, new THREE.Color(0xff0000));

        const paintedMaterial = mesh.material as THREE.MeshStandardMaterial;
        expect(paintedMaterial.color.getHex()).toBe(0x111111);
    });
});
