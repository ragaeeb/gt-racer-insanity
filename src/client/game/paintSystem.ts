import * as THREE from 'three';

const SKIP_MATERIAL_NAMES = new Set(['Windows', 'Grey', 'Black', 'Headlights', 'TailLights', 'BrakeLight']);
const WHEEL_MESH_RE = /wheel/i;

const hasColor = (mat: THREE.Material): mat is THREE.Material & { color: THREE.Color } =>
    'color' in mat && mat.color instanceof THREE.Color;

const hasTextureMap = (mat: THREE.Material): mat is THREE.MeshStandardMaterial & { map: THREE.Texture } =>
    mat instanceof THREE.MeshStandardMaterial && mat.map != null;

/**
 * Convert a texture to grayscale so paint color multiplies against luminance
 * only — preserving contrast between windshield/body/trim in atlas textures.
 */
const toGrayscaleTexture = (src: THREE.Texture): THREE.Texture => {
    const img = src.image;
    if (!img) {
        return src;
    }
    const canvas = document.createElement('canvas');
    canvas.width = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || 512;
    canvas.height = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return src;
    }
    ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
        const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        d[i] = g;
        d[i + 1] = g;
        d[i + 2] = g;
    }
    ctx.putImageData(imageData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = src.flipY;
    tex.wrapS = src.wrapS;
    tex.wrapT = src.wrapT;
    tex.colorSpace = src.colorSpace;
    tex.repeat.copy(src.repeat);
    tex.offset.copy(src.offset);
    tex.needsUpdate = true;
    return tex;
};

const shouldPaintMaterial = (mat: THREE.Material, isWheel: boolean): boolean =>
    hasColor(mat) && !SKIP_MATERIAL_NAMES.has(mat.name) && !isWheel;

/**
 * Apply a paint color to the appropriate body materials of a cloned scene.
 * Handles both solid-color models (sport/SUV) and texture-atlas models (pickup).
 * Returns the set of cloned materials for disposal tracking.
 */
export const applyCarPaint = (
    scene: THREE.Object3D,
    color: THREE.Color,
    clonedMaterialsOut?: Set<THREE.Material>,
) => {
    scene.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) {
            return;
        }
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        if (!mesh.material) {
            return;
        }
        const isWheel = WHEEL_MESH_RE.test(mesh.name);
        const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = originals.map((mat) => mat.clone());
        for (const mat of cloned) {
            clonedMaterialsOut?.add(mat);
            if (shouldPaintMaterial(mat, isWheel) && hasColor(mat)) {
                if (hasTextureMap(mat)) {
                    mat.map = toGrayscaleTexture(mat.map);
                    mat.needsUpdate = true;
                }
                mat.color.copy(color);
            }
        }
        mesh.material = cloned.length > 1 ? cloned : cloned[0];
    });
};
