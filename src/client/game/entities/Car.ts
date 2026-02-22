import * as THREE from 'three';
import { stepCarMotion } from '../../../shared/game/carPhysics';
import { InputManager } from '../systems/InputManager';

export type CarAssets = {
    engine?: AudioBuffer;
    accelerate?: AudioBuffer;
    carModel?: THREE.Group;
};

export class Car {
    public mesh: THREE.Group;
    public position: THREE.Vector3;
    public rotationY: number = 0;

    // Multiplayer Targets for lerping
    public targetPosition: THREE.Vector3 = new THREE.Vector3();
    public targetRotationY: number = 0;

    private speed: number = 0;
    private readonly maxSpeed: number = 40;

    public isLocalPlayer: boolean = true;

    // Audio
    private engineSound?: THREE.PositionalAudio;
    private accelSound?: THREE.PositionalAudio;

    constructor(
        private scene: THREE.Scene,
        private inputManager: InputManager | null,
        colorHue?: number,
        private listener?: THREE.AudioListener,
        private assets?: CarAssets
    ) {
        this.position = new THREE.Vector3(0, 0, 0);
        this.mesh = new THREE.Group();
        this.createVisuals(colorHue);
        this.setupAudio();
        this.scene.add(this.mesh);
    }

    private setupAudio() {
        if (!this.listener || !this.assets) return;

        if (this.assets.engine && !this.engineSound) {
            console.log('Initializing engine sound for car');
            this.engineSound = new THREE.PositionalAudio(this.listener);
            this.engineSound.setBuffer(this.assets.engine);
            this.engineSound.setRefDistance(10);
            this.engineSound.setLoop(true);
            this.engineSound.setVolume(1.0);
            this.mesh.add(this.engineSound);
            this.engineSound.play();
        }

        if (this.assets.accelerate && !this.accelSound) {
            console.log('Initializing accelerate sound for car');
            this.accelSound = new THREE.PositionalAudio(this.listener);
            this.accelSound.setBuffer(this.assets.accelerate);
            this.accelSound.setRefDistance(10);
            this.accelSound.setLoop(true);
            this.accelSound.setVolume(0.0);
            this.mesh.add(this.accelSound);
            this.accelSound.play();
        }
    }

    private hasLoadedGLTF: boolean = false;
    private fallbackMeshes: THREE.Object3D[] = [];

    private createVisuals(colorHue?: number) {
        const color = new THREE.Color();
        if (colorHue !== undefined) {
            color.setHSL(colorHue, 1.0, 0.5);
        } else {
            color.setHex(0xff0055); // Default player color
        }
        (this as any).carColor = color; // Store for assigning to GLTF later

        // Fallback Box Geometries (used while GLTF is loading)
        const bodyGeo = new THREE.BoxGeometry(2, 0.8, 4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: color });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.4;
        bodyMesh.castShadow = true;

        const roofGeo = new THREE.BoxGeometry(1.6, 0.6, 2);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.set(0, 1.1, -0.5);
        roofMesh.castShadow = true;

        this.fallbackMeshes.push(bodyMesh, roofMesh);
        this.mesh.add(bodyMesh);
        this.mesh.add(roofMesh);

        this.mesh.position.copy(this.position);
    }

    private setupGLTFVisuals() {
        if (!this.assets || !this.assets.carModel || this.hasLoadedGLTF) return;

        // Remove fallback boxes
        this.fallbackMeshes.forEach((mesh) => this.mesh.remove(mesh));
        this.fallbackMeshes = [];

        // Clone the original loaded GLTF scene
        const model = this.assets.carModel.clone();

        const wrapper = new THREE.Group();

        // 1. Center the raw model data to its absolute geometry center
        const bbox = new THREE.Box3().setFromObject(model);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        // Translate model so its bottom rests exactly at wrapper's Y=0 and is centered on X/Z
        model.position.set(-center.x, -bbox.min.y, -center.z);
        wrapper.add(model);

        // 2. Scale the wrapper to precisely match the target game physics scale (length of 4)
        const maxDim = Math.max(size.x, size.z);
        const scaleFactor = 4.0 / maxDim;
        wrapper.scale.set(scaleFactor, scaleFactor, scaleFactor);

        // 3. Set orientation. If it's sideways, align it.
        // Usually if size.x > size.z, the car is lying along the X-axis which means it needs a 90 deg rotation.
        if (size.x > size.z) {
            wrapper.rotation.y = -Math.PI / 2;
        } else {
            // If size.z > size.x, it's along Z, we might just need to flip it if it faces backwards.
            wrapper.rotation.y = Math.PI;
        }

        wrapper.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = true;

                // If it's the main paint body (usually has a distinguishing name or material name), assign the unique player hash color
                // For safety on arbitrary uninspected models, let's just color everything that isn't black-ish
                if (mesh.material) {
                    const material = mesh.material as THREE.MeshStandardMaterial;
                    const clonedMaterial = material.clone();

                    if (clonedMaterial.color && clonedMaterial.color.getHex() !== 0x000000 && clonedMaterial.color.r > 0.1) {
                        clonedMaterial.color.copy((this as any).carColor);
                    }
                    mesh.material = clonedMaterial;
                }
            }
        });

        this.mesh.add(wrapper);
        this.hasLoadedGLTF = true;
        console.log('Swapped to realistic GLTF car model!');
    }

    public update(dt: number) {
        if (this.isLocalPlayer && this.inputManager) {
            this.handleLocalMovement(dt);
        } else {
            this.handleNetworkInterpolation();
        }

        this.setupGLTFVisuals();
        this.updateAudio();
    }

    private updateAudio() {
        // Try lazy initializing if audio buffers loaded after car was created
        if (!this.engineSound || !this.accelSound) {
            this.setupAudio();
        }

        if (!this.engineSound || !this.accelSound) return;

        // Estimate current true speed for remote and local
        // For local it's exact, for remote we can approximate based on distance to target
        let currentSpeed = Math.abs(this.speed);
        if (!this.isLocalPlayer) {
            currentSpeed = this.position.distanceTo(this.targetPosition) * 10;
        }

        const normalizedSpeed = Math.min(1.0, currentSpeed / this.maxSpeed);

        // Mix idle engine and acceleration sound
        const idleVolume = Math.max(0, 1.0 - (normalizedSpeed * 2)); // Fades out as speed increases
        const accelVolume = Math.min(1.0, normalizedSpeed * 1.5); // Fades in 

        this.engineSound.setVolume(idleVolume);
        this.accelSound.setVolume(accelVolume);

        // Pitch bend accelerate sound slightly
        this.accelSound.setPlaybackRate(0.8 + normalizedSpeed * 0.6);
    }

    private handleNetworkInterpolation() {
        // dt is available for future velocity-based lerping, for now just constant factor
        this.position.lerp(this.targetPosition, 0.2);

        // Simple angle lerp
        const diff = this.targetRotationY - this.rotationY;
        // Handle wrap around
        const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.rotationY += normalizedDiff * 0.2;

        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotationY;
    }

    private handleLocalMovement(dt: number) {
        if (!this.inputManager) return;

        const movement = stepCarMotion(
            {
                speed: this.speed,
                rotationY: this.rotationY,
                positionX: this.position.x,
                positionZ: this.position.z,
            },
            {
                isUp: this.inputManager.isKeyPressed('KeyW') || this.inputManager.isKeyPressed('ArrowUp'),
                isDown: this.inputManager.isKeyPressed('KeyS') || this.inputManager.isKeyPressed('ArrowDown'),
                isLeft: this.inputManager.isKeyPressed('KeyA') || this.inputManager.isKeyPressed('ArrowLeft'),
                isRight: this.inputManager.isKeyPressed('KeyD') || this.inputManager.isKeyPressed('ArrowRight'),
            },
            dt
        );

        this.speed = movement.speed;
        this.rotationY = movement.rotationY;
        this.position.x = movement.positionX;
        this.position.z = movement.positionZ;

        // Update Mesh Position & Rotation
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotationY;
    }

    public reset() {
        this.position.set(0, 0, 0);
        this.speed = 0;
        this.rotationY = 0;
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotationY;

        if (this.engineSound && !this.engineSound.isPlaying) this.engineSound.play();
        if (this.accelSound && !this.accelSound.isPlaying) this.accelSound.play();
    }
}
