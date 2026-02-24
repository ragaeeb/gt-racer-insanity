import * as THREE from 'three';

export class CarVisual {
    public applyTransform = (
        mesh: THREE.Group,
        position: THREE.Vector3,
        rotationY: number,
    ) => {
        mesh.position.copy(position);
        mesh.rotation.set(0, rotationY, 0, 'YXZ');
    };
}
