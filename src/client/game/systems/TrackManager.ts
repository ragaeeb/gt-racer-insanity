import * as THREE from 'three';
import { seededRandom } from '@/shared/utils/prng';

type TrackSegment = {
    mesh: THREE.Group;
    zEnd: number;
    obstacles: THREE.Mesh[];
};

export class TrackManager {
    public segments: TrackSegment[] = [];
    private segmentLength: number = 200;
    private trackWidth: number = 80;
    private spawnZ: number = 0;
    private removeDistance: number = 100;
    private seed: number = 12345;
    private random: () => number = Math.random;
    private readonly activeObstacles: THREE.Mesh[] = [];

    // Materials
    private roadMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    private lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0 });
    private wallMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x003322 });
    private obstacleMat = new THREE.MeshStandardMaterial({ color: 0xff0055, emissive: 0x550011 });

    constructor(private scene: THREE.Scene, seed: number) {
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

    public setSeed(seed: number) {
        this.seed = seed;
        this.random = seededRandom(this.seed);
        this.reset();
    }

    private spawnSegment(safe: boolean = false) {
        const group = new THREE.Group();
        group.position.z = this.spawnZ + this.segmentLength / 2; // Center of segment

        // Road Surface
        const roadGeo = new THREE.PlaneGeometry(this.trackWidth, this.segmentLength);
        const road = new THREE.Mesh(roadGeo, this.roadMat);
        road.rotation.x = -Math.PI / 2;
        road.receiveShadow = true;
        group.add(road);

        // Center dashed line
        const dashedLines = 10;
        const lineLen = this.segmentLength / dashedLines / 2;
        for (let i = 0; i < dashedLines; i++) {
            const lineGeo = new THREE.PlaneGeometry(1.5, lineLen);
            const line = new THREE.Mesh(lineGeo, this.lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.z = -this.segmentLength / 2 + i * (this.segmentLength / dashedLines) + lineLen;
            line.position.y = 0.05; // Slightly above road
            line.receiveShadow = true;
            group.add(line);
        }

        // Walls
        const wallGeo = new THREE.BoxGeometry(2, 4, this.segmentLength);
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

        // Obstacles
        if (!safe) {
            const numObstacles = Math.floor(this.random() * 5) + 3; // 3 to 7 obstacles per segment
            for (let i = 0; i < numObstacles; i++) {
                const obsSize = this.random() * 3 + 2; // 2 to 5 units
                const obsGeo = new THREE.BoxGeometry(obsSize, obsSize, obsSize);
                const obs = new THREE.Mesh(obsGeo, this.obstacleMat);

                // Random position within track bounds
                const posX = (this.random() - 0.5) * (this.trackWidth - obsSize * 2);
                const posZ = (this.random() - 0.5) * this.segmentLength;

                obs.position.set(posX, obsSize / 2, posZ);
                obs.castShadow = true;
                obs.receiveShadow = true;

                group.add(obs);

                // We need global position for collision, but we will compute it dynamically
                obstacles.push(obs);
            }
        }

        this.scene.add(group);

        this.segments.push({
            mesh: group,
            zEnd: this.spawnZ + this.segmentLength, // Track end boundary in global z
            obstacles: obstacles
        });

        this.spawnZ += this.segmentLength;
    }

    public update(carZ: number) {
        // Check if we need to spawn new segments ahead
        const farthestVisibleZ = carZ + this.segmentLength * 3;
        if (this.spawnZ < farthestVisibleZ) {
            this.spawnSegment();
        }

        // Check if we need to remove old segments behind
        if (this.segments.length > 0) {
            const oldestSegment = this.segments[0];
            if (carZ > oldestSegment.zEnd + this.removeDistance) {
                // Remove from scene and free memory
                this.disposeSegment(oldestSegment);
                this.segments.shift(); // Remove from array
            }
        }
    }

    public getActiveObstacles(): THREE.Mesh[] {
        this.activeObstacles.length = 0;
        for (const seg of this.segments) {
            for (const obstacle of seg.obstacles) {
                this.activeObstacles.push(obstacle);
            }
        }
        return this.activeObstacles;
    }

    public reset() {
        // Remove all segments
        for (const seg of this.segments) {
            this.disposeSegment(seg);
        }
        this.segments = [];
        this.spawnZ = 0;
        this.random = seededRandom(this.seed); // reset generator sequence

        // Respawn initial
        for (let i = 0; i < 5; i++) {
            this.spawnSegment(i === 0);
        }
    }

    public dispose() {
        for (const segment of this.segments) {
            this.disposeSegment(segment);
        }
        this.segments = [];
        this.activeObstacles.length = 0;
        this.disposeSharedMaterials();
    }
}
