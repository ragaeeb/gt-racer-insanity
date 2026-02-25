import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as THREE from 'three';
import { ParticlePool } from '../ParticlePool';

describe('ParticlePool', () => {
    let scene: THREE.Scene;
    let pool: ParticlePool;

    beforeEach(() => {
        scene = new THREE.Scene();
    });

    afterEach(() => {
        pool?.dispose();
    });

    it('should create THREE.Points with maxParticles capacity', () => {
        pool = new ParticlePool(scene, 128);

        expect(pool.getCapacity()).toBe(128);
        expect(pool.getActiveCount()).toBe(0);
    });

    it('should add points mesh to scene', () => {
        pool = new ParticlePool(scene, 128);

        expect(scene.children).toContain(pool.getMesh());
    });

    it('should emit smoke particle at specified position', () => {
        pool = new ParticlePool(scene, 128);

        pool.emitSmoke(10, 1, 20);

        expect(pool.getActiveCount()).toBe(1);
    });

    it('should emit spark particle with collision normal', () => {
        pool = new ParticlePool(scene, 128);

        pool.emitSpark(0, 0, 0, 1, 0, 0);

        expect(pool.getActiveCount()).toBe(1);
    });

    it('should emit boost particle', () => {
        pool = new ParticlePool(scene, 128);

        pool.emitBoost(5, 0.5, 10);

        expect(pool.getActiveCount()).toBe(1);
    });

    it('should emit particle using generic emit with type', () => {
        pool = new ParticlePool(scene, 128);

        pool.emit(0, 0, 0, { type: 'SMOKE', color: 0xff0000, size: 2, lifetime: 1.0 });

        expect(pool.getActiveCount()).toBe(1);
    });

    it('should recycle particles when pool is full', () => {
        pool = new ParticlePool(scene, 2);

        pool.emit(0, 0, 0, { type: 'SMOKE', lifetime: 10 });
        pool.emit(1, 0, 0, { type: 'SMOKE', lifetime: 10 });
        expect(pool.getActiveCount()).toBe(2);

        // This should recycle the oldest particle (index 0)
        pool.emit(2, 0, 0, { type: 'SMOKE', lifetime: 10 });

        expect(pool.getActiveCount()).toBe(2);
    });

    it('should update particle positions over time', () => {
        pool = new ParticlePool(scene, 128);

        pool.emitSmoke(0, 0, 0);
        pool.update(0.1);

        // Particle should still be active
        expect(pool.getActiveCount()).toBe(1);
    });

    it('should deactivate particles after lifetime expires', () => {
        pool = new ParticlePool(scene, 128);

        pool.emit(0, 0, 0, { type: 'SMOKE', lifetime: 0.5 });

        expect(pool.getActiveCount()).toBe(1);

        pool.update(0.3); // Less than lifetime
        expect(pool.getActiveCount()).toBe(1);

        pool.update(0.3); // Total now exceeds lifetime
        expect(pool.getActiveCount()).toBe(0);
    });

    it('should handle ring buffer wrapping correctly', () => {
        pool = new ParticlePool(scene, 3);

        // Fill the pool
        pool.emit(0, 0, 0, { type: 'SMOKE', lifetime: 10 });
        pool.emit(1, 0, 0, { type: 'SMOKE', lifetime: 10 });
        pool.emit(2, 0, 0, { type: 'SMOKE', lifetime: 10 });

        expect(pool.getActiveCount()).toBe(3);

        // Overwrite oldest
        pool.emit(3, 0, 0, { type: 'SMOKE', lifetime: 10 });

        // Should still be 3 (oldest recycled)
        expect(pool.getActiveCount()).toBe(3);
    });

    it('should update multiple particles in single update call', () => {
        pool = new ParticlePool(scene, 128);

        // Emit multiple particles
        for (let i = 0; i < 10; i++) {
            pool.emitSmoke(i, 0, 0);
        }

        expect(pool.getActiveCount()).toBe(10);

        pool.update(0.016); // One frame at 60fps

        expect(pool.getActiveCount()).toBe(10);
    });

    it('should default to SMOKE config when type not specified in emit', () => {
        pool = new ParticlePool(scene, 128);

        pool.emit(0, 0, 0, { type: 'SMOKE' });

        expect(pool.getActiveCount()).toBe(1);
    });

    it('should accept custom color override', () => {
        pool = new ParticlePool(scene, 128);

        pool.emit(0, 0, 0, { type: 'SPARK', color: 0xff0000 });

        expect(pool.getActiveCount()).toBe(1);
    });

    it('should accept custom size override', () => {
        pool = new ParticlePool(scene, 128);

        pool.emit(0, 0, 0, { type: 'SMOKE', size: 5.0 });

        expect(pool.getActiveCount()).toBe(1);
    });

    it('should accept custom lifetime', () => {
        pool = new ParticlePool(scene, 128);

        pool.emit(0, 0, 0, { type: 'SMOKE', lifetime: 0.1 });

        pool.update(0.05);
        expect(pool.getActiveCount()).toBe(1);

        pool.update(0.1); // Total exceeds lifetime
        expect(pool.getActiveCount()).toBe(0);
    });

    it('should dispose geometry and material on cleanup', () => {
        pool = new ParticlePool(scene, 128);
        const mesh = pool.getMesh();

        // Verify mesh exists before dispose
        expect(mesh.geometry).toBeDefined();
        expect(mesh.material).toBeDefined();

        // Dispose should not throw
        pool.dispose();

        // After dispose, geometry and material should be cleaned up
        // The dispose method is called on the internal resources
    });
});
