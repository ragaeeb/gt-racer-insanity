import * as THREE from 'three';
import type { TrackThemeId } from '@/shared/game/track/trackManifest';

const canUseDOM = typeof document !== 'undefined';

type SceneryThemePalette = {
    buildingColors: number[];
    buildingWindow: number;
    lightColor: number;
    lightEmissive: number;
    decorationPrimary: number;
    decorationSecondary: number;
    rockColor: number;
};

const SCENERY_THEME_PALETTES: Record<TrackThemeId, SceneryThemePalette> = {
    'sunny-day': {
        buildingColors: [0x7a8a9a, 0x8899aa, 0x6b7b8b, 0xa0b0c0, 0x9098a0],
        buildingWindow: 0x88bbdd,
        lightColor: 0xffeecc,
        lightEmissive: 0xffcc88,
        decorationPrimary: 0xff6600,
        decorationSecondary: 0xcccccc,
        rockColor: 0x888888,
    },
    'canyon-dusk': {
        buildingColors: [0x8b6b4a, 0x9a7a5a, 0x7a5b3a],
        buildingWindow: 0x554433,
        lightColor: 0xffaa66,
        lightEmissive: 0xff8844,
        decorationPrimary: 0x6b8b3a,
        decorationSecondary: 0xaa8866,
        rockColor: 0x8b6b4a,
    },
    'cyberpunk-night': {
        buildingColors: [0x13172a, 0x1a2037, 0x20284a, 0x152038, 0x1f3251],
        buildingWindow: 0x2de0ff,
        lightColor: 0xff55f3,
        lightEmissive: 0xff00dd,
        decorationPrimary: 0x00e5ff,
        decorationSecondary: 0x7d50ff,
        rockColor: 0x242034,
    },
    'desert-sunset': {
        buildingColors: [0xa9835d, 0xbd9469, 0x8d6f4d],
        buildingWindow: 0x6b4a2e,
        lightColor: 0xffc98f,
        lightEmissive: 0xff9d54,
        decorationPrimary: 0x5c8f3e,
        decorationSecondary: 0xd9b075,
        rockColor: 0xb4865e,
    },
};

type BuildingDescriptor = {
    depth: number;
    height: number;
    materialIndex: number;
    width: number;
    x: number;
    z: number;
};

type StreetLightDescriptor = {
    x: number;
    z: number;
};

type ConeDescriptor = {
    x: number;
    y: number;
    z: number;
};

type PillarDescriptor = {
    height: number;
    scaleX: number;
    scaleZ: number;
    x: number;
    z: number;
};

type MesaDescriptor = {
    depth: number;
    height: number;
    width: number;
    x: number;
    z: number;
};

type BillboardDescriptor = {
    height: number;
    x: number;
    z: number;
};

type CactusDescriptor = {
    armHeight: number;
    hasSecondArm: boolean;
    height: number;
    x: number;
    z: number;
};

const BUILDING_ZONE_INTERVAL = 40;
const STREET_LIGHT_INTERVAL = 60;
const TRACK_EDGE_OFFSET = 15;
const BILLBOARD_INTERVAL = 90;
const CACTUS_INTERVAL = 70;

// LOD visibility distance thresholds per scenery type (meters)
const LOD_DISTANCE_BUILDINGS = 400;
const LOD_DISTANCE_STREET_LIGHTS = 200;
const LOD_DISTANCE_TRAFFIC_CONES = 100;
const LOD_DISTANCE_ROCK_PILLARS = 500;
const LOD_DISTANCE_MESAS = 500;
const LOD_DISTANCE_BILLBOARDS = 300;
const LOD_DISTANCE_CACTI = 200;

type SceneryLODGroup = {
    center: THREE.Vector3;
    maxVisibleDistance: number;
    mesh: THREE.InstancedMesh;
    radius: number;
};

export class SceneryManager {
    private readonly objects: THREE.Object3D[] = [];
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly materials: THREE.Material[] = [];
    private readonly palette: SceneryThemePalette;
    private readonly lodGroups: SceneryLODGroup[] = [];
    private logicalObjectCount = 0;

    constructor(
        private scene: THREE.Scene,
        private random: () => number,
        private trackWidth: number,
        private trackLength: number,
        private themeId: TrackThemeId,
    ) {
        this.palette = SCENERY_THEME_PALETTES[themeId];
    }

    public build = () => {
        switch (this.themeId) {
            case 'sunny-day':
                this.placeCityBuildings();
                this.placeStreetLights();
                this.placeTrafficCones();
                return;
            case 'canyon-dusk':
                this.placeRockPillars();
                this.placeMesaFormations();
                this.placeStreetLights();
                return;
            case 'cyberpunk-night':
                this.placeCityBuildings();
                this.placeStreetLights();
                this.placeNeonBillboards();
                return;
            case 'desert-sunset':
                this.placeRockPillars();
                this.placeMesaFormations();
                this.placeStreetLights();
                this.placeCacti();
                return;
            default:
                this.placeCityBuildings();
                this.placeStreetLights();
                this.placeTrafficCones();
        }
    };

    public getObjectCount = (): number => {
        return this.logicalObjectCount;
    };

    /**
     * Updates LOD visibility for all scenery groups based on camera distance.
     * Call once per frame from the render loop.
     */
    public update = (camera: THREE.Camera): void => {
        const visibilityByMesh = new Map<THREE.InstancedMesh, boolean>();
        for (const group of this.lodGroups) {
            const dist = camera.position.distanceTo(group.center);
            const visible = dist <= group.maxVisibleDistance + group.radius;
            visibilityByMesh.set(group.mesh, (visibilityByMesh.get(group.mesh) ?? false) || visible);
        }
        for (const [mesh, visible] of visibilityByMesh) {
            mesh.visible = visible;
        }
    };

    public getLODGroupCount = (): number => {
        return this.lodGroups.length;
    };

    private buildingMaterials: THREE.MeshStandardMaterial[] = [];

    private registerLODGroupsForPoints = (
        mesh: THREE.InstancedMesh,
        maxVisibleDistance: number,
        points: Array<{ x: number; z: number }>,
        clusterLengthMeters = 200,
    ) => {
        if (points.length === 0) {
            return;
        }

        type ClusterStats = {
            count: number;
            maxX: number;
            maxZ: number;
            minX: number;
            minZ: number;
            sumX: number;
            sumZ: number;
        };

        const clusters = new Map<number, ClusterStats>();
        for (const point of points) {
            const key = Math.floor(point.z / clusterLengthMeters);
            const existing = clusters.get(key);
            if (existing) {
                existing.count += 1;
                existing.sumX += point.x;
                existing.sumZ += point.z;
                existing.minX = Math.min(existing.minX, point.x);
                existing.maxX = Math.max(existing.maxX, point.x);
                existing.minZ = Math.min(existing.minZ, point.z);
                existing.maxZ = Math.max(existing.maxZ, point.z);
                continue;
            }
            clusters.set(key, {
                count: 1,
                maxX: point.x,
                maxZ: point.z,
                minX: point.x,
                minZ: point.z,
                sumX: point.x,
                sumZ: point.z,
            });
        }

        for (const cluster of clusters.values()) {
            const center = new THREE.Vector3(cluster.sumX / cluster.count, 0, cluster.sumZ / cluster.count);
            const halfSpanX = (cluster.maxX - cluster.minX) * 0.5;
            const halfSpanZ = (cluster.maxZ - cluster.minZ) * 0.5;
            const radius = Math.max(8, Math.sqrt(halfSpanX * halfSpanX + halfSpanZ * halfSpanZ) + 6);
            this.lodGroups.push({ center, maxVisibleDistance, mesh, radius });
        }
    };

    private createSharedBuildingMaterials = () => {
        const colors = this.palette.buildingColors;
        const windowColor = this.palette.buildingWindow;

        let texSeed = 0.6180339887;
        const texRandom = () => {
            texSeed = (texSeed * 16807 + 0.5) % 1;
            return texSeed;
        };

        for (const baseColor of colors) {
            let tex: THREE.CanvasTexture | null = null;
            if (canUseDOM) {
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const base = new THREE.Color(baseColor);
                    ctx.fillStyle = `#${base.getHexString()}`;
                    ctx.fillRect(0, 0, 64, 128);

                    const win = new THREE.Color(windowColor);
                    const cols = 4;
                    const rows = 8;
                    const cellW = 64 / cols;
                    const cellH = 128 / rows;
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            const lit = texRandom() > 0.3;
                            const brightness = lit ? 0.7 + texRandom() * 0.3 : 0.1 + texRandom() * 0.1;
                            const wc = win.clone().multiplyScalar(brightness);
                            ctx.fillStyle = `#${wc.getHexString()}`;
                            const pad = 2;
                            ctx.fillRect(c * cellW + pad, r * cellH + pad, cellW - pad * 2, cellH - pad * 2);
                        }
                    }
                    tex = new THREE.CanvasTexture(canvas);
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;
                }
            }

            const mat = new THREE.MeshStandardMaterial({
                color: baseColor,
                map: tex,
                metalness: 0.15,
                roughness: 0.7,
            });
            this.buildingMaterials.push(mat);
            this.materials.push(mat);
        }
    };

    private placeCityBuildings = () => {
        if (this.buildingMaterials.length === 0) {
            this.createSharedBuildingMaterials();
        }

        const buildings: BuildingDescriptor[] = [];
        const zones = Math.floor(this.trackLength / BUILDING_ZONE_INTERVAL);
        const halfWidth = this.trackWidth / 2;

        for (let i = 0; i < zones; i++) {
            const z = i * BUILDING_ZONE_INTERVAL + this.random() * 20;
            const leftX = -(halfWidth + TRACK_EDGE_OFFSET + this.random() * 20);
            const rightX = halfWidth + TRACK_EDGE_OFFSET + this.random() * 20;

            this.createBuildingCluster(buildings, leftX, z);
            this.createBuildingCluster(buildings, rightX, z);
        }

        if (buildings.length === 0) {
            return;
        }

        const unitGeo = new THREE.BoxGeometry(1, 1, 1);
        this.geometries.push(unitGeo);

        // Group buildings by material index for instanced rendering
        const buildingsByMaterial = new Map<number, BuildingDescriptor[]>();
        for (const b of buildings) {
            const group = buildingsByMaterial.get(b.materialIndex) ?? [];
            group.push(b);
            buildingsByMaterial.set(b.materialIndex, group);
        }

        const matrix = new THREE.Matrix4();

        for (const [matIdx, group] of buildingsByMaterial) {
            if (group.length === 0) {
                continue;
            }

            const mat = this.buildingMaterials[matIdx];
            if (!mat) {
                continue;
            }

            const instancedMesh = new THREE.InstancedMesh(unitGeo, mat, group.length);
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
            instancedMesh.frustumCulled = true;

            for (let i = 0; i < group.length; i++) {
                const b = group[i];
                matrix.compose(
                    new THREE.Vector3(b.x, b.height / 2, b.z),
                    new THREE.Quaternion(),
                    new THREE.Vector3(b.width, b.height, b.depth),
                );
                instancedMesh.setMatrixAt(i, matrix);
            }

            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.computeBoundingSphere();
            this.scene.add(instancedMesh);
            this.objects.push(instancedMesh);

            this.registerLODGroupsForPoints(
                instancedMesh,
                LOD_DISTANCE_BUILDINGS,
                group.map((building) => ({ x: building.x, z: building.z })),
            );
        }

        this.logicalObjectCount += buildings.length;
    };

    private createBuildingCluster = (buildings: BuildingDescriptor[], x: number, z: number) => {
        const numBuildings = 1 + Math.floor(this.random() * 3);
        for (let i = 0; i < numBuildings; i++) {
            const width = 8 + this.random() * 12;
            const height = 15 + this.random() * 40;
            const depth = 8 + this.random() * 12;
            const offsetX = (this.random() - 0.5) * 10;
            const offsetZ = (this.random() - 0.5) * 10;
            // Material index is chosen here (same random() call order as before)
            const materialIndex = Math.floor(this.random() * this.buildingMaterials.length);
            buildings.push({ depth, height, materialIndex, width, x: x + offsetX, z: z + offsetZ });
        }
    };

    private placeStreetLights = () => {
        const halfWidth = this.trackWidth / 2;
        const count = Math.floor(this.trackLength / STREET_LIGHT_INTERVAL);

        if (count === 0) {
            return;
        }

        const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, 8, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const lightGeo = new THREE.SphereGeometry(0.4, 8, 8);
        const lightMat = new THREE.MeshStandardMaterial({
            color: this.palette.lightColor,
            emissive: this.palette.lightEmissive,
            emissiveIntensity: 2,
            toneMapped: false,
        });

        this.geometries.push(poleGeo, lightGeo);
        this.materials.push(poleMat, lightMat);

        // Collect all street light positions (2 per zone: left and right)
        const lights: StreetLightDescriptor[] = [];
        for (let i = 0; i < count; i++) {
            const z = i * STREET_LIGHT_INTERVAL + 30;
            lights.push({ x: -halfWidth - 4, z });
            lights.push({ x: halfWidth + 4, z });
        }

        const totalLights = lights.length;

        // Poles InstancedMesh
        const poleMatrix = new THREE.Matrix4();
        const polesInstancedMesh = new THREE.InstancedMesh(poleGeo, poleMat, totalLights);
        polesInstancedMesh.castShadow = true;
        polesInstancedMesh.receiveShadow = true;
        polesInstancedMesh.frustumCulled = true;

        // Bulbs InstancedMesh
        const bulbMatrix = new THREE.Matrix4();
        const bulbsInstancedMesh = new THREE.InstancedMesh(lightGeo, lightMat, totalLights);
        bulbsInstancedMesh.castShadow = false;
        bulbsInstancedMesh.receiveShadow = false;
        bulbsInstancedMesh.frustumCulled = true;

        for (let i = 0; i < totalLights; i++) {
            const light = lights[i];
            // Pole: center at y=4 (pole height=8, so bottom at 0, top at 8)
            poleMatrix.compose(
                new THREE.Vector3(light.x, 4, light.z),
                new THREE.Quaternion(),
                new THREE.Vector3(1, 1, 1),
            );
            polesInstancedMesh.setMatrixAt(i, poleMatrix);

            // Bulb: at top of pole
            bulbMatrix.compose(
                new THREE.Vector3(light.x, 8.2, light.z),
                new THREE.Quaternion(),
                new THREE.Vector3(1, 1, 1),
            );
            bulbsInstancedMesh.setMatrixAt(i, bulbMatrix);
        }

        polesInstancedMesh.instanceMatrix.needsUpdate = true;
        polesInstancedMesh.computeBoundingSphere();
        bulbsInstancedMesh.instanceMatrix.needsUpdate = true;
        bulbsInstancedMesh.computeBoundingSphere();

        this.scene.add(polesInstancedMesh);
        this.objects.push(polesInstancedMesh);
        this.scene.add(bulbsInstancedMesh);
        this.objects.push(bulbsInstancedMesh);

        const lightPoints = lights.map((light) => ({ x: light.x, z: light.z }));
        this.registerLODGroupsForPoints(polesInstancedMesh, LOD_DISTANCE_STREET_LIGHTS, lightPoints);
        this.registerLODGroupsForPoints(bulbsInstancedMesh, LOD_DISTANCE_STREET_LIGHTS, lightPoints);

        this.logicalObjectCount += totalLights;
    };

    private placeTrafficCones = () => {
        const halfWidth = this.trackWidth / 2;
        const count = Math.floor(this.trackLength / 30);

        if (count === 0) {
            return;
        }

        const coneGeo = new THREE.ConeGeometry(0.25, 0.6, 6);
        const coneMat = new THREE.MeshStandardMaterial({
            color: this.palette.decorationPrimary,
            roughness: 0.7,
        });
        this.geometries.push(coneGeo);
        this.materials.push(coneMat);

        const cones: ConeDescriptor[] = [];
        for (let i = 0; i < count; i++) {
            const z = i * 30 + this.random() * 15;
            const side = this.random() > 0.5 ? 1 : -1;
            const x = side * (halfWidth - 2 + this.random() * 2);
            cones.push({ x, y: 0.3, z });
        }

        const instancedMesh = new THREE.InstancedMesh(coneGeo, coneMat, cones.length);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        for (let i = 0; i < cones.length; i++) {
            const c = cones[i];
            matrix.compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
            instancedMesh.setMatrixAt(i, matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.computeBoundingSphere();
        this.scene.add(instancedMesh);
        this.objects.push(instancedMesh);

        this.registerLODGroupsForPoints(
            instancedMesh,
            LOD_DISTANCE_TRAFFIC_CONES,
            cones.map((cone) => ({ x: cone.x, z: cone.z })),
            160,
        );

        this.logicalObjectCount += cones.length;
    };

    private placeRockPillars = () => {
        const halfWidth = this.trackWidth / 2;
        const zones = Math.floor(this.trackLength / 50);

        if (zones === 0) {
            return;
        }

        const pillarGeo = new THREE.CylinderGeometry(1.5, 2.5, 1, 8);
        const pillarMat = new THREE.MeshStandardMaterial({
            color: this.palette.rockColor,
            roughness: 0.9,
            metalness: 0.05,
        });
        this.geometries.push(pillarGeo);
        this.materials.push(pillarMat);

        const pillars: PillarDescriptor[] = [];
        for (let i = 0; i < zones; i++) {
            const z = i * 50 + this.random() * 25;
            const side = this.random() > 0.5 ? 1 : -1;
            const x = side * (halfWidth + 8 + this.random() * 15);
            const height = 8 + this.random() * 20;
            const scaleX = 1 + this.random();
            const scaleZ = 1 + this.random();
            pillars.push({ height, scaleX, scaleZ, x, z });
        }

        const instancedMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, pillars.length);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = false;
        instancedMesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        for (let i = 0; i < pillars.length; i++) {
            const p = pillars[i];
            matrix.compose(
                new THREE.Vector3(p.x, p.height / 2, p.z),
                new THREE.Quaternion(),
                new THREE.Vector3(p.scaleX, p.height, p.scaleZ),
            );
            instancedMesh.setMatrixAt(i, matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.computeBoundingSphere();
        this.scene.add(instancedMesh);
        this.objects.push(instancedMesh);

        this.registerLODGroupsForPoints(
            instancedMesh,
            LOD_DISTANCE_ROCK_PILLARS,
            pillars.map((pillar) => ({ x: pillar.x, z: pillar.z })),
            240,
        );

        this.logicalObjectCount += pillars.length;
    };

    private placeMesaFormations = () => {
        const halfWidth = this.trackWidth / 2;
        const zones = Math.floor(this.trackLength / 80);

        if (zones === 0) {
            return;
        }

        const mesaGeo = new THREE.BoxGeometry(1, 1, 1);
        const mesaMat = new THREE.MeshStandardMaterial({
            color: this.palette.decorationSecondary,
            roughness: 0.85,
        });
        this.geometries.push(mesaGeo);
        this.materials.push(mesaMat);

        const mesas: MesaDescriptor[] = [];
        for (let i = 0; i < zones; i++) {
            const z = i * 80 + this.random() * 40;
            const side = this.random() > 0.5 ? 1 : -1;
            const x = side * (halfWidth + 20 + this.random() * 25);
            const width = 12 + this.random() * 20;
            const height = 5 + this.random() * 10;
            const depth = 10 + this.random() * 15;
            mesas.push({ depth, height, width, x, z });
        }

        const instancedMesh = new THREE.InstancedMesh(mesaGeo, mesaMat, mesas.length);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        for (let i = 0; i < mesas.length; i++) {
            const m = mesas[i];
            matrix.compose(
                new THREE.Vector3(m.x, m.height / 2, m.z),
                new THREE.Quaternion(),
                new THREE.Vector3(m.width, m.height, m.depth),
            );
            instancedMesh.setMatrixAt(i, matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.computeBoundingSphere();
        this.scene.add(instancedMesh);
        this.objects.push(instancedMesh);

        this.registerLODGroupsForPoints(
            instancedMesh,
            LOD_DISTANCE_MESAS,
            mesas.map((mesa) => ({ x: mesa.x, z: mesa.z })),
            240,
        );

        this.logicalObjectCount += mesas.length;
    };

    private placeNeonBillboards = () => {
        const halfWidth = this.trackWidth / 2;
        const count = Math.floor(this.trackLength / BILLBOARD_INTERVAL);
        if (count === 0) {
            return;
        }

        const billboardGeo = new THREE.BoxGeometry(8, 3, 0.4);
        const billboardMat = new THREE.MeshStandardMaterial({
            color: this.palette.decorationPrimary,
            emissive: this.palette.decorationSecondary,
            emissiveIntensity: 2.4,
            roughness: 0.35,
            metalness: 0.25,
            toneMapped: false,
        });

        this.geometries.push(billboardGeo);
        this.materials.push(billboardMat);

        const billboards: BillboardDescriptor[] = [];
        for (let i = 0; i < count; i++) {
            const z = i * BILLBOARD_INTERVAL + 45 + this.random() * 25;
            const side = this.random() > 0.5 ? 1 : -1;
            const x = side * (halfWidth + 10 + this.random() * 14);
            const height = 9 + this.random() * 6;
            billboards.push({ height, x, z });
        }

        const instancedMesh = new THREE.InstancedMesh(billboardGeo, billboardMat, billboards.length);
        instancedMesh.castShadow = false;
        instancedMesh.receiveShadow = false;
        instancedMesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        for (let i = 0; i < billboards.length; i++) {
            const billboard = billboards[i];
            matrix.compose(
                new THREE.Vector3(billboard.x, billboard.height, billboard.z),
                new THREE.Quaternion(),
                new THREE.Vector3(1, 1, 1),
            );
            instancedMesh.setMatrixAt(i, matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.computeBoundingSphere();
        this.scene.add(instancedMesh);
        this.objects.push(instancedMesh);

        this.registerLODGroupsForPoints(
            instancedMesh,
            LOD_DISTANCE_BILLBOARDS,
            billboards.map((billboard) => ({ x: billboard.x, z: billboard.z })),
            180,
        );

        this.logicalObjectCount += billboards.length;
    };

    private placeCacti = () => {
        const halfWidth = this.trackWidth / 2;
        const count = Math.floor(this.trackLength / CACTUS_INTERVAL);
        if (count === 0) {
            return;
        }

        const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 1, 7);
        const armGeo = new THREE.CylinderGeometry(0.16, 0.2, 1, 6);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: this.palette.decorationPrimary,
            roughness: 0.86,
            metalness: 0.04,
        });
        const armMat = new THREE.MeshStandardMaterial({
            color: this.palette.decorationPrimary,
            roughness: 0.82,
            metalness: 0.03,
        });

        this.geometries.push(trunkGeo, armGeo);
        this.materials.push(trunkMat, armMat);

        const cacti: CactusDescriptor[] = [];
        for (let i = 0; i < count; i++) {
            const z = i * CACTUS_INTERVAL + 25 + this.random() * 30;
            const side = this.random() > 0.5 ? 1 : -1;
            const x = side * (halfWidth + 12 + this.random() * 22);
            const height = 2.8 + this.random() * 3.8;
            const armHeight = 1.1 + this.random() * 1.8;
            cacti.push({
                armHeight,
                hasSecondArm: this.random() > 0.35,
                height,
                x,
                z,
            });
        }

        const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, cacti.length);
        trunkMesh.castShadow = true;
        trunkMesh.receiveShadow = false;
        trunkMesh.frustumCulled = true;

        const leftArmMesh = new THREE.InstancedMesh(armGeo, armMat, cacti.length);
        leftArmMesh.castShadow = true;
        leftArmMesh.receiveShadow = false;
        leftArmMesh.frustumCulled = true;

        const rightArmCount = cacti.filter((cactus) => cactus.hasSecondArm).length;
        const rightArmMesh = new THREE.InstancedMesh(armGeo, armMat, rightArmCount);
        rightArmMesh.castShadow = true;
        rightArmMesh.receiveShadow = false;
        rightArmMesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        const leftArmQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
        const rightArmQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));

        let rightArmIndex = 0;
        for (let i = 0; i < cacti.length; i++) {
            const cactus = cacti[i];

            matrix.compose(
                new THREE.Vector3(cactus.x, cactus.height / 2, cactus.z),
                new THREE.Quaternion(),
                new THREE.Vector3(1, cactus.height, 1),
            );
            trunkMesh.setMatrixAt(i, matrix);

            matrix.compose(
                new THREE.Vector3(cactus.x - 0.48, cactus.armHeight, cactus.z),
                leftArmQuat,
                new THREE.Vector3(1, 0.95 + this.random() * 0.45, 1),
            );
            leftArmMesh.setMatrixAt(i, matrix);

            if (cactus.hasSecondArm) {
                matrix.compose(
                    new THREE.Vector3(cactus.x + 0.48, cactus.armHeight + 0.35, cactus.z),
                    rightArmQuat,
                    new THREE.Vector3(1, 0.8 + this.random() * 0.4, 1),
                );
                rightArmMesh.setMatrixAt(rightArmIndex, matrix);
                rightArmIndex += 1;
            }
        }

        trunkMesh.instanceMatrix.needsUpdate = true;
        trunkMesh.computeBoundingSphere();
        leftArmMesh.instanceMatrix.needsUpdate = true;
        leftArmMesh.computeBoundingSphere();
        rightArmMesh.instanceMatrix.needsUpdate = true;
        rightArmMesh.computeBoundingSphere();

        this.scene.add(trunkMesh);
        this.objects.push(trunkMesh);
        this.scene.add(leftArmMesh);
        this.objects.push(leftArmMesh);
        this.scene.add(rightArmMesh);
        this.objects.push(rightArmMesh);

        const cactiPoints = cacti.map((cactus) => ({ x: cactus.x, z: cactus.z }));
        this.registerLODGroupsForPoints(trunkMesh, LOD_DISTANCE_CACTI, cactiPoints, 180);
        this.registerLODGroupsForPoints(leftArmMesh, LOD_DISTANCE_CACTI, cactiPoints, 180);
        this.registerLODGroupsForPoints(rightArmMesh, LOD_DISTANCE_CACTI, cactiPoints, 180);

        this.logicalObjectCount += cacti.length;
    };

    public dispose = () => {
        for (const obj of this.objects) {
            this.scene.remove(obj);
            if (obj instanceof THREE.InstancedMesh) {
                obj.dispose();
            } else if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
            }
        }
        this.objects.length = 0;
        this.lodGroups.length = 0;
        this.logicalObjectCount = 0;

        for (const geo of this.geometries) {
            geo.dispose();
        }
        this.geometries.length = 0;

        for (const mat of this.materials) {
            if (mat instanceof THREE.MeshStandardMaterial && mat.map) {
                mat.map.dispose();
            }
            mat.dispose();
        }
        this.materials.length = 0;
    };
}
