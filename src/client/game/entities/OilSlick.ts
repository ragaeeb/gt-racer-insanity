import * as THREE from 'three';

const OIL_SLICK_HEIGHT_OFFSET = 0.01;

export class OilSlick {
    public readonly mesh: THREE.Mesh;

    constructor(x: number, z: number, radius: number) {
        const geometry = new THREE.CircleGeometry(radius, 20);
        const material = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.65,
            opacity: 0.78,
            roughness: 0.22,
            transparent: true,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(x, OIL_SLICK_HEIGHT_OFFSET, z);
        this.mesh.receiveShadow = true;
    }

    public setPosition = (x: number, z: number) => {
        this.mesh.position.set(x, OIL_SLICK_HEIGHT_OFFSET, z);
    };

    public dispose = () => {
        this.mesh.geometry.dispose();
        const material = this.mesh.material;
        if (Array.isArray(material)) {
            for (const entry of material) {
                entry.dispose();
            }
            return;
        }
        material.dispose();
    };
}
