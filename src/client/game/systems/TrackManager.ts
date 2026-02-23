import * as THREE from 'three';
import {
    DEFAULT_TRACK_WIDTH_METERS,
    getTrackManifestById,
    type TrackId,
    type TrackThemeId,
} from '@/shared/game/track/trackManifest';
import type { SnapshotHazardState, SnapshotPowerupState } from '@/shared/network/snapshot';
import { generateTrackObstacles, type ObstacleDescriptor } from '@/shared/game/track/trackObstacles';

type TrackSegment = {
    mesh: THREE.Group;
    obstacles: THREE.Mesh[];
    zEnd: number;
    zStart: number;
};

type TrackPalette = {
    line: number;
    obstacle: number;
    obstacleEmissive: number;
    road: number;
    wall: number;
    wallEmissive: number;
};

const TRACK_THEME_PALETTES: Record<TrackThemeId, TrackPalette> = {
    'canyon-dusk': {
        line: 0xffd8a8,
        obstacle: 0xc04c35,
        obstacleEmissive: 0x4d1f14,
        road: 0x473541,
        wall: 0xbe6d45,
        wallEmissive: 0x542d1e,
    },
    'sunny-day': {
        line: 0xf9f4dc,
        obstacle: 0xff6f5d,
        obstacleEmissive: 0x5a1f16,
        road: 0x4f5f6d,
        wall: 0x0dc2d4,
        wallEmissive: 0x084a51,
    },
};

const canUseDOM = typeof document !== 'undefined';

const createCheckerBannerMaterial = (): THREE.MeshStandardMaterial => {
    if (!canUseDOM) {
        return new THREE.MeshStandardMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const checkSize = 32;
    for (let r = 0; r < canvas.height / checkSize; r++) {
        for (let c = 0; c < canvas.width / checkSize; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#000' : '#fff';
            ctx.fillRect(c * checkSize, r * checkSize, checkSize, checkSize);
        }
    }

    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff0000';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeText('FINISH', canvas.width / 2, canvas.height / 2);
    ctx.fillText('FINISH', canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, transparent: true });
};

const createCheckerFlagMaterial = (): THREE.MeshStandardMaterial => {
    if (!canUseDOM) {
        return new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    }

    const flagCanvas = document.createElement('canvas');
    flagCanvas.width = 128;
    flagCanvas.height = 96;
    const fctx = flagCanvas.getContext('2d')!;
    const fcheck = 16;
    for (let r = 0; r < flagCanvas.height / fcheck; r++) {
        for (let c = 0; c < flagCanvas.width / fcheck; c++) {
            fctx.fillStyle = (r + c) % 2 === 0 ? '#000' : '#fff';
            fctx.fillRect(c * fcheck, r * fcheck, fcheck, fcheck);
        }
    }

    const flagTexture = new THREE.CanvasTexture(flagCanvas);
    return new THREE.MeshStandardMaterial({ map: flagTexture, side: THREE.DoubleSide });
};

export class TrackManager {
    public segments: TrackSegment[] = [];
    public finishLineGroup: THREE.Group | null = null;
    private trackWidth = DEFAULT_TRACK_WIDTH_METERS;
    private seed: number = 12345;
    private readonly activeObstacles: THREE.Mesh[] = [];
    private readonly flags: THREE.Mesh[] = [];
    private readonly hazardVisuals = new Map<string, THREE.Group>();
    private readonly powerupVisuals = new Map<string, THREE.Group>();
    private trackId: TrackId = 'sunset-loop';
    private totalLaps = 1;

    private roadMat = new THREE.MeshStandardMaterial({
        color: 0x4f5f6d,
        metalness: 0.04,
        roughness: 0.78,
    });
    private lineMat = new THREE.MeshStandardMaterial({ color: 0xf9f4dc, roughness: 0.92 });
    private wallMat = new THREE.MeshStandardMaterial({ color: 0x0dc2d4, emissive: 0x084a51 });
    private obstacleMat = new THREE.MeshStandardMaterial({ color: 0xff6f5d, emissive: 0x5a1f16 });

    constructor(
        private scene: THREE.Scene,
        seed: number,
        trackId: TrackId = 'sunset-loop'
    ) {
        this.trackId = getTrackManifestById(trackId).id;
        this.setSeed(seed);
    }

    private disposeSegment = (segment: TrackSegment) => {
        this.scene.remove(segment.mesh);
        const segmentGeometries = new Set<THREE.BufferGeometry>();

        segment.mesh.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            segmentGeometries.add(child.geometry);
        });

        for (const geometry of segmentGeometries) {
            geometry.dispose();
        }
    };

    private disposeSharedMaterials = () => {
        this.roadMat.dispose();
        this.lineMat.dispose();
        this.wallMat.dispose();
        this.obstacleMat.dispose();
    };

    private applyTrackPalette = (trackThemeId: TrackThemeId) => {
        const palette = TRACK_THEME_PALETTES[trackThemeId];
        this.roadMat.color.setHex(palette.road);
        this.lineMat.color.setHex(palette.line);
        this.wallMat.color.setHex(palette.wall);
        this.wallMat.emissive.setHex(palette.wallEmissive);
        this.obstacleMat.color.setHex(palette.obstacle);
        this.obstacleMat.emissive.setHex(palette.obstacleEmissive);
    };

    private createSegment = (
        segmentLength: number,
        zStart: number,
        obstacleDescriptors: ObstacleDescriptor[],
    ): TrackSegment => {
        const group = new THREE.Group();
        group.position.z = zStart + segmentLength / 2;

        const roadGeo = new THREE.PlaneGeometry(this.trackWidth, segmentLength);
        const road = new THREE.Mesh(roadGeo, this.roadMat);
        road.rotation.x = -Math.PI / 2;
        road.receiveShadow = true;
        group.add(road);

        const dashedLines = Math.max(4, Math.round(segmentLength / 24));
        const lineLen = segmentLength / dashedLines / 2;
        for (let i = 0; i < dashedLines; i++) {
            const lineGeo = new THREE.PlaneGeometry(1.5, lineLen);
            const line = new THREE.Mesh(lineGeo, this.lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.z = -segmentLength / 2 + i * (segmentLength / dashedLines) + lineLen;
            line.position.y = 0.05;
            line.receiveShadow = true;
            group.add(line);
        }

        const wallGeo = new THREE.BoxGeometry(2, 4, segmentLength);
        const leftWall = new THREE.Mesh(wallGeo, this.wallMat);
        leftWall.position.set(-this.trackWidth / 2 - 1, 2, 0);
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;

        const rightWall = new THREE.Mesh(wallGeo, this.wallMat);
        rightWall.position.set(this.trackWidth / 2 + 1, 2, 0);
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;

        group.add(leftWall);
        group.add(rightWall);

        const segmentCenterZ = zStart + segmentLength / 2;
        const obstacles: THREE.Mesh[] = [];
        for (const desc of obstacleDescriptors) {
            const obsSize = desc.halfSize * 2;
            const obsGeo = new THREE.BoxGeometry(obsSize, obsSize, obsSize);
            const obs = new THREE.Mesh(obsGeo, this.obstacleMat);
            obs.position.set(desc.positionX, desc.halfSize, desc.positionZ - segmentCenterZ);
            obs.castShadow = true;
            obs.receiveShadow = true;
            group.add(obs);
            obstacles.push(obs);
        }

        this.scene.add(group);
        return {
            mesh: group,
            obstacles,
            zEnd: zStart + segmentLength,
            zStart,
        };
    };

    private buildFiniteTrack = () => {
        const trackManifest = getTrackManifestById(this.trackId);
        this.applyTrackPalette(trackManifest.themeId);
        this.totalLaps = trackManifest.totalLaps;
        this.segments = [];

        const layout = generateTrackObstacles(this.trackId, this.seed, this.totalLaps, this.trackWidth);
        const sortedObstacles = layout.obstacles;

        let zCursor = 0;
        let obsCursor = 0;
        for (let lapIndex = 0; lapIndex < this.totalLaps; lapIndex += 1) {
            for (let segmentIndex = 0; segmentIndex < trackManifest.segments.length; segmentIndex += 1) {
                const segment = trackManifest.segments[segmentIndex];
                const segmentZEnd = zCursor + segment.lengthMeters;

                const segmentObstacles: ObstacleDescriptor[] = [];
                while (obsCursor < sortedObstacles.length && sortedObstacles[obsCursor].positionZ < segmentZEnd) {
                    if (sortedObstacles[obsCursor].positionZ >= zCursor) {
                        segmentObstacles.push(sortedObstacles[obsCursor]);
                    }
                    obsCursor++;
                }

                const builtSegment = this.createSegment(segment.lengthMeters, zCursor, segmentObstacles);
                this.segments.push(builtSegment);
                zCursor += segment.lengthMeters;
            }
        }

        const lastSegment = this.segments[this.segments.length - 1];
        if (lastSegment) {
            const endBarrierGeo = new THREE.BoxGeometry(this.trackWidth, 4, 1.5);
            const endBarrier = new THREE.Mesh(endBarrierGeo, this.wallMat);
            endBarrier.position.set(0, 2, (lastSegment.zEnd - lastSegment.zStart) / 2 - 0.75);
            endBarrier.castShadow = true;
            endBarrier.receiveShadow = true;
            lastSegment.mesh.add(endBarrier);
            lastSegment.obstacles.push(endBarrier);

            this.createFinishLine(lastSegment.zEnd - 10);
        }
    };

    private createFinishLine = (zPosition: number) => {
        const group = new THREE.Group();
        group.position.set(0, 0, zPosition);
        group.name = 'finish-line';

        const stripWidth = this.trackWidth;
        const stripDepth = 4;
        const checkerSize = 2;
        const rows = Math.ceil(stripDepth / checkerSize);
        const cols = Math.ceil(stripWidth / checkerSize);

        const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

        const tileGeo = new THREE.PlaneGeometry(checkerSize, checkerSize);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const tile = new THREE.Mesh(tileGeo, (r + c) % 2 === 0 ? blackMat : whiteMat);
                tile.rotation.x = -Math.PI / 2;
                tile.position.set(
                    -stripWidth / 2 + c * checkerSize + checkerSize / 2,
                    0.06,
                    -stripDepth / 2 + r * checkerSize + checkerSize / 2,
                );
                group.add(tile);
            }
        }

        this.createFinishGantry(group, stripWidth);
        this.createFlag(group, -stripWidth / 2 - 2, 8);
        this.createFlag(group, stripWidth / 2 + 2, 8);

        this.scene.add(group);
        this.finishLineGroup = group;
    };

    private createFinishGantry = (parent: THREE.Group, width: number) => {
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.3 });
        const poleGeo = new THREE.CylinderGeometry(0.3, 0.3, 10, 8);

        const leftPole = new THREE.Mesh(poleGeo, poleMat);
        leftPole.position.set(-width / 2 - 1, 5, 0);
        leftPole.castShadow = true;
        parent.add(leftPole);

        const rightPole = new THREE.Mesh(poleGeo, poleMat);
        rightPole.position.set(width / 2 + 1, 5, 0);
        rightPole.castShadow = true;
        parent.add(rightPole);

        const barGeo = new THREE.BoxGeometry(width + 4, 0.5, 1);
        const barMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.y = 10;
        bar.castShadow = true;
        parent.add(bar);

        const bannerGeo = new THREE.PlaneGeometry(width + 2, 3);
        const bannerMat = createCheckerBannerMaterial();
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.y = 7.5;
        banner.name = 'finish-banner';
        parent.add(banner);
    };

    private createFlag = (parent: THREE.Group, x: number, height: number) => {
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5, roughness: 0.4 });
        const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, height, 6);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, height / 2, 0);
        pole.castShadow = true;
        parent.add(pole);

        const flagGeo = new THREE.PlaneGeometry(3, 2, 8, 1);
        const flagMat = createCheckerFlagMaterial();
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(x + 1.5, height - 1, 0);
        flag.name = 'finish-flag';
        parent.add(flag);

        this.flags.push(flag);
    };

    private createSpikeStrip = (x: number, z: number): THREE.Group => {
        const group = new THREE.Group();
        group.position.set(x, 0.01, z);
        group.name = 'spike-strip';

        const stripGeo = new THREE.BoxGeometry(5, 0.1, 2);
        const stripMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 });
        const strip = new THREE.Mesh(stripGeo, stripMat);
        strip.position.y = 0.05;
        group.add(strip);

        const spikeGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
        const spikeMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            emissive: 0x331111,
            emissiveIntensity: 0.5,
            metalness: 0.9,
            roughness: 0.2,
        });

        for (let row = -1; row <= 1; row++) {
            for (let col = -5; col <= 5; col++) {
                const spike = new THREE.Mesh(spikeGeo, spikeMat);
                spike.position.set(col * 0.4, 0.3, row * 0.5);
                group.add(spike);
            }
        }

        const warningGeo = new THREE.PlaneGeometry(5, 1);
        const warningMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.9 });
        const warning = new THREE.Mesh(warningGeo, warningMat);
        warning.rotation.x = -Math.PI / 2;
        warning.position.set(0, 0.03, -2.5);
        group.add(warning);

        return group;
    };

    private createPowerupOrb = (x: number, z: number): THREE.Group => {
        const group = new THREE.Group();
        group.position.set(x, 1.5, z);
        group.name = 'powerup-orb';

        const orbGeo = new THREE.SphereGeometry(0.8, 16, 16);
        const orbMat = new THREE.MeshStandardMaterial({
            color: 0x00aaff,
            emissive: 0x0055ff,
            emissiveIntensity: 2,
            toneMapped: false,
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        group.add(orb);

        const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 32);
        const ringMat = new THREE.MeshStandardMaterial({
            color: 0x00ccff,
            emissive: 0x0088ff,
            emissiveIntensity: 1.5,
            opacity: 0.6,
            toneMapped: false,
            transparent: true,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        return group;
    };

    public syncPowerups = (powerups: SnapshotPowerupState[]) => {
        for (const powerup of powerups) {
            let visual = this.powerupVisuals.get(powerup.id);
            if (!visual) {
                visual = this.createPowerupOrb(powerup.x, powerup.z);
                this.scene.add(visual);
                this.powerupVisuals.set(powerup.id, visual);
            }
            visual.visible = powerup.isActive;
        }
    };

    public syncHazards = (hazards: SnapshotHazardState[]) => {
        for (const hazard of hazards) {
            if (this.hazardVisuals.has(hazard.id)) {
                continue;
            }
            const visual = this.createSpikeStrip(hazard.x, hazard.z);
            this.scene.add(visual);
            this.hazardVisuals.set(hazard.id, visual);
        }
    };

    private disposePowerupsAndHazards = () => {
        for (const visual of this.powerupVisuals.values()) {
            this.scene.remove(visual);
            visual.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (child.material instanceof THREE.Material) {
                        child.material.dispose();
                    }
                }
            });
        }
        this.powerupVisuals.clear();

        for (const visual of this.hazardVisuals.values()) {
            this.scene.remove(visual);
            visual.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (child.material instanceof THREE.Material) {
                        child.material.dispose();
                    }
                }
            });
        }
        this.hazardVisuals.clear();
    };

    public setSeed = (seed: number) => {
        this.seed = seed;
        this.reset();
    };

    public setTrack = (trackId: string) => {
        this.trackId = getTrackManifestById(trackId).id;
        this.reset();
    };

    public update = (_carZ: number, dt = 1 / 60) => {
        const time = performance.now() * 0.003;
        for (const flag of this.flags) {
            const positions = flag.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const x = positions.getX(i);
                positions.setZ(i, Math.sin(x * 2 + time) * 0.3);
            }
            positions.needsUpdate = true;
        }

        for (const visual of this.powerupVisuals.values()) {
            if (!visual.visible) {
                continue;
            }
            visual.rotation.y += 2 * dt;
            visual.position.y = 1.5 + Math.sin(time) * 0.3;
        }
    };

    public getTrackLengthMeters = () => {
        return getTrackManifestById(this.trackId).lengthMeters;
    };

    public getTotalLaps = () => {
        return this.totalLaps;
    };

    public getRaceDistanceMeters = () => {
        return this.getTrackLengthMeters() * this.totalLaps;
    };

    public getTrackId = () => {
        return this.trackId;
    };

    public getActiveObstacles = (): THREE.Mesh[] => {
        this.activeObstacles.length = 0;
        for (const segment of this.segments) {
            this.activeObstacles.push(...segment.obstacles);
        }
        return this.activeObstacles;
    };

    private disposeFinishLine = () => {
        if (!this.finishLineGroup) {
            return;
        }
        this.scene.remove(this.finishLineGroup);
        this.finishLineGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of materials) {
                    if (mat instanceof THREE.MeshStandardMaterial && mat.map) {
                        mat.map.dispose();
                    }
                    if (mat instanceof THREE.Material) {
                        mat.dispose();
                    }
                }
            }
        });
        this.finishLineGroup = null;
        this.flags.length = 0;
    };

    public reset = () => {
        for (const segment of this.segments) {
            this.disposeSegment(segment);
        }
        this.disposeFinishLine();
        this.disposePowerupsAndHazards();
        this.segments = [];
        this.buildFiniteTrack();
    };

    public dispose = () => {
        for (const segment of this.segments) {
            this.disposeSegment(segment);
        }
        this.disposeFinishLine();
        this.disposePowerupsAndHazards();
        this.segments = [];
        this.activeObstacles.length = 0;
        this.disposeSharedMaterials();
    };
}
