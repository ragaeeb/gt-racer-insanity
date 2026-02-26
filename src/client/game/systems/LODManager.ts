import * as THREE from 'three';

type LODDistanceOptions = {
    lowDistance?: number;
    mediumDistance?: number;
};

const DEFAULT_MEDIUM_DISTANCE = 50;
const DEFAULT_LOW_DISTANCE = 150;
const MEDIUM_LOD_RATIO = 0.5;
const LOW_LOD_RATIO = 0.25;

/**
 * Creates a simplified version of a BufferGeometry by decimating triangles.
 *
 * For indexed geometry, this keeps every Nth triangle based on the target ratio,
 * then compacts the vertex buffer to remove unreferenced vertices.
 * For non-indexed geometry, a clone is returned as-is.
 *
 * @param geometry - The source geometry to simplify
 * @param targetRatio - Target ratio of triangles to keep (0.5 = 50%, 0.25 = 25%)
 * @returns A new simplified BufferGeometry (or a clone if non-indexed)
 */
const simplifyGeometry = (geometry: THREE.BufferGeometry, targetRatio: number): THREE.BufferGeometry => {
    const index = geometry.index;
    if (!index) {
        // Non-indexed geometry: return clone as-is
        return geometry.clone();
    }

    const originalIndexCount = index.count;
    const triangleCount = originalIndexCount / 3;

    // Calculate how many triangles to keep (minimum 1)
    const targetTriangles = Math.max(1, Math.floor(triangleCount * targetRatio));

    if (targetTriangles >= triangleCount) {
        // No simplification needed
        return geometry.clone();
    }

    // Stride-based decimation: keep every Nth triangle
    const stride = triangleCount / targetTriangles;
    const selectedIndices: number[] = [];

    for (let i = 0; i < targetTriangles; i++) {
        const srcTriangle = Math.min(Math.floor(i * stride), triangleCount - 1);
        const baseIdx = srcTriangle * 3;
        selectedIndices.push(index.array[baseIdx], index.array[baseIdx + 1], index.array[baseIdx + 2]);
    }

    // Compact: collect unique referenced vertices in sorted order for determinism
    const usedVertices = [...new Set(selectedIndices)].sort((a, b) => a - b);
    const oldToNew = new Map<number, number>();
    for (let i = 0; i < usedVertices.length; i++) {
        oldToNew.set(usedVertices[i], i);
    }

    // Remap index array to new dense vertex indices
    const remappedIndices = selectedIndices.map((old) => oldToNew.get(old)!);

    // Build compacted geometry with only referenced vertices
    const simplified = new THREE.BufferGeometry();

    for (const attrName of Object.keys(geometry.attributes)) {
        const srcAttr = geometry.attributes[attrName] as THREE.BufferAttribute;
        const itemSize = srcAttr.itemSize;
        const newArray = new Float32Array(usedVertices.length * itemSize);

        for (let i = 0; i < usedVertices.length; i++) {
            const oldVertIndex = usedVertices[i];
            for (let j = 0; j < itemSize; j++) {
                newArray[i * itemSize + j] = srcAttr.array[oldVertIndex * itemSize + j];
            }
        }

        simplified.setAttribute(attrName, new THREE.BufferAttribute(newArray, itemSize));
    }

    simplified.setIndex(remappedIndices);

    return simplified;
};

/**
 * Creates a THREE.LOD with 3 detail levels for a given geometry and material.
 *
 * - Level 0 (high): Full-detail original geometry (0–50m)
 * - Level 1 (medium): ~50% triangle reduction (50–150m)
 * - Level 2 (low): ~25% triangle reduction (150m+)
 */
const createLOD = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    distances?: LODDistanceOptions,
): THREE.LOD => {
    const lod = new THREE.LOD();

    const medDist = distances?.mediumDistance ?? DEFAULT_MEDIUM_DISTANCE;
    const lowDist = distances?.lowDistance ?? DEFAULT_LOW_DISTANCE;

    // Level 0: Full detail (0m – medDist)
    const highMesh = new THREE.Mesh(geometry, material);
    lod.addLevel(highMesh, 0);

    // Level 1: Medium detail (medDist – lowDist)
    const medGeometry = simplifyGeometry(geometry, MEDIUM_LOD_RATIO);
    const medMesh = new THREE.Mesh(medGeometry, material);
    lod.addLevel(medMesh, medDist);

    // Level 2: Low detail (lowDist+)
    const lowGeometry = simplifyGeometry(geometry, LOW_LOD_RATIO);
    const lowMesh = new THREE.Mesh(lowGeometry, material);
    lod.addLevel(lowMesh, lowDist);

    return lod;
};

/**
 * LODManager namespace wrapping LOD creation and geometry simplification utilities.
 * Preserves static-method-style API for backward compatibility with the task spec.
 */
export const LODManager = {
    createLOD,
    simplifyGeometry,
} as const;
