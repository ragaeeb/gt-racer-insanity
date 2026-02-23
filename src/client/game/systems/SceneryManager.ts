import * as THREE from 'three';
import { canUseDOM } from '@/lib/canUseDOM';
import type { TrackThemeId } from '@/shared/game/track/trackManifest';

type SceneryThemePalette = {
    buildingColors: number[];
    buildingWindow: number;
    lightColor: number;
    lightEmissive: number;
    decorationPrimary: number;
    decorationSecondary: number;
};

const SCENERY_THEME_PALETTES: Record<TrackThemeId, SceneryThemePalette> = {
    'sunny-day': {
        buildingColors: [0x7a8a9a, 0x8899aa, 0x6b7b8b, 0xa0b0c0, 0x9098a0],
        buildingWindow: 0x88bbdd,
        lightColor: 0xffeecc,
        lightEmissive: 0xffcc88,
        decorationPrimary: 0xff6600,
        decorationSecondary: 0xcccccc,
    },
    'canyon-dusk': {
        buildingColors: [0x8b6b4a, 0x9a7a5a, 0x7a5b3a],
        buildingWindow: 0x554433,
        lightColor: 0xffaa66,
        lightEmissive: 0xff8844,
        decorationPrimary: 0x6b8b3a,
        decorationSecondary: 0xaa8866,
    },
};

type BuildingDescriptor = {
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
        return this.objects.length;
    };

    private createBuildingTexture = (
        width: number,
        height: number,
        baseColor: number,
        windowColor: number,
    ): THREE.CanvasTexture | null => {
        if (!canUseDOM) return null;
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const base = new THREE.Color(baseColor);
        ctx.fillStyle = `#${base.getHexString()}`;
        ctx.fillRect(0, 0, 64, 128);

        const win = new THREE.Color(windowColor);
        const cols = Math.max(2, Math.round(width / 4));
        const rows = Math.max(3, Math.round(height / 6));
        const cellW = 64 / cols;
        const cellH = 128 / rows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const lit = this.random() > 0.3;
                const brightness = lit ? 0.8 + this.random() * 0.2 : 0.15 + this.random() * 0.1;
                const wc = win.clone().multiplyScalar(brightness);
                ctx.fillStyle = `#${wc.getHexString()}`;
                const pad = 2;
                ctx.fillRect(c * cellW + pad, r * cellH + pad, cellW - pad * 2, cellH - pad * 2);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    };

    private placeCityBuildings = () => {
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

        if (buildings.length === 0) return;

        const colors = this.palette.buildingColors;
        for (const b of buildings) {
            const geo = new THREE.BoxGeometry(b.width, b.height, b.depth);
            this.geometries.push(geo);

            const colorIdx = Math.floor(this.random() * colors.length);
            const tex = this.createBuildingTexture(b.width, b.height, colors[colorIdx], this.palette.buildingWindow);

            const mat = new THREE.MeshStandardMaterial({
                color: colors[colorIdx],
                map: tex,
                metalness: 0.15,
                roughness: 0.7,
            });
            this.materials.push(mat);

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(b.x, b.height / 2, b.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.objects.push(mesh);
        }
    };

    private createBuildingCluster = (buildings: BuildingDescriptor[], x: number, z: number) => {
        const numBuildings = 1 + Math.floor(this.random() * 3);
        for (let i = 0; i < numBuildings; i++) {
            const width = 8 + this.random() * 12;
            const height = 15 + this.random() * 40;
            const depth = 8 + this.random() * 12;
            const offsetX = (this.random() - 0.5) * 10;
            const offsetZ = (this.random() - 0.5) * 10;
            buildings.push({ depth, height, width, x: x + offsetX, z: z + offsetZ });
        }
    };

    private placeStreetLights = () => {
        const halfWidth = this.trackWidth / 2;
        const count = Math.floor(this.trackLength / STREET_LIGHT_INTERVAL);

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

        for (let i = 0; i < count; i++) {
            const z = i * STREET_LIGHT_INTERVAL + 30;
            this.createStreetLight(-halfWidth - 4, z, poleGeo, poleMat, lightGeo, lightMat);
            this.createStreetLight(halfWidth + 4, z, poleGeo, poleMat, lightGeo, lightMat);
        }
    };

    private createStreetLight = (
        x: number,
        z: number,
        poleGeo: THREE.BufferGeometry,
        poleMat: THREE.Material,
        lightGeo: THREE.BufferGeometry,
        lightMat: THREE.Material,
    ) => {
        const group = new THREE.Group();

        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 4;
        group.add(pole);

        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.y = 8.2;
        group.add(light);

        group.position.set(x, 0, z);
        this.scene.add(group);
        this.objects.push(group);
    };

    private placeTrafficCones = () => {
        const halfWidth = this.trackWidth / 2;
        const coneGeo = new THREE.ConeGeometry(0.25, 0.6, 6);
        const coneMat = new THREE.MeshStandardMaterial({
            color: this.palette.decorationPrimary,
            roughness: 0.7,
        });
        this.geometries.push(coneGeo);
        this.materials.push(coneMat);

        const count = Math.floor(this.trackLength / 30);
        for (let i = 0; i < count; i++) {
            const z = i * 30 + this.random() * 15;
            const side = this.random() > 0.5 ? 1 : -1;
            const x = side * (halfWidth - 2 + this.random() * 2);
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.set(x, 0.3, z);
            this.scene.add(cone);
            this.objects.push(cone);
        }
    };

    private placeRockPillars = () => {
        const halfWidth = this.trackWidth / 2;
        const pillarGeo = new THREE.CylinderGeometry(1.5, 2.5, 1, 8);
        const pillarMat = new THREE.MeshStandardMaterial({
            color: this.palette.buildingBase,
            roughness: 0.9,
            metalness: 0.05,
        });
        this.geometries.push(pillarGeo);
        this.materials.push(pillarMat);

        const zones = Math.floor(this.trackLength / 50);
        for (let i = 0; i < zones; i++) {
            const z = i * 50 + this.random() * 25;
            const side = this.random() > 0.5 ? 1 : -1;
            const x = side * (halfWidth + 8 + this.random() * 15);
            const height = 8 + this.random() * 20;
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(x, height / 2, z);
            pillar.scale.set(1 + this.random(), height, 1 + this.random());
            pillar.castShadow = true;
            this.scene.add(pillar);
            this.objects.push(pillar);
        }
    };

    private placeMesaFormations = () => {
        const halfWidth = this.trackWidth / 2;
        const mesaGeo = new THREE.BoxGeometry(1, 1, 1);
        const mesaMat = new THREE.MeshStandardMaterial({
            color: this.palette.decorationSecondary,
            roughness: 0.85,
        });
        this.geometries.push(mesaGeo);
        this.materials.push(mesaMat);

        const zones = Math.floor(this.trackLength / 80);
        for (let i = 0; i < zones; i++) {
            const z = i * 80 + this.random() * 40;
            const side = this.random() > 0.5 ? 1 : -1;
            const x = side * (halfWidth + 20 + this.random() * 25);
            const width = 12 + this.random() * 20;
            const height = 5 + this.random() * 10;
            const depth = 10 + this.random() * 15;

            const mesa = new THREE.Mesh(mesaGeo, mesaMat);
            mesa.position.set(x, height / 2, z);
            mesa.scale.set(width, height, depth);
            mesa.castShadow = true;
            mesa.receiveShadow = true;
            this.scene.add(mesa);
            this.objects.push(mesa);
        }
    };

    public dispose = () => {
        for (const obj of this.objects) {
            this.scene.remove(obj);
            if (obj instanceof THREE.InstancedMesh) {
                obj.dispose();
            }
        }
        this.objects.length = 0;

        for (const geo of this.geometries) {
            geo.dispose();
        }
        this.geometries.length = 0;

        for (const mat of this.materials) {
            mat.dispose();
        }
        this.materials.length = 0;
    };
}
