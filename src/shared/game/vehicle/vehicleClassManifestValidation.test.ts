import { describe, expect, it } from 'bun:test';
import type { VehicleClassManifest } from './vehicleClassManifest';
import { validateVehicleClassManifests } from './vehicleClassManifestValidation';

const makeManifest = (overrides: Partial<VehicleClassManifest> = {}): VehicleClassManifest =>
    ({
        id: 'sport',
        label: 'Sport',
        colorPaletteIds: ['red', 'blue'],
        physics: {
            maxForwardSpeed: 30,
            acceleration: 10,
            collisionMass: 1500,
            // other required fields with defaults
        } as any,
        ...overrides,
    }) as unknown as VehicleClassManifest;

describe('validateVehicleClassManifests', () => {
    it('should return isValid=true for a valid manifest', () => {
        const result = validateVehicleClassManifests([makeManifest()]);
        expect(result.isValid).toBeTrue();
        expect(result.issues).toHaveLength(0);
    });

    it('should reject non-integer abilityUseLimitPerRace', () => {
        const m = makeManifest({
            modifiers: { abilityUseLimitPerRace: 2.5 },
        });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
    });

    it('should reject NaN for powerupSpeedMultiplier', () => {
        const m = makeManifest({
            modifiers: { powerupSpeedMultiplier: NaN },
        });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
    });

    it('should reject Infinity for stunDurationMultiplier', () => {
        const m = makeManifest({
            modifiers: { stunDurationMultiplier: Infinity },
        });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
    });

    it('should return isValid=true for an empty array', () => {
        const result = validateVehicleClassManifests([]);
        expect(result.isValid).toBeTrue();
    });

    it('should detect duplicate vehicle class ids', () => {
        const a = makeManifest({ id: 'sport' });
        const b = makeManifest({ id: 'sport' });
        const result = validateVehicleClassManifests([a, b]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('Duplicate vehicle class id'))).toBeTrue();
    });

    it('should reject invalid maxForwardSpeed (zero)', () => {
        const m = makeManifest({ physics: { maxForwardSpeed: 0, acceleration: 10, collisionMass: 1500 } as any });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('Invalid maxForwardSpeed'))).toBeTrue();
    });

    it('should reject negative maxForwardSpeed', () => {
        const m = makeManifest({ physics: { maxForwardSpeed: -1, acceleration: 10, collisionMass: 1500 } as any });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
    });

    it('should reject invalid acceleration (zero)', () => {
        const m = makeManifest({ physics: { maxForwardSpeed: 30, acceleration: 0, collisionMass: 1500 } as any });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('Invalid acceleration'))).toBeTrue();
    });

    it('should reject invalid collisionMass (zero)', () => {
        const m = makeManifest({ physics: { maxForwardSpeed: 30, acceleration: 10, collisionMass: 0 } as any });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('Invalid collisionMass'))).toBeTrue();
    });

    it('should reject when colorPaletteIds is empty', () => {
        const m = makeManifest({ colorPaletteIds: [] });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('at least one color'))).toBeTrue();
    });

    it('should reject non-finite values for numeric physics fields', () => {
        const m = makeManifest({ physics: { maxForwardSpeed: NaN, acceleration: 10, collisionMass: 1500 } as any });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
    });

    it('should validate multiple valid manifests', () => {
        const manifests = [makeManifest({ id: 'sport' }), makeManifest({ id: 'truck' })];
        const result = validateVehicleClassManifests(manifests);
        expect(result.isValid).toBeTrue();
    });

    it('should reject invalid abilityUseLimitPerRace modifiers', () => {
        const m = makeManifest({
            modifiers: {
                abilityUseLimitPerRace: 0,
            },
        });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('abilityUseLimitPerRace'))).toBeTrue();
    });

    it('should allow Infinity for abilityUseLimitPerRace modifiers', () => {
        const m = makeManifest({
            modifiers: {
                abilityUseLimitPerRace: Infinity,
            },
        });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeTrue();
    });

    it('should reject negative powerupSpeedMultiplier modifiers', () => {
        const m = makeManifest({
            modifiers: {
                powerupSpeedMultiplier: -1,
            },
        });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('powerupSpeedMultiplier'))).toBeTrue();
    });

    it('should reject negative stunDurationMultiplier modifiers', () => {
        const m = makeManifest({
            modifiers: {
                stunDurationMultiplier: -0.1,
            },
        });
        const result = validateVehicleClassManifests([m]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('stunDurationMultiplier'))).toBeTrue();
    });
});
