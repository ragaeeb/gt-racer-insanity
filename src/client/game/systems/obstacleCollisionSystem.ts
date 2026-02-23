import type * as THREE from 'three';

export type AxisAlignedBounds = {
    maxX: number;
    maxY: number;
    maxZ: number;
    minX: number;
    minY: number;
    minZ: number;
};

export const toAxisAlignedBounds = (box: THREE.Box3): AxisAlignedBounds => {
    return {
        maxX: box.max.x,
        maxY: box.max.y,
        maxZ: box.max.z,
        minX: box.min.x,
        minY: box.min.y,
        minZ: box.min.z,
    };
};

export const createBoundsFromCenterAndSize = (
    center: THREE.Vector3,
    size: THREE.Vector3
): AxisAlignedBounds => {
    const halfX = size.x * 0.5;
    const halfY = size.y * 0.5;
    const halfZ = size.z * 0.5;

    return {
        maxX: center.x + halfX,
        maxY: center.y + halfY,
        maxZ: center.z + halfZ,
        minX: center.x - halfX,
        minY: center.y - halfY,
        minZ: center.z - halfZ,
    };
};

export const intersectsAxisAlignedBounds = (a: AxisAlignedBounds, b: AxisAlignedBounds) => {
    return !(
        a.maxX < b.minX ||
        a.minX > b.maxX ||
        a.maxY < b.minY ||
        a.minY > b.maxY ||
        a.maxZ < b.minZ ||
        a.minZ > b.maxZ
    );
};

