import * as THREE from 'three';

const SKIP_MATERIAL_NAMES = new Set(['Windows', 'Grey', 'Black', 'Headlights', 'TailLights', 'BrakeLight']);
const WHEEL_MESH_RE = /wheel/i;

const hasColor = (mat: THREE.Material): mat is THREE.Material & { color: THREE.Color } =>
    'color' in mat && mat.color instanceof THREE.Color;

const hasTextureMap = (mat: THREE.Material): mat is THREE.MeshStandardMaterial & { map: THREE.Texture } =>
    mat instanceof THREE.MeshStandardMaterial && mat.map != null;

export const cloneTextureForPaint = (src: THREE.Texture): THREE.Texture => {
    const clonedTexture = src.clone();
    clonedTexture.needsUpdate = true;
    return clonedTexture;
};

/**
 * Convert a texture to grayscale so paint color multiplies against luminance
 * only — preserving contrast between windshield/body/trim in atlas textures.
 */
const toGrayscaleTexture = (src: THREE.Texture): THREE.Texture => {
    const img = src.image;
    if (!img) {
        return cloneTextureForPaint(src);
    }
    const canvas = document.createElement('canvas');
    canvas.width = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || 512;
    canvas.height = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return cloneTextureForPaint(src);
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
 * A reference to an active car paint material, exposing a live dirt-intensity
 * setter. The `material` property can be used for emissive flash effects.
 */
export type PaintMaterialRef = {
    material: THREE.MeshPhysicalMaterial;
    setDirtIntensity: (value: number) => void;
};

/**
 * Create a standalone MeshPhysicalMaterial suitable for car paint — useful for
 * fallback box geometries rendered before the GLTF loads.
 */
export const createFallbackPaintMaterial = (
    color: THREE.Color | number,
    clonedMaterialsOut?: Set<THREE.Material>,
): THREE.MeshPhysicalMaterial => {
    const mat = new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0.7,
        roughness: 0.3,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        reflectivity: 0.8,
    });
    attachDirtOverlay(mat);
    clonedMaterialsOut?.add(mat);
    return mat;
};

/**
 * Attach the dirt overlay onBeforeCompile hook to a MeshPhysicalMaterial.
 * Injects a `dirtIntensity` uniform and blends a dirt colour into the surface.
 * The shader replace target (`#include <dithering_fragment>`) is stable in
 * Three.js r183 and pinned by package.json — see Risk R02 in the synthesis doc.
 */
const attachDirtOverlay = (mat: THREE.MeshPhysicalMaterial): ((value: number) => void) => {
    // Store the shader reference so we can update uniforms after compile
    let cachedShader: THREE.WebGLProgramParametersWithUniforms | null = null;

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.dirtIntensity = { value: 0.0 };
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
        #include <dithering_fragment>
        // Dirt overlay: blends a muddy tone proportional to dirtIntensity
        // dirtIntensity is set per-frame via Car.setDirtIntensity()
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.35, 0.28, 0.2), dirtIntensity * 0.3);
        `,
        );
        cachedShader = shader;
    };

    // Return a setter that targets whichever compiled shader instance is live
    return (value: number) => {
        if (cachedShader) {
            (cachedShader.uniforms['dirtIntensity'] as { value: number }).value = value;
        }
    };
};

/** Upgrade a standard GLTF body material to MeshPhysicalMaterial with clearcoat + dirt overlay. */
const cloneBodyAsPaintMaterial = (
    src: THREE.MeshStandardMaterial,
    color: THREE.Color,
    clonedMaterialsOut: Set<THREE.Material> | undefined,
    paintRefsOut: PaintMaterialRef[],
): THREE.MeshPhysicalMaterial => {
    const physMat = new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0.7,
        roughness: 0.3,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        reflectivity: 0.8,
        // Carry over texture maps if the model uses an atlas
        map: src.map ? toGrayscaleTexture(src.map) : null,
        normalMap: src.normalMap ? cloneTextureForPaint(src.normalMap) : null,
        roughnessMap: src.roughnessMap ? cloneTextureForPaint(src.roughnessMap) : null,
        aoMap: src.aoMap ? cloneTextureForPaint(src.aoMap) : null,
        name: src.name,
    });
    physMat.needsUpdate = true;
    const setDirtIntensity = attachDirtOverlay(physMat);
    clonedMaterialsOut?.add(physMat);
    paintRefsOut.push({ material: physMat, setDirtIntensity });
    return physMat;
};

/** Clone a non-body material (wheel, glass, lights) as-is. */
const cloneNonPaintMaterial = (
    mat: THREE.Material,
    clonedMaterialsOut: Set<THREE.Material> | undefined,
): THREE.Material => {
    const cloned = mat.clone();
    clonedMaterialsOut?.add(cloned);
    if (hasTextureMap(cloned)) {
        const src = mat as THREE.MeshStandardMaterial;
        cloned.map = src.map ? cloneTextureForPaint(src.map) : cloned.map;
        cloned.needsUpdate = true;
    }
    return cloned;
};

/**
 * Apply a paint color to the appropriate body materials of a cloned scene.
 * Upgrades body materials to MeshPhysicalMaterial with clearcoat reflections
 * and an optional dirt overlay (controlled via the returned PaintMaterialRefs).
 *
 * Handles both solid-color models (sport/SUV) and texture-atlas models (pickup).
 * Returns the set of cloned materials for disposal tracking, and paint refs for
 * live visual updates (dirt intensity, etc.).
 */
export const applyCarPaint = (
    scene: THREE.Object3D,
    color: THREE.Color,
    clonedMaterialsOut?: Set<THREE.Material>,
): PaintMaterialRef[] => {
    const paintRefs: PaintMaterialRef[] = [];

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
        const cloned = originals.map((mat) => {
            if (shouldPaintMaterial(mat, isWheel) && mat instanceof THREE.MeshStandardMaterial) {
                return cloneBodyAsPaintMaterial(mat, color, clonedMaterialsOut, paintRefs);
            }
            return cloneNonPaintMaterial(mat, clonedMaterialsOut);
        });
        mesh.material = cloned.length > 1 ? cloned : cloned[0];
    });

    return paintRefs;
};
