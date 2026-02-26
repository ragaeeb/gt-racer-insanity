import * as THREE from 'three';
import type { TrackThemeId } from '@/shared/game/track/trackManifest';
import { SceneryLODManager } from './SceneryLODManager';
import type {
    BillboardDescriptor,
    BuildingDescriptor,
    CactusDescriptor,
    ConeDescriptor,
    MesaDescriptor,
    PillarDescriptor,
    SceneryThemePalette,
    StreetLightDescriptor,
} from './sceneryTypes';
import {
    BILLBOARD_INTERVAL,
    BUILDING_ZONE_INTERVAL,
    CACTUS_INTERVAL,
    LOD_DISTANCE_BILLBOARDS,
    LOD_DISTANCE_BUILDINGS,
    LOD_DISTANCE_CACTI,
    LOD_DISTANCE_MESAS,
    LOD_DISTANCE_ROCK_PILLARS,
    LOD_DISTANCE_STREET_LIGHTS,
    LOD_DISTANCE_TRAFFIC_CONES,
    SCENERY_THEME_PALETTES,
    STREET_LIGHT_INTERVAL,
    TRACK_EDGE_OFFSET,
} from './sceneryTypes';

const canUseDOM = typeof document !== 'undefined';

export class SceneryManager {
    private readonly objects: THREE.Object3D[] = [];
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly materials: THREE.Material[] = [];
    private readonly palette: SceneryThemePalette;
    private readonly lod = new SceneryLODManager();
    private buildingMaterials: THREE.MeshStandardMaterial[] = [];
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

    public getObjectCount = (): number => this.logicalObjectCount;

    public getLODGroupCount = (): number => this.lod.getGroupCount();

    /** Call once per frame from the render loop. */
    public update = (camera: THREE.Camera): void => this.lod.update(camera);

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
        this.lod.clear();
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

    // ── Placement helpers ─────────────────────────────────────────────────────

    private addInstancedMesh = (mesh: THREE.InstancedMesh): void => {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
        this.objects.push(mesh);
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

        const byMaterial = new Map<number, BuildingDescriptor[]>();
        for (const b of buildings) {
            const group = byMaterial.get(b.materialIndex) ?? [];
            group.push(b);
            byMaterial.set(b.materialIndex, group);
        }

        const matrix = new THREE.Matrix4();
        for (const [matIdx, group] of byMaterial) {
            if (group.length === 0) {
                continue;
            }
            const mat = this.buildingMaterials[matIdx];
            if (!mat) {
                continue;
            }

            const mesh = new THREE.InstancedMesh(unitGeo, mat, group.length);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = true;

            for (let i = 0; i < group.length; i++) {
                const b = group[i];
                matrix.compose(
                    new THREE.Vector3(b.x, b.height / 2, b.z),
                    new THREE.Quaternion(),
                    new THREE.Vector3(b.width, b.height, b.depth),
                );
                mesh.setMatrixAt(i, matrix);
            }

            this.addInstancedMesh(mesh);
            this.lod.register(
                mesh,
                LOD_DISTANCE_BUILDINGS,
                group.map((b) => ({ x: b.x, z: b.z })),
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
            const materialIndex = Math.floor(this.random() * this.buildingMaterials.length);
            buildings.push({ depth, height, materialIndex, width, x: x + offsetX, z: z + offsetZ });
        }
    };

    private createSharedBuildingMaterials = () => {
        const { buildingColors, buildingWindow } = this.palette;

        let texSeed = 0.6180339887;
        const texRandom = () => {
            texSeed = (texSeed * 16807 + 0.5) % 1;
            return texSeed;
        };

        for (const baseColor of buildingColors) {
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

                    const win = new THREE.Color(buildingWindow);
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

            const mat = new THREE.MeshStandardMaterial({ color: baseColor, map: tex, metalness: 0.15, roughness: 0.7 });
            this.buildingMaterials.push(mat);
            this.materials.push(mat);
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

        const lights: StreetLightDescriptor[] = [];
        for (let i = 0; i < count; i++) {
            const z = i * STREET_LIGHT_INTERVAL + 30;
            lights.push({ x: -halfWidth - 4, z });
            lights.push({ x: halfWidth + 4, z });
        }

        const poleMatrix = new THREE.Matrix4();
        const polesMesh = new THREE.InstancedMesh(poleGeo, poleMat, lights.length);
        polesMesh.castShadow = true;
        polesMesh.receiveShadow = true;
        polesMesh.frustumCulled = true;

        const bulbMatrix = new THREE.Matrix4();
        const bulbsMesh = new THREE.InstancedMesh(lightGeo, lightMat, lights.length);
        bulbsMesh.castShadow = false;
        bulbsMesh.receiveShadow = false;
        bulbsMesh.frustumCulled = true;

        for (let i = 0; i < lights.length; i++) {
            const light = lights[i];
            poleMatrix.compose(
                new THREE.Vector3(light.x, 4, light.z),
                new THREE.Quaternion(),
                new THREE.Vector3(1, 1, 1),
            );
            polesMesh.setMatrixAt(i, poleMatrix);
            bulbMatrix.compose(
                new THREE.Vector3(light.x, 8.2, light.z),
                new THREE.Quaternion(),
                new THREE.Vector3(1, 1, 1),
            );
            bulbsMesh.setMatrixAt(i, bulbMatrix);
        }

        this.addInstancedMesh(polesMesh);
        this.addInstancedMesh(bulbsMesh);

        const lightPoints = lights.map((l) => ({ x: l.x, z: l.z }));
        this.lod.register(polesMesh, LOD_DISTANCE_STREET_LIGHTS, lightPoints);
        this.lod.register(bulbsMesh, LOD_DISTANCE_STREET_LIGHTS, lightPoints);

        this.logicalObjectCount += lights.length;
    };

    private placeTrafficCones = () => {
        const halfWidth = this.trackWidth / 2;
        const count = Math.floor(this.trackLength / 30);
        if (count === 0) {
            return;
        }

        const coneGeo = new THREE.ConeGeometry(0.25, 0.6, 6);
        const coneMat = new THREE.MeshStandardMaterial({ color: this.palette.decorationPrimary, roughness: 0.7 });
        this.geometries.push(coneGeo);
        this.materials.push(coneMat);

        const cones: ConeDescriptor[] = [];
        for (let i = 0; i < count; i++) {
            const z = i * 30 + this.random() * 15;
            const side = this.random() > 0.5 ? 1 : -1;
            const x = side * (halfWidth - 2 + this.random() * 2);
            cones.push({ x, y: 0.3, z });
        }

        const mesh = new THREE.InstancedMesh(coneGeo, coneMat, cones.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        for (let i = 0; i < cones.length; i++) {
            const c = cones[i];
            matrix.compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
            mesh.setMatrixAt(i, matrix);
        }

        this.addInstancedMesh(mesh);
        this.lod.register(
            mesh,
            LOD_DISTANCE_TRAFFIC_CONES,
            cones.map((c) => ({ x: c.x, z: c.z })),
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

        const mesh = new THREE.InstancedMesh(pillarGeo, pillarMat, pillars.length);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        for (let i = 0; i < pillars.length; i++) {
            const p = pillars[i];
            matrix.compose(
                new THREE.Vector3(p.x, p.height / 2, p.z),
                new THREE.Quaternion(),
                new THREE.Vector3(p.scaleX, p.height, p.scaleZ),
            );
            mesh.setMatrixAt(i, matrix);
        }

        this.addInstancedMesh(mesh);
        this.lod.register(
            mesh,
            LOD_DISTANCE_ROCK_PILLARS,
            pillars.map((p) => ({ x: p.x, z: p.z })),
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
        const mesaMat = new THREE.MeshStandardMaterial({ color: this.palette.decorationSecondary, roughness: 0.85 });
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

        const mesh = new THREE.InstancedMesh(mesaGeo, mesaMat, mesas.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        for (let i = 0; i < mesas.length; i++) {
            const m = mesas[i];
            matrix.compose(
                new THREE.Vector3(m.x, m.height / 2, m.z),
                new THREE.Quaternion(),
                new THREE.Vector3(m.width, m.height, m.depth),
            );
            mesh.setMatrixAt(i, matrix);
        }

        this.addInstancedMesh(mesh);
        this.lod.register(
            mesh,
            LOD_DISTANCE_MESAS,
            mesas.map((m) => ({ x: m.x, z: m.z })),
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
            metalness: 0.25,
            roughness: 0.35,
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

        const mesh = new THREE.InstancedMesh(billboardGeo, billboardMat, billboards.length);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        for (let i = 0; i < billboards.length; i++) {
            const b = billboards[i];
            matrix.compose(new THREE.Vector3(b.x, b.height, b.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
            mesh.setMatrixAt(i, matrix);
        }

        this.addInstancedMesh(mesh);
        this.lod.register(
            mesh,
            LOD_DISTANCE_BILLBOARDS,
            billboards.map((b) => ({ x: b.x, z: b.z })),
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
            cacti.push({
                armHeight: 1.1 + this.random() * 1.8,
                hasSecondArm: this.random() > 0.35,
                height: 2.8 + this.random() * 3.8,
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

        const rightArmCount = cacti.filter((c) => c.hasSecondArm).length;
        const rightArmMesh = new THREE.InstancedMesh(armGeo, armMat, rightArmCount);
        rightArmMesh.castShadow = true;
        rightArmMesh.receiveShadow = false;
        rightArmMesh.frustumCulled = true;

        const matrix = new THREE.Matrix4();
        const leftArmQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
        const rightArmQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));

        let rightArmIndex = 0;
        const rightArmPoints: Array<{ x: number; z: number }> = [];
        for (let i = 0; i < cacti.length; i++) {
            const c = cacti[i];
            matrix.compose(
                new THREE.Vector3(c.x, c.height / 2, c.z),
                new THREE.Quaternion(),
                new THREE.Vector3(1, c.height, 1),
            );
            trunkMesh.setMatrixAt(i, matrix);

            matrix.compose(
                new THREE.Vector3(c.x - 0.48, c.armHeight, c.z),
                leftArmQuat,
                new THREE.Vector3(1, 0.95 + this.random() * 0.45, 1),
            );
            leftArmMesh.setMatrixAt(i, matrix);

            if (c.hasSecondArm) {
                matrix.compose(
                    new THREE.Vector3(c.x + 0.48, c.armHeight + 0.35, c.z),
                    rightArmQuat,
                    new THREE.Vector3(1, 0.8 + this.random() * 0.4, 1),
                );
                rightArmMesh.setMatrixAt(rightArmIndex, matrix);
                rightArmPoints.push({ x: c.x, z: c.z });
                rightArmIndex += 1;
            }
        }

        this.addInstancedMesh(trunkMesh);
        this.addInstancedMesh(leftArmMesh);
        this.addInstancedMesh(rightArmMesh);

        const cactiPoints = cacti.map((c) => ({ x: c.x, z: c.z }));
        this.lod.register(trunkMesh, LOD_DISTANCE_CACTI, cactiPoints, 180);
        this.lod.register(leftArmMesh, LOD_DISTANCE_CACTI, cactiPoints, 180);
        this.lod.register(rightArmMesh, LOD_DISTANCE_CACTI, rightArmPoints, 180);

        this.logicalObjectCount += cacti.length;
    };
}
