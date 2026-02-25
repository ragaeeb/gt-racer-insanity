import * as THREE from 'three';

export type ParticleType = 'SMOKE' | 'SPARK' | 'BOOST';

export type EmitConfig = {
    type: ParticleType;
    color?: number;
    size?: number;
    lifetime?: number;
    velocityX?: number;
    velocityY?: number;
    velocityZ?: number;
};

// Particle data structure for CPU-side simulation
type Particle = {
    active: boolean;
    age: number;
    lifetime: number;
    velocityX: number;
    velocityY: number;
    velocityZ: number;
    type: ParticleType;
    baseSize: number;
};

// Default configurations for each particle type
const PARTICLE_CONFIGS: Record<ParticleType, { color: number; size: number; lifetime: number; vy: number }> = {
    SMOKE: {
        color: 0xdddddd, // Light gray
        size: 2.0,
        lifetime: 1.5,
        vy: 0.3, // Slow upward drift
    },
    SPARK: {
        color: 0xffaa00, // Orange/yellow
        size: 0.8,
        lifetime: 0.6,
        vy: 2.0, // Fast upward
    },
    BOOST: {
        color: 0x00ffff, // Cyan
        size: 1.5,
        lifetime: 0.8,
        vy: 0.0, // Stationary relative to world
    },
};

/**
 * Pooled particle system using THREE.Points for high-performance rendering.
 * Supports tire smoke, collision sparks, and boost trails.
 * Uses ring buffer recycling for maximum 512 particles with <5 draw calls.
 */
export class ParticlePool {
    private particles: Particle[] = [];
    private positions: Float32Array;
    private colors: Float32Array;
    private sizes: Float32Array;
    private points: THREE.Points;
    private geometry: THREE.BufferGeometry;
    private material: THREE.PointsMaterial;
    private maxParticles: number;
    private nextIndex = 0;

    // Pre-allocated scratch objects to avoid GC in hot paths
    private scratchColor = new THREE.Color();
    private scratchVelocity = new THREE.Vector3();

    constructor(scene: THREE.Scene, maxParticles = 512) {
        this.maxParticles = maxParticles;

        // Initialize particle state array
        this.particles = Array.from({ length: maxParticles }, () => ({
            active: false,
            age: 0,
            lifetime: 1,
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
            type: 'SMOKE' as ParticleType,
            baseSize: 1,
        }));

        // Allocate GPU buffer arrays
        this.positions = new Float32Array(maxParticles * 3);
        this.colors = new Float32Array(maxParticles * 3);
        this.sizes = new Float32Array(maxParticles);

        // Create buffer geometry with attributes
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

        // Create points material with vertex colors and transparency
        this.material = new THREE.PointsMaterial({
            size: 1,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        // Create single Points object for all particles
        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false; // Particles can spread beyond initial bounds
        scene.add(this.points);
    }

    /**
     * Emit a particle at the specified world position.
     * Uses ring buffer to recycle oldest particles when pool is full.
     */
    public emit(x: number, y: number, z: number, config: EmitConfig): void {
        const idx = this.nextIndex;
        this.nextIndex = (this.nextIndex + 1) % this.maxParticles;

        const particle = this.particles[idx];
        const typeConfig = PARTICLE_CONFIGS[config.type];

        particle.active = true;
        particle.age = 0;
        particle.lifetime = config.lifetime ?? typeConfig.lifetime;
        particle.type = config.type;
        particle.baseSize = config.size ?? typeConfig.size;

        // Set velocity with optional overrides
        particle.velocityX = config.velocityX ?? (Math.random() - 0.5) * 0.5; // Random spread X
        particle.velocityY = config.velocityY ?? typeConfig.vy;
        particle.velocityZ = config.velocityZ ?? (Math.random() - 0.5) * 0.5; // Random spread Z

        // Apply type-specific velocity modifiers
        if (config.type === 'SPARK') {
            // Sparks fly outward more energetically
            particle.velocityX *= 3;
            particle.velocityY = Math.random() * 3 + 1; // Upward burst
            particle.velocityZ *= 3;
        } else if (config.type === 'SMOKE') {
            // Smoke has more random horizontal drift
            particle.velocityX += (Math.random() - 0.5) * 0.3;
            particle.velocityZ += (Math.random() - 0.5) * 0.3;
        } else if (config.type === 'BOOST') {
            // Boost trails stay stationary relative to world
            particle.velocityX = 0;
            particle.velocityY = 0;
            particle.velocityZ = 0;
        }

        // Set position
        this.positions[idx * 3 + 0] = x;
        this.positions[idx * 3 + 1] = y;
        this.positions[idx * 3 + 2] = z;

        // Set color
        this.scratchColor.setHex(config.color ?? typeConfig.color);
        this.colors[idx * 3 + 0] = this.scratchColor.r;
        this.colors[idx * 3 + 1] = this.scratchColor.g;
        this.colors[idx * 3 + 2] = this.scratchColor.b;

        // Set initial size
        this.sizes[idx] = particle.baseSize;
    }

    /**
     * Emit smoke particles from tire positions during drift/braking.
     */
    public emitSmoke(x: number, y: number, z: number): void {
        this.emit(x, y, z, { type: 'SMOKE' });
    }

    /**
     * Emit spark particles at collision point.
     */
    public emitSpark(x: number, y: number, z: number, normalX?: number, normalY?: number, normalZ?: number): void {
        // Sparks bounce off collision normal
        const vx = (normalX ?? 0) * 5 + (Math.random() - 0.5) * 3;
        const vy = (normalY ?? 1) * 4 + Math.random() * 2;
        const vz = (normalZ ?? 0) * 5 + (Math.random() - 0.5) * 3;
        this.emit(x, y, z, { type: 'SPARK', velocityX: vx, velocityY: vy, velocityZ: vz });
    }

    /**
     * Emit boost trail particles from exhaust.
     */
    public emitBoost(x: number, y: number, z: number): void {
        this.emit(x, y, z, { type: 'BOOST' });
    }

    /**
     * Update all active particles. Called each frame.
     */
    public update(dt: number): void {
        for (let i = 0; i < this.maxParticles; i++) {
            const particle = this.particles[i];
            if (!particle.active) continue;

            particle.age += dt;

            // Check if particle has expired
            if (particle.age >= particle.lifetime) {
                particle.active = false;
                this.sizes[i] = 0; // Hide by setting size to 0
                continue;
            }

            // Calculate life ratio (0 = just born, 1 = about to die)
            const lifeRatio = particle.age / particle.lifetime;

            // Update position based on velocity
            this.positions[i * 3 + 0] += particle.velocityX * dt;
            this.positions[i * 3 + 1] += particle.velocityY * dt;
            this.positions[i * 3 + 2] += particle.velocityZ * dt;

            // Apply type-specific behavior
            if (particle.type === 'SMOKE') {
                // Smoke expands and slows down
                const expansion = 1 + lifeRatio * 2;
                this.sizes[i] = particle.baseSize * expansion;

                // Smoke slows down (drag)
                particle.velocityX *= 0.98;
                particle.velocityY *= 0.98;
                particle.velocityZ *= 0.98;

                // Smoke rises slightly
                particle.velocityY += 0.1 * dt;
            } else if (particle.type === 'SPARK') {
                // Sparks affected by gravity
                particle.velocityY -= 9.8 * dt; // Gravity

                // Sparks shrink rapidly
                this.sizes[i] = particle.baseSize * (1 - lifeRatio * 0.8);
            } else if (particle.type === 'BOOST') {
                // Boost trails shrink over time
                this.sizes[i] = particle.baseSize * (1 - lifeRatio);
            }

            // Fade out colors (only affects RGB, alpha handled by material opacity)
            const fadeMultiplier = 1 - lifeRatio;
            this.colors[i * 3 + 0] *= 0.99; // Slight continuous fade
            this.colors[i * 3 + 1] *= 0.99;
            this.colors[i * 3 + 2] *= 0.99;
        }

        // Mark buffers for GPU upload
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.attributes.size.needsUpdate = true;
    }

    /**
     * Get the number of currently active particles.
     */
    public getActiveCount(): number {
        let count = 0;
        for (let i = 0; i < this.maxParticles; i++) {
            if (this.particles[i].active) count++;
        }
        return count;
    }

    /**
     * Get the maximum capacity of the pool.
     */
    public getCapacity(): number {
        return this.maxParticles;
    }

    /**
     * Get the THREE.Points object for scene management.
     */
    public getMesh(): THREE.Points {
        return this.points;
    }

    /**
     * Clean up resources.
     */
    public dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }
}
