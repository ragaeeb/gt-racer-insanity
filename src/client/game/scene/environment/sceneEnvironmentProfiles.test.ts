import { describe, expect, it } from 'bun:test';
import { getSceneEnvironmentProfile, getSceneEnvironmentProfileIdForTrackTheme } from './sceneEnvironmentProfiles';

describe('getSceneEnvironmentProfile', () => {
    it('should return the sunnyDay profile', () => {
        const profile = getSceneEnvironmentProfile('sunnyDay');
        expect(profile).toBeDefined();
        expect(profile.id).toBe('sunnyDay');
    });

    it('should return the canyonDusk profile', () => {
        const profile = getSceneEnvironmentProfile('canyonDusk');
        expect(profile).toBeDefined();
        expect(profile.id).toBe('canyonDusk');
    });

    it('should return the neonCityNight profile', () => {
        const profile = getSceneEnvironmentProfile('neonCityNight');
        expect(profile).toBeDefined();
        expect(profile.id).toBe('neonCityNight');
    });

    it('should return the desertSunset profile', () => {
        const profile = getSceneEnvironmentProfile('desertSunset');
        expect(profile).toBeDefined();
        expect(profile.id).toBe('desertSunset');
    });

    it('should return a profile with fog settings', () => {
        const profile = getSceneEnvironmentProfile('sunnyDay');
        expect(profile.fog).toBeDefined();
        expect(typeof profile.fog.color).toBe('number');
        expect(profile.fog.near).toBeGreaterThan(0);
        expect(profile.fog.far).toBeGreaterThan(profile.fog.near);
    });

    it('should return a profile with cloud settings', () => {
        const profile = getSceneEnvironmentProfile('sunnyDay');
        expect(profile.cloud).toBeDefined();
        expect(Array.isArray(profile.cloud.puffs)).toBeTrue();
        expect(Array.isArray(profile.cloud.clusters)).toBeTrue();
    });
});

describe('getSceneEnvironmentProfileIdForTrackTheme', () => {
    it('should map canyon-dusk to canyonDusk', () => {
        expect(getSceneEnvironmentProfileIdForTrackTheme('canyon-dusk')).toBe('canyonDusk');
    });

    it('should map cyberpunk-night to neonCityNight', () => {
        expect(getSceneEnvironmentProfileIdForTrackTheme('cyberpunk-night')).toBe('neonCityNight');
    });

    it('should map desert-sunset to desertSunset', () => {
        expect(getSceneEnvironmentProfileIdForTrackTheme('desert-sunset')).toBe('desertSunset');
    });

    it('should map sunny-day to sunnyDay', () => {
        expect(getSceneEnvironmentProfileIdForTrackTheme('sunny-day')).toBe('sunnyDay');
    });
});
