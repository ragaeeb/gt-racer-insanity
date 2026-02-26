import * as THREE from 'three';
import { clamp01 } from '@/shared/utils/math';

type CameraShakeOptions = {
    damping: number;
    maxOffset: THREE.Vector3;
    maxVelocity: THREE.Vector3;
    random: () => number;
    settleOffsetSq: number;
    settleVelocitySq: number;
    spring: number;
};

type CameraShakeOptionsInput = Partial<CameraShakeOptions>;

const createDefaultOptions = (): CameraShakeOptions => {
    return {
        damping: 10,
        maxOffset: new THREE.Vector3(0.7, 0.45, 0.3),
        maxVelocity: new THREE.Vector3(2.6, 1.9, 1.3),
        random: Math.random,
        settleOffsetSq: 1e-6,
        settleVelocitySq: 1e-6,
        spring: 24,
    };
};

export class CameraShake {
    private readonly camera: THREE.Camera;
    private readonly options: CameraShakeOptions;
    private readonly offset = new THREE.Vector3();
    private readonly velocity = new THREE.Vector3();

    constructor(camera: THREE.Camera, options: CameraShakeOptionsInput = {}) {
        const defaults = createDefaultOptions();
        this.camera = camera;
        this.options = {
            ...defaults,
            ...options,
            maxOffset: options.maxOffset?.clone() ?? defaults.maxOffset,
            maxVelocity: options.maxVelocity?.clone() ?? defaults.maxVelocity,
        };
    }

    private randomSigned = () => {
        return this.options.random() * 2 - 1;
    };

    public trigger = (intensity: number) => {
        const clampedIntensity = clamp01(intensity);
        if (clampedIntensity <= 0) {
            return;
        }

        this.offset.x += this.randomSigned() * this.options.maxOffset.x * clampedIntensity;
        this.offset.y += this.randomSigned() * this.options.maxOffset.y * clampedIntensity;
        this.offset.z += this.randomSigned() * this.options.maxOffset.z * clampedIntensity;

        this.velocity.x += this.randomSigned() * this.options.maxVelocity.x * clampedIntensity;
        this.velocity.y += this.randomSigned() * this.options.maxVelocity.y * clampedIntensity;
        this.velocity.z += this.randomSigned() * this.options.maxVelocity.z * clampedIntensity;

        // Guard against a fully centered random sample producing no visible kick.
        if (this.offset.lengthSq() <= this.options.settleOffsetSq && this.velocity.lengthSq() <= this.options.settleVelocitySq) {
            this.offset.x = this.options.maxOffset.x * clampedIntensity * 0.25;
        }
    };

    public update = (dt: number) => {
        if (!Number.isFinite(dt) || dt <= 0) {
            return;
        }

        const maxStep = 1 / 120;
        const steps = Math.max(1, Math.ceil(dt / maxStep));
        for (let i = 0; i < steps; i++) {
            const consumedDt = i * maxStep;
            const remainingDt = dt - consumedDt;
            const stepDt = Math.min(remainingDt, maxStep);
            if (stepDt <= Number.EPSILON) {
                break;
            }

            const accelX = -this.options.spring * this.offset.x - this.options.damping * this.velocity.x;
            const accelY = -this.options.spring * this.offset.y - this.options.damping * this.velocity.y;
            const accelZ = -this.options.spring * this.offset.z - this.options.damping * this.velocity.z;

            this.velocity.x += accelX * stepDt;
            this.velocity.y += accelY * stepDt;
            this.velocity.z += accelZ * stepDt;

            this.offset.x += this.velocity.x * stepDt;
            this.offset.y += this.velocity.y * stepDt;
            this.offset.z += this.velocity.z * stepDt;
        }

        if (this.offset.lengthSq() <= this.options.settleOffsetSq && this.velocity.lengthSq() <= this.options.settleVelocitySq) {
            this.reset();
        }
    };

    public getOffset = () => {
        return this.offset.clone();
    };

    public apply = () => {
        this.camera.position.add(this.offset);
    };

    public reset = () => {
        this.offset.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
    };
}
