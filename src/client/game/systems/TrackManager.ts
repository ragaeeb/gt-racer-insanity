import * as THREE from 'three';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';
import { seededRandom } from '@/shared/utils/prng';

type TrackSegment = {
    mesh: THREE.Group;
    obstacles: THREE.Mesh[];
    zEnd: number;
    zStart: number;
};

export class TrackManager {
    public segments: TrackSegment[] = [];
    private trackWidth = 80;
    private seed: number = 12345;
    private random: () => number = Math.random;
    private readonly activeObstacles: THREE.Mesh[] = [];
    private trackId = 'sunset-loop';
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
        this.trackId = trackId;
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

    private createSegment = (
        segmentLength: number,
        zStart: number,
        safe: boolean
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
        this.totalLaps = trackManifest.totalLaps;
        let zCursor = 0;
        this.segments = trackManifest.segments.map((segment, index) => {
            const builtSegment = this.createSegment(segment.lengthMeters, zCursor, index === 0);
            zCursor += segment.lengthMeters;
            return builtSegment;
        });

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
        this.trackId = trackId;
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
