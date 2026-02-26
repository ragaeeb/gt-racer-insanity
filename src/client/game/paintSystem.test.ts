import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import {
    applyCarPaint,
    cloneTextureForPaint,
    createFallbackPaintMaterial,
    injectDirtIntensityUniform,
} from '@/client/game/paintSystem';

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
        sourceTexture.image = { width: 1, height: 1 } as unknown as HTMLImageElement;
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

    it('should upgrade body materials to MeshPhysicalMaterial with clearcoat', () => {
        const scene = new THREE.Group();
        const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, name: 'Body' });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
        mesh.name = 'body_panel';
        scene.add(mesh);

        const refs = applyCarPaint(scene, new THREE.Color(0xff0055));
        const paintedMaterial = mesh.material as THREE.MeshPhysicalMaterial;

        expect(paintedMaterial).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(paintedMaterial.clearcoat).toBe(1.0);
        expect(paintedMaterial.clearcoatRoughness).toBe(0.1);
        expect(paintedMaterial.reflectivity).toBeCloseTo(0.8, 6);
        expect(paintedMaterial.metalness).toBe(0.7);
        expect(paintedMaterial.roughness).toBe(0.3);
        expect(refs).toHaveLength(1);
    });

    it('should return PaintMaterialRefs with a working setDirtIntensity setter', () => {
        const scene = new THREE.Group();
        const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, name: 'Body' });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
        scene.add(mesh);

        const refs = applyCarPaint(scene, new THREE.Color(0xff0055));

        expect(refs).toHaveLength(1);
        // setDirtIntensity should not throw (uniform cached after compile — before compile it's a no-op)
        expect(() => refs[0].setDirtIntensity(0.5)).not.toThrow();
    });

    it('should declare dirtIntensity uniform in fragment shader during compile hook', () => {
        const mat = createFallbackPaintMaterial(0xff0055);
        const shader = {
            fragmentShader: '#include <common>\nvoid main() {\n#include <dithering_fragment>\n}',
            uniforms: {},
        } as unknown as THREE.WebGLProgramParametersWithUniforms;

        expect(() => mat.onBeforeCompile(shader, {} as THREE.WebGLRenderer)).not.toThrow();
        expect(shader.fragmentShader.includes('uniform float dirtIntensity;')).toBe(true);
        expect(shader.fragmentShader.startsWith('uniform float dirtIntensity;')).toBe(false);
    });

    it('should inject dirt uniform after #include <common> without duplication', () => {
        const inputShader = '#include <common>\nvoid main() {\n#include <dithering_fragment>\n}';
        const once = injectDirtIntensityUniform(inputShader);
        const twice = injectDirtIntensityUniform(once);

        expect(once.includes('#include <common>\nuniform float dirtIntensity;')).toBe(true);
        const occurrences = twice.split('uniform float dirtIntensity;').length - 1;
        expect(occurrences).toBe(1);
    });

    it('should return empty PaintMaterialRefs when all materials are excluded (wheels only)', () => {
        const scene = new THREE.Group();
        const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, name: 'Body' });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
        mesh.name = 'wheel_rear_right';
        scene.add(mesh);

        const refs = applyCarPaint(scene, new THREE.Color(0xff0000));
        expect(refs).toHaveLength(0);
    });

    it('createFallbackPaintMaterial should produce MeshPhysicalMaterial with clearcoat', () => {
        const mat = createFallbackPaintMaterial(0xff0055);

        expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(mat.clearcoat).toBe(1.0);
        expect(mat.clearcoatRoughness).toBe(0.1);
        expect(mat.reflectivity).toBeCloseTo(0.8, 6);
        expect(mat.metalness).toBe(0.7);
        expect(mat.roughness).toBe(0.3);
    });

    it('createFallbackPaintMaterial should register in clonedMaterialsOut when provided', () => {
        const clonedMats = new Set<THREE.Material>();
        const mat = createFallbackPaintMaterial(new THREE.Color(0xff0055), clonedMats);

        expect(clonedMats.has(mat)).toBe(true);
    });
});
