import * as THREE from 'three';
import { stepCarMotion } from '@/shared/game/carPhysics';
import { InputManager } from '@/client/game/systems/InputManager';

export type CarAssets = {
    engine?: AudioBuffer;
    accelerate?: AudioBuffer;
    driving?: AudioBuffer;
    brake?: AudioBuffer;
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
    private cruiseLatchActive = false;

    public isLocalPlayer: boolean = true;
    private isBrakingInputActive = false;
    private isAcceleratingInputActive = false;

    // Audio
    private engineSound?: THREE.PositionalAudio;
    private accelSound?: THREE.PositionalAudio;
    private drivingSound?: THREE.PositionalAudio;
    private brakeSound?: THREE.PositionalAudio;
    private previousAudioSpeed = 0;
    private lastBrakeTriggerAtMs = 0;

    private hasLoadedGLTF: boolean = false;
    private fallbackMeshes: THREE.Object3D[] = [];
    private readonly clonedMaterials = new Set<THREE.Material>();
    private readonly carColor = new THREE.Color(0xff0055);

    constructor(
        private scene: THREE.Scene,
        private inputManager: InputManager | null,
        colorHue?: number,
        private listener?: THREE.AudioListener,
        private assets?: CarAssets,
        private carModelTemplate?: THREE.Group,
        private carModelYawOffsetRadians = 0
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

        if (this.assets.driving && !this.drivingSound) {
            console.log('Initializing driving sound for car');
            this.drivingSound = new THREE.PositionalAudio(this.listener);
            this.drivingSound.setBuffer(this.assets.driving);
            this.drivingSound.setRefDistance(10);
            this.drivingSound.setLoop(true);
            this.drivingSound.setVolume(0.0);
            this.mesh.add(this.drivingSound);
            this.drivingSound.play();
        }

        if (this.assets.brake && !this.brakeSound) {
            console.log('Initializing brake sound for car');
            this.brakeSound = new THREE.PositionalAudio(this.listener);
            this.brakeSound.setBuffer(this.assets.brake);
            this.brakeSound.setRefDistance(10);
            this.brakeSound.setLoop(false);
            this.brakeSound.setVolume(0.0);
            this.mesh.add(this.brakeSound);
        }
    }

    private disposeFallbackVisuals() {
        for (const fallbackMesh of this.fallbackMeshes) {
            this.mesh.remove(fallbackMesh);

            if (!(fallbackMesh instanceof THREE.Mesh)) continue;

            fallbackMesh.geometry.dispose();

            if (Array.isArray(fallbackMesh.material)) {
                for (const material of fallbackMesh.material) {
                    material.dispose();
                }
            } else {
                fallbackMesh.material.dispose();
            }
        }

        this.fallbackMeshes = [];
    }

    private createVisuals(colorHue?: number) {
        if (colorHue !== undefined) {
            this.carColor.setHSL(colorHue, 1.0, 0.5);
        } else {
            this.carColor.setHex(0xff0055); // Default player color
        }

        // Fallback Box Geometries (used while GLTF is loading)
        const bodyGeo = new THREE.BoxGeometry(2, 0.8, 4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: this.carColor });
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
        if (!this.carModelTemplate || this.hasLoadedGLTF) return;

        this.disposeFallbackVisuals();

        // Clone the original loaded GLTF scene
        const model = this.carModelTemplate.clone();

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
            wrapper.rotation.y = -Math.PI / 2 + this.carModelYawOffsetRadians;
        } else {
            // If size.z > size.x, it's along Z, we might just need to flip it if it faces backwards.
            wrapper.rotation.y = Math.PI + this.carModelYawOffsetRadians;
        }

        wrapper.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = true;

                // If it's the main paint body (usually has a distinguishing name or material name), assign the unique player hash color
                // For safety on arbitrary uninspected models, let's just color everything that isn't black-ish
                if (mesh.material) {
                    const originalMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    const clonedMaterials = originalMaterials.map((material) => material.clone());

                    for (const clonedMaterial of clonedMaterials) {
                        this.clonedMaterials.add(clonedMaterial);

                        if (
                            'color' in clonedMaterial &&
                            clonedMaterial.color instanceof THREE.Color &&
                            clonedMaterial.color.getHex() !== 0x000000 &&
                            clonedMaterial.color.r > 0.1
                        ) {
                            clonedMaterial.color.copy(this.carColor);
                        }
                    }

                    mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
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
        if (!this.engineSound || !this.accelSound || !this.drivingSound || !this.brakeSound) {
            this.setupAudio();
        }

        if (!this.engineSound || !this.accelSound || !this.drivingSound || !this.brakeSound) return;

        // Estimate current true speed for remote and local
        // For local it's exact, for remote we can approximate based on distance to target
        let currentSpeed = Math.abs(this.speed);
        if (!this.isLocalPlayer) {
            currentSpeed = this.position.distanceTo(this.targetPosition) * 10;
        }

        const normalizedSpeed = Math.min(1.0, currentSpeed / this.maxSpeed);
        const speedDelta = currentSpeed - this.previousAudioSpeed;
        const accelerationFactor = THREE.MathUtils.clamp(speedDelta / 8, 0, 1);
        const decelerationFactor = THREE.MathUtils.clamp(-speedDelta / 8, 0, 1);

        const idleVolume = Math.max(0, 0.7 - normalizedSpeed * 0.9);
        const drivingVolume = THREE.MathUtils.smoothstep(normalizedSpeed, 0.08, 0.95) * 0.8;
        const throttleWeight = this.isLocalPlayer
            ? (this.isAcceleratingInputActive ? 1 : 0)
            : (speedDelta > 0.2 ? 1 : 0);
        const accelVolume = THREE.MathUtils.clamp(
            normalizedSpeed * 0.3 + throttleWeight * 0.5 + accelerationFactor * 0.5,
            0,
            1
        );

        this.engineSound.setVolume(idleVolume);
        this.drivingSound.setVolume(drivingVolume);
        this.accelSound.setVolume(accelVolume);
        this.engineSound.setPlaybackRate(0.9 + normalizedSpeed * 0.2);
        this.drivingSound.setPlaybackRate(0.85 + normalizedSpeed * 0.4);
        this.accelSound.setPlaybackRate(0.8 + normalizedSpeed * 0.6);

        const shouldTriggerBrake = this.isLocalPlayer
            ? this.isBrakingInputActive && currentSpeed > 1.5
            : decelerationFactor > 0.25 && currentSpeed > 3;
        const nowMs = performance.now();
        if (shouldTriggerBrake && nowMs - this.lastBrakeTriggerAtMs > 450) {
            if (this.brakeSound.isPlaying) {
                this.brakeSound.stop();
            }
            this.brakeSound.setVolume(THREE.MathUtils.clamp(0.65 + normalizedSpeed * 0.45, 0.65, 1.0));
            this.brakeSound.setPlaybackRate(THREE.MathUtils.clamp(0.95 + normalizedSpeed * 0.35, 0.95, 1.25));
            this.brakeSound.play();
            this.lastBrakeTriggerAtMs = nowMs;
        }

        this.previousAudioSpeed = currentSpeed;
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

        const isUpPressed =
            this.inputManager.isKeyPressed('KeyW') || this.inputManager.isKeyPressed('ArrowUp');
        const isDownPressed =
            this.inputManager.isKeyPressed('KeyS') || this.inputManager.isKeyPressed('ArrowDown');
        const isLeftPressed =
            this.inputManager.isKeyPressed('KeyA') || this.inputManager.isKeyPressed('ArrowLeft');
        const isRightPressed =
            this.inputManager.isKeyPressed('KeyD') || this.inputManager.isKeyPressed('ArrowRight');
        const isCruiseEnabled = this.inputManager.isCruiseControlEnabled();
        const isPrecisionOverrideActive = this.inputManager.isPrecisionOverrideActive();
        const topSpeedLatchThreshold = this.maxSpeed * 0.98;
        this.isBrakingInputActive = isDownPressed;
        this.isAcceleratingInputActive = isUpPressed;

        if (!isCruiseEnabled || isPrecisionOverrideActive) {
            this.cruiseLatchActive = false;
        }

        if (isDownPressed) {
            this.cruiseLatchActive = false;
        }

        if (isUpPressed && this.speed >= topSpeedLatchThreshold) {
            this.cruiseLatchActive = true;
        }

        const shouldAutoCruise =
            isCruiseEnabled &&
            !isPrecisionOverrideActive &&
            this.cruiseLatchActive &&
            !isDownPressed;

        const movement = stepCarMotion(
            {
                speed: this.speed,
                rotationY: this.rotationY,
                positionX: this.position.x,
                positionZ: this.position.z,
            },
            {
                isUp: isUpPressed || shouldAutoCruise,
                isDown: isDownPressed,
                isLeft: isLeftPressed,
                isRight: isRightPressed,
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
        this.cruiseLatchActive = false;
        this.previousAudioSpeed = 0;
        this.lastBrakeTriggerAtMs = 0;
        this.isBrakingInputActive = false;
        this.isAcceleratingInputActive = false;
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotationY;

        if (this.engineSound && !this.engineSound.isPlaying) this.engineSound.play();
        if (this.accelSound && !this.accelSound.isPlaying) this.accelSound.play();
        if (this.drivingSound && !this.drivingSound.isPlaying) this.drivingSound.play();
    }

    public dispose() {
        if (this.engineSound) {
            if (this.engineSound.isPlaying) {
                this.engineSound.stop();
            }
            this.mesh.remove(this.engineSound);
            this.engineSound.disconnect();
            this.engineSound = undefined;
        }

        if (this.accelSound) {
            if (this.accelSound.isPlaying) {
                this.accelSound.stop();
            }
            this.mesh.remove(this.accelSound);
            this.accelSound.disconnect();
            this.accelSound = undefined;
        }

        if (this.drivingSound) {
            if (this.drivingSound.isPlaying) {
                this.drivingSound.stop();
            }
            this.mesh.remove(this.drivingSound);
            this.drivingSound.disconnect();
            this.drivingSound = undefined;
        }

        if (this.brakeSound) {
            if (this.brakeSound.isPlaying) {
                this.brakeSound.stop();
            }
            this.mesh.remove(this.brakeSound);
            this.brakeSound.disconnect();
            this.brakeSound = undefined;
        }

        this.disposeFallbackVisuals();

        for (const material of this.clonedMaterials) {
            material.dispose();
        }
        this.clonedMaterials.clear();

        this.scene.remove(this.mesh);
    }
}
