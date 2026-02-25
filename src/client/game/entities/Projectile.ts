import * as THREE from 'three';

const PROJECTILE_Y = 1;
const SPHERE_RADIUS = 0.3;
const SPHERE_SEGMENTS = 8;
const TRAIL_LENGTH = 2;
const TRAIL_OPACITY = 0.5;
const EMISSIVE_INTENSITY = 2;
const CYAN = 0x00ffff;

export class Projectile {
    public readonly mesh: THREE.Mesh;
    private readonly trail: THREE.Line;

    constructor(x: number, z: number) {
        const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
        const material = new THREE.MeshStandardMaterial({
            color: CYAN,
            emissive: CYAN,
            emissiveIntensity: EMISSIVE_INTENSITY,
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, PROJECTILE_Y, z);

        // Trail line behind the projectile
        const trailGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -TRAIL_LENGTH),
        ]);
        const trailMat = new THREE.LineBasicMaterial({
            color: CYAN,
            opacity: TRAIL_OPACITY,
            transparent: true,
        });
        this.trail = new THREE.Line(trailGeo, trailMat);
        this.mesh.add(this.trail);
    }

    public update = (x: number, z: number) => {
        this.mesh.position.set(x, PROJECTILE_Y, z);
    };

    public dispose = () => {
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
        this.trail.geometry.dispose();
        (this.trail.material as THREE.Material).dispose();
    };
}
