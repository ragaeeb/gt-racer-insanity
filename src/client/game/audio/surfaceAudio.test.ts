import { describe, expect, it } from 'bun:test';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';
import {
    calculateRumbleVolume,
    calculateSquealPitch,
    calculateSquealVolume,
    DEFAULT_SURFACE_AUDIO_TUNING,
} from './surfaceAudio';

describe('Surface Audio — squeal volume', () => {
    it('should return 0 when not drifting', () => {
        const vol = calculateSquealVolume(30, 1.0, false);
        expect(vol).toBe(0);
    });

    it('should return 0 when below speed threshold on asphalt', () => {
        const vol = calculateSquealVolume(10, 1.0, true);
        expect(vol).toBe(0);
    });

    it('should return 0 on low-friction surface even when drifting fast', () => {
        // frictionMultiplier 0.5 < asphaltFrictionMin 0.9
        const vol = calculateSquealVolume(40, 0.5, true);
        expect(vol).toBe(0);
    });

    it('should return positive volume when drifting on asphalt above threshold', () => {
        const vol = calculateSquealVolume(30, 1.0, true);
        expect(vol).toBeGreaterThan(0);
    });

    it('should scale volume with speed above threshold', () => {
        const low = calculateSquealVolume(20, 1.0, true);
        const high = calculateSquealVolume(35, 1.0, true);
        expect(high).toBeGreaterThan(low);
    });

    it('should clamp volume to 1.0 at very high speeds', () => {
        const vol = calculateSquealVolume(200, 1.0, true);
        expect(vol).toBe(1.0);
    });

    it('should trigger on high-friction grip pad (frictionMultiplier > 1)', () => {
        const vol = calculateSquealVolume(25, 1.08, true);
        expect(vol).toBeGreaterThan(0);
    });
});

describe('Surface Audio — squeal pitch', () => {
    it('should return 1.0 for standard asphalt (frictionMultiplier = 1.0)', () => {
        expect(calculateSquealPitch(1.0)).toBeCloseTo(1.0, 5);
    });

    it('should return lower pitch for canyon surface (frictionMultiplier = 0.92)', () => {
        const pitch = calculateSquealPitch(0.92);
        expect(pitch).toBeLessThan(1.0);
        expect(pitch).toBeCloseTo(0.976, 2);
    });

    it('should return higher pitch for grip pad (frictionMultiplier = 1.08)', () => {
        const pitch = calculateSquealPitch(1.08);
        expect(pitch).toBeGreaterThan(1.0);
        expect(pitch).toBeCloseTo(1.024, 2);
    });

    it('should follow formula: 0.7 + frictionMultiplier * 0.3', () => {
        const friction = 0.75;
        expect(calculateSquealPitch(friction)).toBeCloseTo(0.7 + friction * 0.3, 5);
    });
});

describe('Surface Audio — rumble volume', () => {
    it('should return 0 on standard asphalt (frictionMultiplier = 1.0)', () => {
        const vol = calculateRumbleVolume(1.0);
        expect(vol).toBe(0);
    });

    it('should return 0 when frictionMultiplier is at or above gravelFrictionMax', () => {
        const vol = calculateRumbleVolume(DEFAULT_SURFACE_AUDIO_TUNING.gravelFrictionMax);
        expect(vol).toBe(0);
    });

    it('should return positive volume on gravel (frictionMultiplier < 0.8)', () => {
        const vol = calculateRumbleVolume(0.5);
        expect(vol).toBeGreaterThan(0);
    });

    it('should scale inversely with frictionMultiplier on gravel', () => {
        const low = calculateRumbleVolume(0.7);
        const high = calculateRumbleVolume(0.3);
        expect(high).toBeGreaterThan(low);
    });

    it('should scale by gravelRumbleVolume tuning parameter', () => {
        const tuning = { ...DEFAULT_SURFACE_AUDIO_TUNING, gravelRumbleVolume: 1.0 };
        const vol = calculateRumbleVolume(0.5, tuning);
        // (1 - 0.5) * 1.0 = 0.5
        expect(vol).toBeCloseTo(0.5, 5);
    });

    it('should peak near gravelRumbleVolume for extremely low friction', () => {
        const vol = calculateRumbleVolume(0.0);
        expect(vol).toBeCloseTo(DEFAULT_SURFACE_AUDIO_TUNING.gravelRumbleVolume, 5);
    });
});

describe('SurfaceAudioManager', () => {
    class FakePositionalAudio extends require('three').Object3D {
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
        public setVolume = (v: number) => {
            this.volume = v;
        };
        public setPlaybackRate = (v: number) => {
            this.playbackRate = v;
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
        public setBuffer = () => undefined;
        public setRefDistance = () => undefined;
        public setLoop = () => undefined;
    }

    const { SurfaceAudioManager } = require('./surfaceAudio');
    const THREE = require('three');

    const fakeListener = { context: { state: 'running' } } as unknown as import('three').AudioListener;

    it('should construct without sounds when no buffers are provided', () => {
        expect(() => new SurfaceAudioManager(fakeListener, {})).not.toThrow();
    });

    it('should attach sounds to a mesh when sounds are injected', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        const mesh = new THREE.Object3D();
        // Replace internal sounds with fakes (bypasses AudioContext creation)
        const squeal = new FakePositionalAudio();
        const rumble = new FakePositionalAudio();
        (manager as any).squealSound = squeal;
        (manager as any).rumbleSound = rumble;

        manager.attachTo(mesh);
        expect(mesh.children.includes(squeal)).toBeTrue();
        expect(mesh.children.includes(rumble)).toBeTrue();
    });

    it('should detach sounds from a mesh', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        const mesh = new THREE.Object3D();
        const squeal = new FakePositionalAudio();
        const rumble = new FakePositionalAudio();
        (manager as any).squealSound = squeal;
        (manager as any).rumbleSound = rumble;
        mesh.add(squeal);
        mesh.add(rumble);

        manager.detachFrom(mesh);
        expect(mesh.children.includes(squeal)).toBeFalse();
        expect(mesh.children.includes(rumble)).toBeFalse();
    });

    it('should call update on the squeal and rumble sounds', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        const squeal = new FakePositionalAudio();
        const rumble = new FakePositionalAudio();
        (manager as any).squealSound = squeal;
        (manager as any).rumbleSound = rumble;

        // High friction, drifting, fast speed → squeal active
        manager.update(40, 1.0, true);
        expect(squeal.volume).toBeGreaterThan(0);
        expect(squeal.playbackRate).toBeCloseTo(1.0, 3);
    });

    it('should stop playing sounds when stop is called', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        const squeal = new FakePositionalAudio();
        squeal.isPlaying = true;
        (manager as any).squealSound = squeal;

        manager.stop();
        expect(squeal.stopCalls).toBe(1);
    });

    it('should not stop sounds that are not playing', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        const squeal = new FakePositionalAudio();
        squeal.isPlaying = false;
        (manager as any).squealSound = squeal;

        manager.stop();
        expect(squeal.stopCalls).toBe(0);
    });

    it('should play sounds when restart is called and sound is not playing', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        const squeal = new FakePositionalAudio();
        squeal.isPlaying = false;
        (manager as any).squealSound = squeal;

        manager.restart();
        expect(squeal.playCalls).toBe(1);
    });

    it('should not play sounds when restart is called and sound is already playing', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        const squeal = new FakePositionalAudio();
        squeal.isPlaying = true;
        (manager as any).squealSound = squeal;

        manager.restart();
        expect(squeal.playCalls).toBe(0);
    });

    it('should disconnect sounds on dispose', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        const squeal = new FakePositionalAudio();
        squeal.isPlaying = false;
        const rumble = new FakePositionalAudio();
        rumble.isPlaying = false;
        (manager as any).squealSound = squeal;
        (manager as any).rumbleSound = rumble;

        manager.dispose();
        expect(squeal.disconnectCalls).toBe(1);
        expect(rumble.disconnectCalls).toBe(1);
    });

    it('should connect sounds through mix state effects gain node', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        const squeal = new FakePositionalAudio();
        const rumble = new FakePositionalAudio();
        let connectCalls = 0;
        squeal.gain.connect = () => {
            connectCalls++;
        };
        rumble.gain.connect = () => {
            connectCalls++;
        };
        (manager as any).squealSound = squeal;
        (manager as any).rumbleSound = rumble;

        const fakeMixManager = {
            getChannels: () => ({ effects: {} }),
        };
        manager.connectToMixState(fakeMixManager as any);
        expect(connectCalls).toBe(2);
    });

    it('should be a no-op when connectToMixState is called without a manager', () => {
        const manager = new SurfaceAudioManager(fakeListener, {});
        expect(() => manager.connectToMixState(undefined)).not.toThrow();
    });
});

describe('Surface Audio — real track friction integration checks', () => {
    const canyonTrack = getTrackManifestById('canyon-sprint');
    const canyonLowGrip = canyonTrack.segments.find((segment) => segment.id === 'seg-b')?.frictionMultiplier ?? 0.92;
    const canyonHighGrip = canyonTrack.segments.find((segment) => segment.id === 'seg-c')?.frictionMultiplier ?? 1.08;

    it('should produce squeal on canyon low-grip asphalt section while drifting at speed', () => {
        const squeal = calculateSquealVolume(40, canyonLowGrip, true);
        expect(squeal).toBeGreaterThan(0);
    });

    it('should produce no gravel rumble on canyon low-grip asphalt section', () => {
        const rumble = calculateRumbleVolume(canyonLowGrip);
        expect(rumble).toBe(0);
    });

    it('should produce higher squeal pitch on canyon high-grip section than low-grip section', () => {
        const lowGripPitch = calculateSquealPitch(canyonLowGrip);
        const highGripPitch = calculateSquealPitch(canyonHighGrip);
        expect(highGripPitch).toBeGreaterThan(lowGripPitch);
    });
});
