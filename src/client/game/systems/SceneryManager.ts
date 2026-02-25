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

const BUILDING_ZONE_INTERVAL = 40;
const STREET_LIGHT_INTERVAL = 60;
const TRACK_EDGE_OFFSET = 15;

export class SceneryManager {
    private readonly objects: THREE.Object3D[] = [];
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly materials: THREE.Material[] = [];
    private readonly palette: SceneryThemePalette;
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
        if (this.themeId === 'sunny-day') {
            this.placeCityBuildings();
            this.placeStreetLights();
            this.placeTrafficCones();
        } else {
            this.placeRockPillars();
            this.placeMesaFormations();
            this.placeStreetLights();
        }
    };

    public getObjectCount = (): number => {
        return this.logicalObjectCount;
    };

    private buildingMaterials: THREE.MeshStandardMaterial[] = [];

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

        this.logicalObjectCount += mesas.length;
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
