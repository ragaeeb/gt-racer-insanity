import * as THREE from 'three';

type SceneryLODGroup = {
    center: THREE.Vector3;
    instanceIndices: number[];
    maxVisibleDistance: number;
    mesh: THREE.InstancedMesh;
    radius: number;
};

type MeshLODState = {
    baseColors: THREE.Color[] | null;
    baseMatrices: THREE.Matrix4[];
    originalCount: number;
};

/**
 * Manages level-of-detail visibility for instanced scenery meshes.
 *
 * Usage:
 *  1. After filling an InstancedMesh, call `register()` to record its LOD groups.
 *  2. Call `update(camera)` once per frame to cull distant instances.
 *  3. Call `clear()` on dispose.
 */
export class SceneryLODManager {
    private readonly groups: SceneryLODGroup[] = [];
    private readonly stateByMesh = new Map<THREE.InstancedMesh, MeshLODState>();

    public getGroupCount = (): number => this.groups.length;

    /**
     * Registers LOD groups for a set of world-space points belonging to `mesh`.
     * Points are clustered along the Z-axis in `clusterLengthMeters` slices so
     * that entire sections can be culled cheaply.
     */
    public register = (
        mesh: THREE.InstancedMesh,
        maxVisibleDistance: number,
        points: Array<{ x: number; z: number }>,
        clusterLengthMeters = 200,
    ): void => {
        if (points.length === 0) {
            return;
        }

        this.snapshotMeshState(mesh);

        type ClusterStats = {
            count: number;
            indices: number[];
            maxX: number;
            maxZ: number;
            minX: number;
            minZ: number;
            sumX: number;
            sumZ: number;
        };

        const clusters = new Map<number, ClusterStats>();
        for (let index = 0; index < points.length; index++) {
            const point = points[index];
            const key = Math.floor(point.z / clusterLengthMeters);
            const existing = clusters.get(key);
            if (existing) {
                existing.count += 1;
                existing.indices.push(index);
                existing.sumX += point.x;
                existing.sumZ += point.z;
                existing.minX = Math.min(existing.minX, point.x);
                existing.maxX = Math.max(existing.maxX, point.x);
                existing.minZ = Math.min(existing.minZ, point.z);
                existing.maxZ = Math.max(existing.maxZ, point.z);
            } else {
                clusters.set(key, {
                    count: 1,
                    indices: [index],
                    maxX: point.x,
                    maxZ: point.z,
                    minX: point.x,
                    minZ: point.z,
                    sumX: point.x,
                    sumZ: point.z,
                });
            }
        }

        for (const cluster of clusters.values()) {
            const center = new THREE.Vector3(cluster.sumX / cluster.count, 0, cluster.sumZ / cluster.count);
            const halfSpanX = (cluster.maxX - cluster.minX) * 0.5;
            const halfSpanZ = (cluster.maxZ - cluster.minZ) * 0.5;
            const radius = Math.max(8, Math.sqrt(halfSpanX * halfSpanX + halfSpanZ * halfSpanZ) + 6);
            this.groups.push({ center, instanceIndices: cluster.indices, maxVisibleDistance, mesh, radius });
        }
    };

    /**
     * Culls instances outside camera range. Call once per frame.
     */
    public update = (camera: THREE.Camera): void => {
        const visibleIndicesByMesh = new Map<THREE.InstancedMesh, Set<number>>();

        for (const group of this.groups) {
            const dist = camera.position.distanceTo(group.center);
            if (dist > group.maxVisibleDistance + group.radius) {
                continue;
            }

            const indices = visibleIndicesByMesh.get(group.mesh) ?? new Set<number>();
            for (const index of group.instanceIndices) {
                indices.add(index);
            }
            visibleIndicesByMesh.set(group.mesh, indices);
        }

        for (const [mesh, state] of this.stateByMesh) {
            const visibleIndicesSet = visibleIndicesByMesh.get(mesh);
            const visibleIndices = visibleIndicesSet ? [...visibleIndicesSet] : [];
            if (visibleIndices.length === 0) {
                mesh.count = 0;
                mesh.visible = false;
                continue;
            }

            mesh.visible = true;
            const nextCount = Math.min(visibleIndices.length, state.originalCount);
            mesh.count = nextCount;

            for (let i = 0; i < nextCount; i++) {
                const sourceIndex = visibleIndices[i];
                const matrix = state.baseMatrices[sourceIndex];
                if (matrix) {
                    mesh.setMatrixAt(i, matrix);
                }

                if (state.baseColors) {
                    const color = state.baseColors[sourceIndex];
                    if (color) {
                        mesh.setColorAt(i, color);
                    }
                }
            }

            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) {
                mesh.instanceColor.needsUpdate = true;
            }
        }
    };

    public clear = (): void => {
        this.groups.length = 0;
        this.stateByMesh.clear();
    };

    private snapshotMeshState = (mesh: THREE.InstancedMesh): void => {
        if (this.stateByMesh.has(mesh)) {
            return;
        }

        const tempMatrix = new THREE.Matrix4();
        const baseMatrices: THREE.Matrix4[] = [];
        for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, tempMatrix);
            baseMatrices.push(tempMatrix.clone());
        }

        let baseColors: THREE.Color[] | null = null;
        if (mesh.instanceColor) {
            const tempColor = new THREE.Color();
            baseColors = [];
            for (let i = 0; i < mesh.count; i++) {
                mesh.getColorAt(i, tempColor);
                baseColors.push(tempColor.clone());
            }
        }

        this.stateByMesh.set(mesh, { baseColors, baseMatrices, originalCount: mesh.count });
    };
}
