import * as THREE from 'three';
import {
    getTrackManifestById,
    type TrackId,
    type TrackThemeId,
} from '@/shared/game/track/trackManifest';
import { seededRandom } from '@/shared/utils/prng';

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

export class TrackManager {
    public segments: TrackSegment[] = [];
    private trackWidth = 76;
    private seed: number = 12345;
    private random: () => number = Math.random;
    private readonly activeObstacles: THREE.Mesh[] = [];
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
        trackId = 'sunset-loop'
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

    private createSegment = (segmentLength: number, zStart: number, safe: boolean): TrackSegment => {
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

        const obstacles: THREE.Mesh[] = [];
        if (!safe) {
            const numObstacles = Math.floor(this.random() * 4) + 2;
            for (let i = 0; i < numObstacles; i++) {
                const obsSize = this.random() * 3 + 2;
                const obsGeo = new THREE.BoxGeometry(obsSize, obsSize, obsSize);
                const obs = new THREE.Mesh(obsGeo, this.obstacleMat);
                const posX = (this.random() - 0.5) * (this.trackWidth - obsSize * 2);
                const posZ = (this.random() - 0.5) * segmentLength;
                obs.position.set(posX, obsSize / 2, posZ);
                obs.castShadow = true;
                obs.receiveShadow = true;
                group.add(obs);
                obstacles.push(obs);
            }
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
        let zCursor = 0;
        this.segments = [];

        for (let lapIndex = 0; lapIndex < this.totalLaps; lapIndex += 1) {
            for (let segmentIndex = 0; segmentIndex < trackManifest.segments.length; segmentIndex += 1) {
                const segment = trackManifest.segments[segmentIndex];
                const builtSegment = this.createSegment(
                    segment.lengthMeters,
                    zCursor,
                    lapIndex === 0 && segmentIndex === 0
                );
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
        }
    };

    public setSeed = (seed: number) => {
        this.seed = seed;
        this.random = seededRandom(this.seed);
        this.reset();
    };

    public setTrack = (trackId: string) => {
        this.trackId = getTrackManifestById(trackId).id;
        this.reset();
    };

    public update = (_carZ: number) => {
        // Finite tracks are static by design in v2.
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

    public reset = () => {
        for (const segment of this.segments) {
            this.disposeSegment(segment);
        }
        this.segments = [];
        this.random = seededRandom(this.seed);
        this.buildFiniteTrack();
    };

    public dispose = () => {
        for (const segment of this.segments) {
            this.disposeSegment(segment);
        }
        this.segments = [];
        this.activeObstacles.length = 0;
        this.disposeSharedMaterials();
    };
}
