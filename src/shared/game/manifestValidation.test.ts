import { describe, expect, it } from 'bun:test';
import { ABILITY_MANIFESTS } from '@/shared/game/ability/abilityManifest';
import { validateAbilityManifests } from '@/shared/game/ability/abilityManifestValidation';
import { STATUS_EFFECT_MANIFESTS } from '@/shared/game/effects/statusEffectManifest';
import { validateStatusEffectManifests } from '@/shared/game/effects/statusEffectManifestValidation';
import { HAZARD_MANIFESTS } from '@/shared/game/hazard/hazardManifest';
import { validateHazardManifests } from '@/shared/game/hazard/hazardManifestValidation';
import { POWERUP_MANIFESTS } from '@/shared/game/powerup/powerupManifest';
import { validatePowerupManifests } from '@/shared/game/powerup/powerupManifestValidation';
import { TRACK_MANIFESTS } from '@/shared/game/track/trackManifest';
import { validateTrackManifests } from '@/shared/game/track/trackManifestValidation';
import { VEHICLE_CLASS_MANIFESTS } from '@/shared/game/vehicle/vehicleClassManifest';
import { validateVehicleClassManifests } from '@/shared/game/vehicle/vehicleClassManifestValidation';

describe('game manifest validation', () => {
    it('should validate ability manifests', () => {
        const result = validateAbilityManifests(ABILITY_MANIFESTS);
        expect(result.isValid).toEqual(true);
    });

    it('should validate status effect manifests', () => {
        const result = validateStatusEffectManifests(STATUS_EFFECT_MANIFESTS);
        expect(result.isValid).toEqual(true);
    });

    it('should validate track manifests', () => {
        const result = validateTrackManifests(TRACK_MANIFESTS);
        expect(result.isValid).toEqual(true);
    });

    it('should validate hazard manifests', () => {
        const result = validateHazardManifests(HAZARD_MANIFESTS);
        expect(result.isValid).toEqual(true);
    });

    it('should validate powerup manifests', () => {
        const result = validatePowerupManifests(POWERUP_MANIFESTS);
        expect(result.isValid).toEqual(true);
    });

    it('should validate vehicle manifests', () => {
        const result = validateVehicleClassManifests(VEHICLE_CLASS_MANIFESTS);
        expect(result.isValid).toEqual(true);
    });
});
