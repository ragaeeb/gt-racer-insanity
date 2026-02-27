import { describe, expect, it } from 'bun:test';
import type { TrackSegmentManifest } from '@/shared/game/track/trackManifest';
import { computeSegmentColliderTransform, eulerToQuaternion } from './trackColliderBuilder';

const FLOAT_EPSILON = 1e-6;

const quatIsIdentity = (q: { w: number; x: number; y: number; z: number }) =>
    Math.abs(q.w - 1) < FLOAT_EPSILON &&
    Math.abs(q.x) < FLOAT_EPSILON &&
    Math.abs(q.y) < FLOAT_EPSILON &&
    Math.abs(q.z) < FLOAT_EPSILON;

const quatIsNormalized = (q: { w: number; x: number; y: number; z: number }) => {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    return Math.abs(len - 1) < FLOAT_EPSILON;
};

describe('eulerToQuaternion', () => {
    it('should return identity quaternion for zero angles', () => {
        const q = eulerToQuaternion(0, 0, 0);
        expect(quatIsIdentity(q)).toBeTrue();
    });

    it('should produce a normalized quaternion for arbitrary angles', () => {
        const q = eulerToQuaternion(0.3, 0, 0.1);
        expect(quatIsNormalized(q)).toBeTrue();
    });

    it('should rotate purely around X for pitch-only input', () => {
        const angle = 0.2; // ~11.5 degrees
        const q = eulerToQuaternion(angle, 0, 0);
        // For pure X rotation: q = { x: sin(a/2), y: 0, z: 0, w: cos(a/2) }
        expect(q.x).toBeCloseTo(Math.sin(angle / 2), 5);
        expect(q.y).toBeCloseTo(0, 5);
        expect(q.z).toBeCloseTo(0, 5);
        expect(q.w).toBeCloseTo(Math.cos(angle / 2), 5);
    });

    it('should rotate purely around Z for roll-only input', () => {
        const angle = 0.15; // ~8.6 degrees
        const q = eulerToQuaternion(0, 0, angle);
        // For pure Z rotation: q = { x: 0, y: 0, z: sin(a/2), w: cos(a/2) }
        expect(q.x).toBeCloseTo(0, 5);
        expect(q.y).toBeCloseTo(0, 5);
        expect(q.z).toBeCloseTo(Math.sin(angle / 2), 5);
        expect(q.w).toBeCloseTo(Math.cos(angle / 2), 5);
    });
});

describe('computeSegmentColliderTransform', () => {
    it('should produce identity rotation for a flat segment', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-flat',
            lengthMeters: 300,
        };
        const transform = computeSegmentColliderTransform(segment, 0);

        expect(quatIsIdentity(transform.rotation)).toBeTrue();
        expect(transform.centerY).toBeCloseTo(-0.6, 3);
        expect(transform.centerZ).toBeCloseTo(150, 3);
    });

    it('should produce non-zero X rotation for a sloped segment', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-ramp',
            lengthMeters: 200,
            elevationStartM: 0,
            elevationEndM: 8,
        };
        const transform = computeSegmentColliderTransform(segment, 0);

        // Slope angle = atan2(8, 200) ≈ 0.03997 rad
        // Rotation around X axis → q.x should be non-zero
        expect(transform.rotation.x).not.toBeCloseTo(0, 3);
        expect(quatIsNormalized(transform.rotation)).toBeTrue();
    });

    it('should position the collider at the midpoint elevation for a ramp', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-ramp',
            lengthMeters: 200,
            elevationStartM: 0,
            elevationEndM: 8,
        };
        const transform = computeSegmentColliderTransform(segment, 0);

        // Midpoint elevation = (0 + 8) / 2 = 4, minus floor half-height 0.6
        expect(transform.centerY).toBeCloseTo(4 - 0.6, 3);
    });

    it('should offset centerZ by segmentStartZ', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-b',
            lengthMeters: 100,
        };
        // Segment starts at Z=300
        const transform = computeSegmentColliderTransform(segment, 300);
        expect(transform.centerZ).toBeCloseTo(350, 3);
    });

    it('should produce Z-axis rotation for a banked segment', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-banked',
            lengthMeters: 200,
            bankAngleDeg: 15,
        };
        const transform = computeSegmentColliderTransform(segment, 0);

        // Bank angle of 15° → rotation around Z axis → q.z should be non-zero
        expect(transform.rotation.z).not.toBeCloseTo(0, 3);
        expect(quatIsNormalized(transform.rotation)).toBeTrue();
    });

    it('should combine slope and bank into a single normalized quaternion', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-combo',
            lengthMeters: 200,
            elevationStartM: 0,
            elevationEndM: 8,
            bankAngleDeg: 10,
        };
        const transform = computeSegmentColliderTransform(segment, 0);

        // Both X and Z components should be non-zero
        expect(transform.rotation.x).not.toBeCloseTo(0, 3);
        expect(transform.rotation.z).not.toBeCloseTo(0, 3);
        expect(quatIsNormalized(transform.rotation)).toBeTrue();
    });

    it('should handle elevated flat segment (constant elevation, no slope)', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-high',
            lengthMeters: 100,
            elevationStartM: 8,
            elevationEndM: 8,
        };
        const transform = computeSegmentColliderTransform(segment, 0);

        // No slope → identity rotation
        expect(quatIsIdentity(transform.rotation)).toBeTrue();
        // Positioned at elevation 8 minus floor half-height
        expect(transform.centerY).toBeCloseTo(8 - 0.6, 3);
    });

    it('should handle descending ramp with opposite slope rotation', () => {
        const ascending: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-up',
            lengthMeters: 200,
            elevationStartM: 0,
            elevationEndM: 8,
        };
        const descending: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-down',
            lengthMeters: 200,
            elevationStartM: 8,
            elevationEndM: 0,
        };
        const upTransform = computeSegmentColliderTransform(ascending, 0);
        const downTransform = computeSegmentColliderTransform(descending, 200);

        // Descending slope should have opposite X rotation sign
        expect(Math.sign(upTransform.rotation.x)).not.toBe(Math.sign(downTransform.rotation.x));
    });

    it('should handle negative bank angle (left bank)', () => {
        const rightBank: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-right',
            lengthMeters: 100,
            bankAngleDeg: 15,
        };
        const leftBank: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-left',
            lengthMeters: 100,
            bankAngleDeg: -15,
        };

        const rightTransform = computeSegmentColliderTransform(rightBank, 0);
        const leftTransform = computeSegmentColliderTransform(leftBank, 0);

        // Opposite Z rotation signs
        expect(Math.sign(rightTransform.rotation.z)).not.toBe(Math.sign(leftTransform.rotation.z));
    });
});

describe('segment boundary continuity', () => {
    it('should place consecutive segment colliders without gap at boundary', () => {
        const segA: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-a',
            lengthMeters: 200,
            elevationStartM: 0,
            elevationEndM: 5,
        };
        const segB: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-b',
            lengthMeters: 200,
            elevationStartM: 5,
            elevationEndM: 10,
        };

        const transformA = computeSegmentColliderTransform(segA, 0);
        const transformB = computeSegmentColliderTransform(segB, 200);

        // The end of A's Z coverage and the start of B's Z coverage should be Z=200
        const endOfA = transformA.centerZ + segA.lengthMeters / 2;
        const startOfB = transformB.centerZ - segB.lengthMeters / 2;
        expect(endOfA).toBeCloseTo(startOfB, 3);
    });

    it('should have matching elevation at boundary between ascending and flat segments', () => {
        const ramp: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-ramp',
            lengthMeters: 200,
            elevationStartM: 0,
            elevationEndM: 8,
        };
        const flat: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-high',
            lengthMeters: 100,
            elevationStartM: 8,
            elevationEndM: 8,
        };

        const rampTransform = computeSegmentColliderTransform(ramp, 0);
        const flatTransform = computeSegmentColliderTransform(flat, 200);

        // Ramp endpoint elevation = 8, flat start elevation = 8
        // Both centers should reflect this continuous elevation
        const rampEndElevation = rampTransform.centerY + 0.6 + (8 - 0) / 2; // center + halfH + halfRise
        const flatStartElevation = flatTransform.centerY + 0.6; // flat segment, center = elevation - halfH

        // The elevations at the boundary should be close
        expect(rampEndElevation).toBeCloseTo(flatStartElevation, 1);
    });
});

describe('wall collider elevation', () => {
    it('should produce wall colliders at elevated position for raised segments', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-high',
            lengthMeters: 100,
            elevationStartM: 8,
            elevationEndM: 8,
        };
        const transform = computeSegmentColliderTransform(segment, 0);

        // Wall base should match floor elevation
        // wallCenterY = midElevation + wallHeight
        // wallCenterY = midElevation(8) + wallHeight(3) = 11
        expect(transform.wallCenterY).toBeCloseTo(11, 1);
    });

    it('should produce wall colliders at ground level for flat segments', () => {
        const segment: TrackSegmentManifest = {
            frictionMultiplier: 1,
            id: 'seg-flat',
            lengthMeters: 100,
        };
        const transform = computeSegmentColliderTransform(segment, 0);

        // Wall center Y should be at default wall height (no elevation offset)
        expect(transform.wallCenterY).toBeCloseTo(3, 1); // DEFAULT_WALL_HEIGHT_METERS
    });

    it('should produce non-identity rotation for banked segments', () => {
        // Regression: banked segments must produce a rotation quaternion that
        // tilts colliders. If the rotation is identity (w=1), the banking
        // has no effect on wall or floor collider orientation.
        const segment: TrackSegmentManifest = {
            bankAngleDeg: 15,
            frictionMultiplier: 1,
            id: 'seg-banked',
            lengthMeters: 100,
        };
        const transform = computeSegmentColliderTransform(segment, 0);

        // A 15° bank should produce a non-identity quaternion
        // Identity quaternion is {x:0, y:0, z:0, w:1}
        expect(transform.rotation.z).not.toBeCloseTo(0, 3);
    });

    it('should produce opposite rotation directions for positive vs negative bank', () => {
        const leftBank: TrackSegmentManifest = {
            bankAngleDeg: 10,
            frictionMultiplier: 1,
            id: 'seg-left',
            lengthMeters: 100,
        };
        const rightBank: TrackSegmentManifest = {
            bankAngleDeg: -10,
            frictionMultiplier: 1,
            id: 'seg-right',
            lengthMeters: 100,
        };

        const leftTransform = computeSegmentColliderTransform(leftBank, 0);
        const rightTransform = computeSegmentColliderTransform(rightBank, 0);

        // Opposite bank angles should produce opposite Z rotation components
        expect(Math.sign(leftTransform.rotation.z)).not.toEqual(Math.sign(rightTransform.rotation.z));
    });
});

describe('buildTrackColliders — track variants', () => {
    it('should build colliders for neon-city without error', async () => {
        const { buildTrackColliders } = await import('./trackColliderBuilder');
        const { createRapierWorld } = await import('./rapierWorld');
        const { world, rapier } = createRapierWorld(1 / 60);

        const result = buildTrackColliders(rapier, world, {
            seed: 2,
            totalLaps: 2,
            trackId: 'neon-city',
        });

        expect(result.finishBarrierColliderHandle).toBeGreaterThanOrEqual(0);
        expect(result.totalTrackLengthMeters).toBeGreaterThan(0);
    });

    it('should use default track width when not specified', async () => {
        const { buildTrackColliders } = await import('./trackColliderBuilder');
        const { createRapierWorld } = await import('./rapierWorld');
        const { world, rapier } = createRapierWorld(1 / 60);

        const result = buildTrackColliders(rapier, world, {
            seed: 3,
            totalLaps: 1,
            trackId: 'sunset-loop',
        });

        expect(result.trackWidthMeters).toBeGreaterThan(0);
    });

    it('should fall back to default track and warn when requesting an unknown track id', async () => {
        const { buildTrackColliders } = await import('./trackColliderBuilder');
        const { createRapierWorld } = await import('./rapierWorld');
        const { world, rapier } = createRapierWorld(1 / 60);

        const warns: string[] = [];
        const origWarn = console.warn.bind(console);
        console.warn = (...args: unknown[]) => {
            if (typeof args[0] === 'string') {
                warns.push(args[0]);
            }
            origWarn(...args);
        };

        try {
            const result = buildTrackColliders(rapier, world, {
                seed: 1,
                totalLaps: 1,
                trackId: 'nonexistent-track-id',
            });
            // Should still succeed with a fallback track
            expect(result.totalTrackLengthMeters).toBeGreaterThan(0);
            expect(warns.some((w) => w.includes('[TrackColliderBuilder]'))).toBeTrue();
        } finally {
            console.warn = origWarn;
        }
    });
});
