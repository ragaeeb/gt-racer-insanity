import * as THREE from 'three';
import type { CarPhysicsConfig } from '@/shared/game/carPhysics';
import { InputManager } from '@/client/game/systems/InputManager';
import { CarController } from '@/client/game/entities/CarController';
import { CarVisual } from '@/client/game/entities/CarVisual';
import { applyCarPaint } from '@/client/game/paintSystem';

const WHEEL_MESH_RE = /wheel/i;
const BRAKE_LIGHT_MATERIAL_RE = /^(BrakeLight|TailLights?)$/i;

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

    public isLocalPlayer: boolean = true;
    private readonly controller: CarController;
    private readonly visual = new CarVisual();

    // Audio
    private engineSound?: THREE.PositionalAudio;
    private accelSound?: THREE.PositionalAudio;
    private drivingSound?: THREE.PositionalAudio;
    private brakeSound?: THREE.PositionalAudio;
    private previousAudioSpeed = 0;
    private lastBrakeTriggerAtMs = 0;
    private audioFadeMultiplier = 1;
    private isAudioFadingOut = false;

    private hasLoadedGLTF: boolean = false;
    private fallbackMeshes: THREE.Object3D[] = [];
    private readonly clonedMaterials = new Set<THREE.Material>();
    private readonly carColor = new THREE.Color(0xff0055);
    private readonly wheelMeshes: THREE.Mesh[] = [];
    private readonly brakeLightMaterials: THREE.MeshStandardMaterial[] = [];
    private gltfWrapper: THREE.Group | null = null;
    private nameTagSprite?: THREE.Sprite;
    private nameTagTexture?: THREE.CanvasTexture;
    private nameTagMaterial?: THREE.SpriteMaterial;

    constructor(
        private scene: THREE.Scene,
        private inputManager: InputManager | null,
        colorHSL?: { h: number; s: number; l: number },
        private listener?: THREE.AudioListener,
        private assets?: CarAssets,
        private carModelTemplate?: THREE.Group,
        private carModelYawOffsetRadians = 0,
        private playerName = 'Player',
        physicsConfig?: CarPhysicsConfig,
    ) {
        this.controller = new CarController(physicsConfig);
        this.position = new THREE.Vector3(0, 0, 0);
        this.mesh = new THREE.Group();
        this.createVisuals(colorHSL);
        this.createNameTag();
        this.setupAudio();
        this.scene.add(this.mesh);
    }

    private createNameTag() {
        const nameTextureCanvas = document.createElement('canvas');
        nameTextureCanvas.width = 512;
        nameTextureCanvas.height = 128;
        const context = nameTextureCanvas.getContext('2d');
        if (!context) return;

        context.clearRect(0, 0, nameTextureCanvas.width, nameTextureCanvas.height);
        context.fillStyle = 'rgba(10, 20, 30, 0.75)';
        context.fillRect(0, 12, nameTextureCanvas.width, 104);

        context.font = "600 58px 'Trebuchet MS', sans-serif";
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#f5fbff';
        context.fillText(this.playerName.slice(0, 18), nameTextureCanvas.width / 2, nameTextureCanvas.height / 2 + 4);

        const texture = new THREE.CanvasTexture(nameTextureCanvas);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            depthTest: false,
            map: texture,
            transparent: true,
        });

        const sprite = new THREE.Sprite(material);
        sprite.position.set(0, 3.6, 0);
        sprite.scale.set(5.2, 1.3, 1);
        this.mesh.add(sprite);

        this.nameTagSprite = sprite;
        this.nameTagTexture = texture;
        this.nameTagMaterial = material;
    }

    private setupAudio() {
        if (!this.listener || !this.assets) return;

        if (this.assets.engine && !this.engineSound) {
            this.engineSound = new THREE.PositionalAudio(this.listener);
            this.engineSound.setBuffer(this.assets.engine);
            this.engineSound.setRefDistance(10);
            this.engineSound.setLoop(true);
            this.engineSound.setVolume(1.0);
            this.mesh.add(this.engineSound);
            this.engineSound.play();
        }

        if (this.assets.accelerate && !this.accelSound) {
            this.accelSound = new THREE.PositionalAudio(this.listener);
            this.accelSound.setBuffer(this.assets.accelerate);
            this.accelSound.setRefDistance(10);
            this.accelSound.setLoop(true);
            this.accelSound.setVolume(0.0);
            this.mesh.add(this.accelSound);
            this.accelSound.play();
        }

        if (this.assets.driving && !this.drivingSound) {
            this.drivingSound = new THREE.PositionalAudio(this.listener);
            this.drivingSound.setBuffer(this.assets.driving);
            this.drivingSound.setRefDistance(10);
            this.drivingSound.setLoop(true);
            this.drivingSound.setVolume(0.0);
            this.mesh.add(this.drivingSound);
            this.drivingSound.play();
        }

        if (this.assets.brake && !this.brakeSound) {
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

    private createVisuals(colorHSL?: { h: number; s: number; l: number }) {
        if (colorHSL) {
            this.carColor.setHSL(colorHSL.h, colorHSL.s, colorHSL.l);
        } else {
            this.carColor.setHex(0xff0055);
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

        const model = this.carModelTemplate.clone();
        const wrapper = new THREE.Group();

        const bbox = new THREE.Box3().setFromObject(model);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        model.position.set(-center.x, -bbox.min.y, -center.z);
        wrapper.add(model);

        const maxDim = Math.max(size.x, size.z);
        const scaleFactor = 4.0 / maxDim;
        wrapper.scale.set(scaleFactor, scaleFactor, scaleFactor);

        if (size.x > size.z) {
            wrapper.rotation.y = -Math.PI / 2 + this.carModelYawOffsetRadians;
        } else {
            wrapper.rotation.y = Math.PI + this.carModelYawOffsetRadians;
        }

        applyCarPaint(wrapper, this.carColor, this.clonedMaterials);

        this.wheelMeshes.length = 0;
        this.brakeLightMaterials.length = 0;
        wrapper.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            if (WHEEL_MESH_RE.test(mesh.name)) {
                this.wheelMeshes.push(mesh);
            }
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of materials) {
                if (mat instanceof THREE.MeshStandardMaterial && BRAKE_LIGHT_MATERIAL_RE.test(mat.name)) {
                    this.brakeLightMaterials.push(mat);
                }
            }
        });

        this.gltfWrapper = wrapper;
        this.mesh.add(wrapper);
        this.hasLoadedGLTF = true;
    }

    public update(dt: number) {
        if (this.isLocalPlayer && this.inputManager) {
            this.handleLocalMovement(dt);
        } else {
            this.handleNetworkInterpolation();
        }

        this.setupGLTFVisuals();
        this.updateBrakeLights();
        this.updateSuspensionBounce();
        this.updateAudio();
    }

    private updateBrakeLights() {
        const isBraking = this.controller.isBraking() && Math.abs(this.controller.getSpeed()) > 1;
        const intensity = isBraking ? 2.0 : 0;
        for (const mat of this.brakeLightMaterials) {
            mat.emissiveIntensity = intensity;
        }
    }

    private updateSuspensionBounce() {
        if (!this.gltfWrapper) return;
        const maxSpeed = this.controller.getMaxSpeed();
        if (maxSpeed <= 0) return;
        const normalizedSpeed = Math.min(1, Math.abs(this.controller.getSpeed()) / maxSpeed);
        const targetBounce = Math.sin(performance.now() * 0.005) * 0.015 * normalizedSpeed;
        this.gltfWrapper.position.y = THREE.MathUtils.lerp(this.gltfWrapper.position.y, targetBounce, 0.05);
    }

    private updateAudio() {
        if (!this.engineSound || !this.accelSound || !this.drivingSound || !this.brakeSound) {
            this.setupAudio();
        }

        if (!this.engineSound || !this.accelSound || !this.drivingSound || !this.brakeSound) return;

        if (this.isAudioFadingOut) {
            this.audioFadeMultiplier = Math.max(0, this.audioFadeMultiplier - 0.02);
            if (this.audioFadeMultiplier <= 0) {
                for (const sound of [this.engineSound, this.accelSound, this.drivingSound, this.brakeSound]) {
                    if (sound.isPlaying) sound.stop();
                }
                return;
            }
        }

        let currentSpeed = Math.abs(this.controller.getSpeed());
        if (!this.isLocalPlayer) {
            currentSpeed = this.position.distanceTo(this.targetPosition) * 10;
        }

        const normalizedSpeed = Math.min(1.0, currentSpeed / this.controller.getMaxSpeed());
        const speedDelta = currentSpeed - this.previousAudioSpeed;
        const accelerationFactor = THREE.MathUtils.clamp(speedDelta / 8, 0, 1);
        const decelerationFactor = THREE.MathUtils.clamp(-speedDelta / 8, 0, 1);
        const fade = this.audioFadeMultiplier;

        const idleVolume = Math.max(0, 0.7 - normalizedSpeed * 0.9) * fade;
        const drivingVolume = THREE.MathUtils.smoothstep(normalizedSpeed, 0.08, 0.95) * 0.8 * fade;
        const throttleWeight = this.isLocalPlayer
            ? (this.controller.isAccelerating() ? 1 : 0)
            : (speedDelta > 0.2 ? 1 : 0);
        const accelVolume = THREE.MathUtils.clamp(
            normalizedSpeed * 0.3 + throttleWeight * 0.5 + accelerationFactor * 0.5,
            0,
            1
        ) * fade;

        this.engineSound.setVolume(idleVolume);
        this.drivingSound.setVolume(drivingVolume);
        this.accelSound.setVolume(accelVolume);
        this.engineSound.setPlaybackRate(0.9 + normalizedSpeed * 0.2);
        this.drivingSound.setPlaybackRate(0.85 + normalizedSpeed * 0.4);
        this.accelSound.setPlaybackRate(0.8 + normalizedSpeed * 0.6);

        const shouldTriggerBrake = this.isLocalPlayer
            ? this.controller.isBraking() && currentSpeed > 1.5
            : decelerationFactor > 0.25 && currentSpeed > 3;
        const nowMs = performance.now();
        if (shouldTriggerBrake && nowMs - this.lastBrakeTriggerAtMs > 450 && fade > 0.1) {
            if (this.brakeSound.isPlaying) {
                this.brakeSound.stop();
            }
            this.brakeSound.setVolume(THREE.MathUtils.clamp(0.65 + normalizedSpeed * 0.45, 0.65, 1.0) * fade);
            this.brakeSound.setPlaybackRate(THREE.MathUtils.clamp(0.95 + normalizedSpeed * 0.35, 0.95, 1.25));
            this.brakeSound.play();
            this.lastBrakeTriggerAtMs = nowMs;
        }

        this.previousAudioSpeed = currentSpeed;
    }

    private handleNetworkInterpolation() {
        const nextState = this.controller.updateRemote(
            { position: this.position, rotationY: this.rotationY },
            this.targetPosition,
            this.targetRotationY
        );

        this.position.copy(nextState.position);
        this.rotationY = nextState.rotationY;
        this.visual.applyTransform(this.mesh, this.position, this.rotationY);
    }

    private handleLocalMovement(dt: number) {
        if (!this.inputManager) return;

        const nextState = this.controller.updateLocal(
            { position: this.position, rotationY: this.rotationY },
            this.inputManager,
            dt
        );

        this.position.copy(nextState.position);
        this.rotationY = nextState.rotationY;
        this.visual.applyTransform(this.mesh, this.position, this.rotationY);
    }

    public reset() {
        this.position.set(0, 0, 0);
        this.rotationY = 0;
        this.controller.reset();
        this.previousAudioSpeed = 0;
        this.lastBrakeTriggerAtMs = 0;
        this.audioFadeMultiplier = 1;
        this.isAudioFadingOut = false;
        this.visual.applyTransform(this.mesh, this.position, this.rotationY);

        if (this.engineSound && !this.engineSound.isPlaying) this.engineSound.play();
        if (this.accelSound && !this.accelSound.isPlaying) this.accelSound.play();
        if (this.drivingSound && !this.drivingSound.isPlaying) this.drivingSound.play();
    }

    public getSpeed = () => {
        return this.controller.getSpeed();
    };

    public setMovementMultiplier = (multiplier: number) => {
        this.controller.setMovementMultiplier(multiplier);
    };

    public fadeOutAudio = () => {
        this.isAudioFadingOut = true;
    };

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

        if (this.nameTagSprite) {
            this.mesh.remove(this.nameTagSprite);
            this.nameTagSprite = undefined;
        }
        this.nameTagTexture?.dispose();
        this.nameTagTexture = undefined;
        this.nameTagMaterial?.dispose();
        this.nameTagMaterial = undefined;

        this.disposeFallbackVisuals();

        for (const material of this.clonedMaterials) {
            if (material instanceof THREE.MeshStandardMaterial && material.map) {
                material.map.dispose();
            }
            material.dispose();
        }
        this.clonedMaterials.clear();

        this.scene.remove(this.mesh);
    }
}
