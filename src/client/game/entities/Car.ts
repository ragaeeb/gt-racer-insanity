import * as THREE from 'three';
import { calculateDopplerRate } from '@/client/game/audio/dopplerEffect';
import { EngineLayerManager } from '@/client/game/audio/engineLayerManager';
import { SurfaceAudioManager } from '@/client/game/audio/surfaceAudio';
import { CarController } from '@/client/game/entities/CarController';
import { CarVisual } from '@/client/game/entities/CarVisual';
import type { PaintMaterialRef } from '@/client/game/paintSystem';
import { applyCarPaint, createFallbackPaintMaterial } from '@/client/game/paintSystem';
import type { InputManager } from '@/client/game/systems/InputManager';
import type { CarPhysicsConfig } from '@/shared/game/carPhysics';
import { FLIPPED_DURATION_MS } from '@/shared/game/effects/statusEffectManifest';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';
import { DriftState } from '@/shared/game/vehicle/driftConfig';

const BRAKE_LIGHT_MATERIAL_RE = /^(BrakeLight|TailLights?)$/i;
export const SUSPENSION_BOUNCE_AMPLITUDE = 0.015;
const AUDIO_FADE_RATE = 1.2;
const FLIP_PROGRESS_DT_CAP_MS = 120;
const FLIP_TOTAL_ROTATIONS = 1;
const DOPPLER_DT_EPS = 1e-6;

export const advanceFlipElapsedMs = (elapsedMs: number, dt: number) => {
    const frameStepMs = Math.min(Math.max(dt * 1000, 0), FLIP_PROGRESS_DT_CAP_MS);
    return Math.min(FLIPPED_DURATION_MS, elapsedMs + frameStepMs);
};

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

export const normalizeAudioSpeed = (currentSpeed: number, maxSpeed: number) => {
    const safeSpeed = finiteOr(currentSpeed, 0);
    const normalizedSpeedRaw = maxSpeed > 0 ? safeSpeed / maxSpeed : 0;
    return Math.min(1.0, Math.max(0, finiteOr(normalizedSpeedRaw, 0)));
};

export const canTriggerFlip = (flipElapsedMs: number | null): boolean => {
    return flipElapsedMs === null;
};

export type CarAssets = {
    engine?: AudioBuffer;
    accelerate?: AudioBuffer;
    driving?: AudioBuffer;
    brake?: AudioBuffer;
    /** Tire squeal sound — played on asphalt when drifting (optional, use brake.mp3 as stand-in) */
    squeal?: AudioBuffer;
    /** Gravel rumble sound — played on low-friction surfaces (optional, use driving-loop.wav as stand-in) */
    rumble?: AudioBuffer;
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
    private engineLayerManager?: EngineLayerManager;
    private surfaceAudio?: SurfaceAudioManager;
    private brakeSound?: THREE.PositionalAudio;
    private previousAudioSpeed = 0;
    private lastBrakeTriggerAtMs = 0;
    private audioFadeMultiplier = 1;
    private isAudioFadingOut = false;
    private mixStateManager?: import('@/client/game/audio/mixStateManager').MixStateManager;

    // Doppler velocity tracking for remote cars
    private previousPosition = new THREE.Vector3();
    private currentVelocity = new THREE.Vector3();
    private hasDopplerSample = false;
    // Pre-allocated scratch vectors to avoid per-frame GC pressure
    private scratchPositionDelta = new THREE.Vector3();
    private scratchToSource = new THREE.Vector3();
    private scratchRelativeVelocity = new THREE.Vector3();

    private hasLoadedGLTF: boolean = false;
    private fallbackMeshes: THREE.Object3D[] = [];
    private readonly clonedMaterials = new Set<THREE.Material>();
    private readonly carColor = new THREE.Color(0xff0055);
    private readonly brakeLightMaterials: THREE.MeshStandardMaterial[] = [];
    private readonly boostFlashMaterials: THREE.MeshStandardMaterial[] = [];
    // References to body paint materials — used to update dirt intensity each frame
    private paintRefs: PaintMaterialRef[] = [];
    private suspensionTime = 0;
    private gltfWrapper: THREE.Group | null = null;
    private nameTagSprite?: THREE.Sprite;
    private nameTagTexture?: THREE.CanvasTexture;
    private nameTagMaterial?: THREE.SpriteMaterial;

    private flipElapsedMs: number | null = null;

    // Drift visual state — written from server snapshot each frame
    public driftState: number = 0;
    public driftAngle: number = 0;
    public driftBoostTier: number = 0;
    private previousBoostTier: number = 0;
    private boostFlashIntensity: number = 0;

    /**
     * Friction multiplier of the current track segment the car occupies.
     * Should be updated by the owner each frame from TrackSegmentManifest.frictionMultiplier.
     * Defaults to 1.0 (standard asphalt).
     */
    public currentFrictionMultiplier: number = 1.0;

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
        if (!context) {
            return;
        }

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
        if (!this.listener || !this.assets) {
            return;
        }

        if (!this.engineLayerManager && (this.assets.engine || this.assets.accelerate || this.assets.driving)) {
            this.engineLayerManager = new EngineLayerManager(
                this.listener,
                {
                    idle: this.assets.engine,
                    mid: this.assets.accelerate,
                    high: this.assets.driving,
                },
                DEFAULT_GAMEPLAY_TUNING.audio.rpm,
            );
            this.engineLayerManager.attachTo(this.mesh);
            this.engineLayerManager.connectToMixState(this.mixStateManager);
        }

        if (this.assets.brake && !this.brakeSound) {
            this.brakeSound = new THREE.PositionalAudio(this.listener);
            this.brakeSound.setBuffer(this.assets.brake);
            this.brakeSound.setRefDistance(10);
            this.brakeSound.setLoop(false);
            this.brakeSound.setVolume(0.0);
            this.mesh.add(this.brakeSound);
            // Wire brake sound through effects gain node
            this.connectSoundToMixState(this.brakeSound, 'effects');
        }

        if (!this.surfaceAudio) {
            // Use squeal/rumble buffers if provided; SurfaceAudioManager degrades gracefully if absent.
            this.surfaceAudio = new SurfaceAudioManager(
                this.listener,
                {
                    squeal: this.assets.squeal,
                    rumble: this.assets.rumble,
                },
                DEFAULT_GAMEPLAY_TUNING.audio.surface,
            );
            this.surfaceAudio.attachTo(this.mesh);
            this.surfaceAudio.connectToMixState(this.mixStateManager);
        }
    }

    /**
     * Set the mix state manager for this car's audio.
     * Should be called after the Car is created, before the race starts.
     * This enables race-phase-based audio mixing.
     */
    public setMixStateManager = (manager: import('@/client/game/audio/mixStateManager').MixStateManager) => {
        this.mixStateManager = manager;
        // Re-wire audio if already setup
        if (this.engineLayerManager) {
            this.engineLayerManager.connectToMixState(manager);
        }
        if (this.surfaceAudio) {
            this.surfaceAudio.connectToMixState(manager);
        }
        if (this.brakeSound) {
            this.connectSoundToMixState(this.brakeSound, 'effects');
        }
    };

    /**
     * Connect a THREE.PositionalAudio through the mix state's gain node.
     */
    private connectSoundToMixState = (sound: THREE.PositionalAudio, channel: 'music' | 'engine' | 'effects') => {
        if (!this.mixStateManager || !this.listener) {
            return;
        }
        const channels = this.mixStateManager.getChannels();
        const gainNode = channels[channel];
        // Disconnect from default chain and reconnect through mix gain
        sound.gain.disconnect();
        sound.gain.connect(gainNode as unknown as globalThis.AudioNode);
    };

    private disposeFallbackVisuals() {
        for (const fallbackMesh of this.fallbackMeshes) {
            this.mesh.remove(fallbackMesh);

            if (!(fallbackMesh instanceof THREE.Mesh)) {
                continue;
            }

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
        // Use MeshPhysicalMaterial to match the GLTF paint upgrade (clearcoat, reflectivity)
        const bodyGeo = new THREE.BoxGeometry(2, 0.8, 4);
        const bodyMat = createFallbackPaintMaterial(this.carColor, this.clonedMaterials);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.4;
        bodyMesh.castShadow = true;

        const roofGeo = new THREE.BoxGeometry(1.6, 0.6, 2);
        const roofMat = createFallbackPaintMaterial(0x333333, this.clonedMaterials);
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.set(0, 1.1, -0.5);
        roofMesh.castShadow = true;

        this.boostFlashMaterials.length = 0;
        this.boostFlashMaterials.push(bodyMat, roofMat);
        this.fallbackMeshes.push(bodyMesh, roofMesh);
        this.mesh.add(bodyMesh);
        this.mesh.add(roofMesh);

        this.mesh.position.copy(this.position);
    }

    private setupGLTFVisuals() {
        if (!this.carModelTemplate || this.hasLoadedGLTF) {
            return;
        }

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

        this.paintRefs = applyCarPaint(wrapper, this.carColor, this.clonedMaterials);

        this.brakeLightMaterials.length = 0;
        this.boostFlashMaterials.length = 0;
        const boostFlashMaterialSet = new Set<THREE.MeshStandardMaterial>();
        wrapper.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) {
                return;
            }
            const mesh = child as THREE.Mesh;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of materials) {
                if (!(mat instanceof THREE.MeshStandardMaterial)) {
                    continue;
                }
                if (BRAKE_LIGHT_MATERIAL_RE.test(mat.name)) {
                    this.brakeLightMaterials.push(mat);
                    continue;
                }
                if (!boostFlashMaterialSet.has(mat)) {
                    boostFlashMaterialSet.add(mat);
                    this.boostFlashMaterials.push(mat);
                }
            }
        });

        this.gltfWrapper = wrapper;
        this.mesh.add(wrapper);
        this.hasLoadedGLTF = true;
    }

    public update(dt: number, listenerPosition?: THREE.Vector3, listenerVelocity?: THREE.Vector3) {
        this.updateFlipAnimation(dt);

        if (this.isLocalPlayer && this.inputManager) {
            this.handleLocalMovement(dt);
        } else {
            this.handleNetworkInterpolation();
        }

        this.setupGLTFVisuals();
        this.updateBrakeLights();
        this.updateSuspensionBounce(dt);
        this.updateDriftTilt();
        this.updateBoostFlash();
        this.updateAudio(dt);

        // Apply Doppler effect for remote cars
        if (!this.isLocalPlayer && listenerPosition && listenerVelocity) {
            this.updateDoppler(listenerPosition, listenerVelocity, dt);
        }
    }

    public setFlipped = (isFlipped: boolean): boolean => {
        if (!isFlipped || this.flipElapsedMs !== null) {
            return false;
        }

        return this.triggerFlip();
    };

    public applyCollisionDriveLock = (durationMs: number) => {
        this.controller.applyDriveLock(durationMs);
    };

    public syncAuthoritativeSpeed = (speed: number) => {
        this.controller.syncAuthoritativeSpeed(speed);
    };

    public triggerFlip = (): boolean => {
        // Prevent animation restarts while a flip is already in progress.
        if (!canTriggerFlip(this.flipElapsedMs)) {
            return false;
        }

        this.flipElapsedMs = 0;

        if (this.gltfWrapper) {
            this.gltfWrapper.rotation.x = 0;
            this.gltfWrapper.position.y = 0;
        }

        return true;
    };

    private updateFlipAnimation(dt: number) {
        if (this.flipElapsedMs === null) {
            return;
        }

        this.flipElapsedMs = advanceFlipElapsedMs(this.flipElapsedMs, dt);

        if (this.flipElapsedMs >= FLIPPED_DURATION_MS) {
            this.flipElapsedMs = null;
            if (this.gltfWrapper) {
                this.gltfWrapper.rotation.x = 0;
                this.gltfWrapper.position.y = 0;
            }
            return;
        }

        const t = this.flipElapsedMs / FLIPPED_DURATION_MS;
        const eased = 1 - (1 - t) * (1 - t);
        const flipRotationX = eased * Math.PI * 2 * FLIP_TOTAL_ROTATIONS;

        if (this.gltfWrapper) {
            this.gltfWrapper.rotation.x = flipRotationX;
            this.gltfWrapper.position.y = Math.sin(eased * Math.PI) * 2.5;
        }
    }

    private updateBrakeLights() {
        const isBraking = this.controller.isBraking() && Math.abs(this.controller.getSpeed()) > 1;
        const intensity = isBraking ? 2.0 : 0;
        for (const mat of this.brakeLightMaterials) {
            mat.emissiveIntensity = intensity;
        }
    }

    private updateSuspensionBounce(dt: number) {
        if (!this.gltfWrapper || this.flipElapsedMs !== null) {
            return;
        }
        const maxSpeed = this.controller.getMaxSpeed();
        if (maxSpeed <= 0) {
            return;
        }
        this.suspensionTime += dt;
        const normalizedSpeed = Math.min(1, Math.abs(this.controller.getSpeed()) / maxSpeed);
        const targetBounce = Math.sin(this.suspensionTime * 5) * SUSPENSION_BOUNCE_AMPLITUDE * normalizedSpeed;
        this.gltfWrapper.position.y = THREE.MathUtils.lerp(this.gltfWrapper.position.y, targetBounce, 0.05);
    }

    private updateDriftTilt() {
        if (!this.gltfWrapper || this.flipElapsedMs !== null) {
            return;
        }
        // Apply a small Z-rotation on the GLTF wrapper proportional to driftAngle (max ±~2.9°)
        if (this.driftState === DriftState.DRIFTING) {
            const tiltAngle = this.driftAngle * 0.1; // 0.1 rad/rad → ~5.7° max at full slide
            this.gltfWrapper.rotation.z = THREE.MathUtils.lerp(this.gltfWrapper.rotation.z, tiltAngle, 0.12);
        } else {
            this.gltfWrapper.rotation.z = THREE.MathUtils.lerp(this.gltfWrapper.rotation.z, 0, 0.12);
        }
    }

    private updateBoostFlash() {
        // Detect boost application: tier transitions from >0 back to 0.
        if (this.previousBoostTier > 0 && this.driftBoostTier === 0) {
            this.boostFlashIntensity = 2.0;
        }
        this.previousBoostTier = this.driftBoostTier;

        if (this.boostFlashIntensity <= 0) {
            return;
        }

        for (const mat of this.boostFlashMaterials) {
            mat.emissiveIntensity = this.boostFlashIntensity;
        }

        this.boostFlashIntensity *= 0.88; // ~10-frame decay at 60 fps
        if (this.boostFlashIntensity < 0.02) {
            this.boostFlashIntensity = 0;
        }
    }

    private updateAudio(dt: number) {
        if (!this.engineLayerManager || !this.brakeSound || !this.surfaceAudio) {
            this.setupAudio();
        }

        if (!this.engineLayerManager) {
            return;
        }

        if (this.isAudioFadingOut) {
            this.audioFadeMultiplier = Math.max(0, this.audioFadeMultiplier - dt * AUDIO_FADE_RATE);
            if (this.audioFadeMultiplier <= 0) {
                this.engineLayerManager.stop();
                if (this.brakeSound && this.brakeSound.isPlaying) {
                    this.brakeSound.stop();
                }
                this.surfaceAudio?.update(0, 1.0, false); // silence squeal/rumble
                return;
            }
        }

        let currentSpeed = Math.abs(this.controller.getSpeed());
        if (!this.isLocalPlayer) {
            currentSpeed = this.position.distanceTo(this.targetPosition) * 10;
        }
        currentSpeed = finiteOr(currentSpeed, 0);
        const maxSpeed = this.controller.getMaxSpeed();
        const normalizedSpeed = normalizeAudioSpeed(currentSpeed, maxSpeed);
        const speedDelta = currentSpeed - this.previousAudioSpeed;
        const decelerationFactor = THREE.MathUtils.clamp(-speedDelta / 8, 0, 1);
        const fade = this.audioFadeMultiplier;
        this.engineLayerManager.update(currentSpeed, maxSpeed, dt, fade);

        const isDrifting = this.driftState === DriftState.DRIFTING;
        this.surfaceAudio?.update(currentSpeed, this.currentFrictionMultiplier, isDrifting);
        const shouldTriggerBrake = this.isLocalPlayer
            ? this.controller.isBraking() && currentSpeed > 1.5
            : decelerationFactor > 0.25 && currentSpeed > 3;
        const nowMs = performance.now();
        if (this.brakeSound && shouldTriggerBrake && nowMs - this.lastBrakeTriggerAtMs > 450 && fade > 0.1) {
            if (this.brakeSound.isPlaying) {
                this.brakeSound.stop();
            }
            const brakeVolume = THREE.MathUtils.clamp(0.65 + normalizedSpeed * 0.45, 0.65, 1.0) * fade;
            const brakeRate = THREE.MathUtils.clamp(0.95 + normalizedSpeed * 0.35, 0.95, 1.25);
            this.brakeSound.setVolume(finiteOr(brakeVolume, 0.65));
            this.brakeSound.setPlaybackRate(finiteOr(brakeRate, 1));
            this.brakeSound.play();
            this.lastBrakeTriggerAtMs = nowMs;
        }

        this.previousAudioSpeed = currentSpeed;
    }

    private handleNetworkInterpolation() {
        const nextState = this.controller.updateRemote(
            { position: this.position, rotationY: this.rotationY },
            this.targetPosition,
            this.targetRotationY,
        );

        this.position.copy(nextState.position);
        this.rotationY = nextState.rotationY;
        this.visual.applyTransform(this.mesh, this.position, this.rotationY);
    }

    private handleLocalMovement(dt: number) {
        if (!this.inputManager) {
            return;
        }

        const nextState = this.controller.updateLocal(
            { position: this.position, rotationY: this.rotationY },
            this.inputManager,
            dt,
        );

        this.position.copy(nextState.position);
        this.rotationY = nextState.rotationY;
        this.visual.applyTransform(this.mesh, this.position, this.rotationY);
    }

    public reset() {
        this.position.set(0, 0, 0);
        this.rotationY = 0;
        this.flipElapsedMs = null;
        if (this.gltfWrapper) {
            this.gltfWrapper.rotation.x = 0;
            this.gltfWrapper.rotation.z = 0;
            this.gltfWrapper.position.y = 0;
        }
        this.driftState = 0;
        this.driftAngle = 0;
        this.driftBoostTier = 0;
        this.previousBoostTier = 0;
        this.boostFlashIntensity = 0;
        this.currentFrictionMultiplier = 1.0;
        // Reset dirt overlay on race restart
        this.setDirtIntensity(0);
        this.controller.reset();
        this.previousAudioSpeed = 0;
        this.lastBrakeTriggerAtMs = 0;
        this.audioFadeMultiplier = 1;
        this.isAudioFadingOut = false;
        this.hasDopplerSample = false;
        this.visual.applyTransform(this.mesh, this.position, this.rotationY);

        this.engineLayerManager?.restart();
        this.surfaceAudio?.restart();
    }

    public getSpeed = () => {
        return this.controller.getSpeed();
    };

    /**
     * Set the dirt intensity for all body paint materials (0 = clean, 1 = fully dirty).
     * Called each frame by the game loop, scaling with race progress (lap / totalLaps).
     * Resets to 0 on race restart.
     *
     * @param value - Dirt intensity in range [0, 1]
     */
    public setDirtIntensity = (value: number): void => {
        for (const ref of this.paintRefs) {
            ref.setDirtIntensity(value);
        }
    };

    public setMovementMultiplier = (multiplier: number) => {
        this.controller.setMovementMultiplier(multiplier);
    };

    public fadeOutAudio = () => {
        this.isAudioFadingOut = true;
    };

    /**
     * Update Doppler effect for remote car engine sounds.
     * Should be called each frame for remote cars with listener position and velocity.
     * Local player car does NOT have Doppler applied.
     *
     * @param listenerPosition - Position of the local player/camera
     * @param listenerVelocity - Velocity of the local player/camera
     * @param dt - Delta time in seconds
     */
    public updateDoppler = (listenerPosition: THREE.Vector3, listenerVelocity: THREE.Vector3, dt: number) => {
        // Only apply Doppler to remote cars, not local player
        if (this.isLocalPlayer || !this.engineLayerManager) {
            return;
        }

        if (!Number.isFinite(dt) || dt <= DOPPLER_DT_EPS) {
            this.currentVelocity.set(0, 0, 0);
            this.engineLayerManager.setPlaybackRate(1);
            this.previousPosition.copy(this.position);
            return;
        }

        if (!this.hasDopplerSample) {
            this.currentVelocity.set(0, 0, 0);
            this.engineLayerManager.setPlaybackRate(1);
            this.previousPosition.copy(this.position);
            this.hasDopplerSample = true;
            return;
        }

        // Calculate velocity from position delta (frame-over-frame) using scratch vector
        this.scratchPositionDelta.subVectors(this.position, this.previousPosition);
        this.currentVelocity.copy(this.scratchPositionDelta).divideScalar(dt);

        // Calculate line-of-sight direction from listener to source using scratch vector
        this.scratchToSource.subVectors(this.position, listenerPosition).normalize();

        // Calculate relative velocity (source - listener) using scratch vector
        this.scratchRelativeVelocity.subVectors(this.currentVelocity, listenerVelocity);

        // Project onto line-of-sight (radial velocity)
        // Positive = receding, Negative = approaching
        const radialVelocity = this.scratchRelativeVelocity.dot(this.scratchToSource);

        // Calculate Doppler rate and apply to engine audio
        const dopplerRate = calculateDopplerRate(radialVelocity);
        this.engineLayerManager.setPlaybackRate(dopplerRate);

        // Store current position for next frame
        this.previousPosition.copy(this.position);
    };

    public dispose() {
        if (this.engineLayerManager) {
            this.engineLayerManager.stop();
            this.engineLayerManager.disconnectFrom(this.mesh);
            this.engineLayerManager = undefined;
        }

        if (this.brakeSound) {
            if (this.brakeSound.isPlaying) {
                this.brakeSound.stop();
            }
            this.mesh.remove(this.brakeSound);
            this.brakeSound.disconnect();
            this.brakeSound = undefined;
        }

        if (this.surfaceAudio) {
            this.surfaceAudio.dispose();
            this.surfaceAudio.detachFrom(this.mesh);
            this.surfaceAudio = undefined;
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
