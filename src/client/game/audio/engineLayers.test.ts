import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { calculateLayerGains } from './engineLayerManager';
import { EngineLayerManager } from './engineLayerManager';

describe('Engine Layer Crossfade', () => {
    it('should use only idle layer at 0 m/s', () => {
        const gains = calculateLayerGains(0, 40);
        expect(gains.idle).toBeGreaterThan(0.8);
        expect(gains.mid).toBeLessThan(0.2);
        expect(gains.high).toBe(0);
    });

    it('should crossfade to mid layer at 50% max speed', () => {
        const gains = calculateLayerGains(20, 40);
        expect(gains.mid).toBeGreaterThan(0.5);
    });

    it('should use only high layer at max speed', () => {
        const gains = calculateLayerGains(40, 40);
        expect(gains.high).toBeGreaterThan(0.8);
        expect(gains.idle).toBe(0);
    });

    it('should sum to approximately 1.0', () => {
        const gains = calculateLayerGains(25, 40);
        const sum = gains.idle + gains.mid + gains.high;
        expect(sum).toBeCloseTo(1.0, 1);
    });

    it('should hit full mid at the idle→mid boundary (0.33)', () => {
        const gains = calculateLayerGains(13.2, 40); // 13.2 / 40 = 0.33
        expect(gains.idle).toBeCloseTo(0, 3);
        expect(gains.mid).toBeCloseTo(1, 3);
        expect(gains.high).toBe(0);
    });

    it('should still be full mid at the mid→high boundary start (0.66)', () => {
        const gains = calculateLayerGains(26.4, 40); // 26.4 / 40 = 0.66
        expect(gains.idle).toBe(0);
        expect(gains.mid).toBeCloseTo(1, 3);
        expect(gains.high).toBeCloseTo(0, 3);
    });

    it('should remain finite when maxSpeed is non-positive', () => {
        const gains = calculateLayerGains(10, 0);
        expect(gains.idle + gains.mid + gains.high).toBeCloseTo(1, 3);
    });
});

class FakePositionalAudio extends THREE.Object3D {
    public isPlaying = true;
    public volume = 0;
    public playbackRate = 1;
    public playCalls = 0;
    public stopCalls = 0;
    public disconnectCalls = 0;
    public gain = {
        connect: () => undefined,
        disconnect: () => undefined,
    };

    public setVolume = (value: number) => {
        this.volume = value;
    };

    public setPlaybackRate = (value: number) => {
        this.playbackRate = value;
    };

    public play = () => {
        this.playCalls += 1;
        this.isPlaying = true;
    };

    public stop = () => {
        this.stopCalls += 1;
        this.isPlaying = false;
    };

    public disconnect = () => {
        this.disconnectCalls += 1;
    };
}

describe('EngineLayerManager methods', () => {
    const createManagerWithFakeLayers = () => {
        const manager = new EngineLayerManager(
            { context: { state: 'running' } } as unknown as THREE.AudioListener,
            {},
            {
                gearShiftDipDurationMs: 140,
                gearShiftPitchDip: 0.7,
                rpmLayerCrossfadePoints: [0.33, 0.66],
            },
        );
        const idleSound = new FakePositionalAudio();
        const midSound = new FakePositionalAudio();
        const highSound = new FakePositionalAudio();

        const mutableManager = manager as unknown as {
            highSound?: FakePositionalAudio;
            idleSound?: FakePositionalAudio;
            midSound?: FakePositionalAudio;
        };
        mutableManager.idleSound = idleSound;
        mutableManager.midSound = midSound;
        mutableManager.highSound = highSound;

        return { highSound, idleSound, manager, midSound };
    };

    it('should attach and disconnect all audio layers from a mesh', () => {
        const { manager, idleSound, midSound, highSound } = createManagerWithFakeLayers();
        const mesh = new THREE.Object3D();

        manager.attachTo(mesh);
        expect(mesh.children.includes(idleSound)).toBeTrue();
        expect(mesh.children.includes(midSound)).toBeTrue();
        expect(mesh.children.includes(highSound)).toBeTrue();

        manager.disconnectFrom(mesh);
        expect(mesh.children.includes(idleSound)).toBeFalse();
        expect(mesh.children.includes(midSound)).toBeFalse();
        expect(mesh.children.includes(highSound)).toBeFalse();
        expect(idleSound.disconnectCalls).toBe(1);
        expect(midSound.disconnectCalls).toBe(1);
        expect(highSound.disconnectCalls).toBe(1);
    });

    it('should update layer volumes and playback rates', () => {
        const { manager, idleSound, midSound, highSound } = createManagerWithFakeLayers();

        manager.update(24, 40, 1 / 60, 0.9);
        expect(idleSound.volume + midSound.volume + highSound.volume).toBeCloseTo(0.9, 2);

        manager.setPlaybackRate(1.12);
        expect(idleSound.playbackRate).toBeGreaterThan(0);
        expect(midSound.playbackRate).toBeGreaterThan(0);
        expect(highSound.playbackRate).toBeGreaterThan(0);
    });

    it('should stop and restart all layers', () => {
        const { manager, idleSound, midSound, highSound } = createManagerWithFakeLayers();

        idleSound.isPlaying = true;
        midSound.isPlaying = true;
        highSound.isPlaying = true;
        manager.stop();
        expect(idleSound.stopCalls).toBe(1);
        expect(midSound.stopCalls).toBe(1);
        expect(highSound.stopCalls).toBe(1);

        manager.restart();
        expect(idleSound.playCalls).toBe(1);
        expect(midSound.playCalls).toBe(1);
        expect(highSound.playCalls).toBe(1);
    });
});
