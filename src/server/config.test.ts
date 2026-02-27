import { describe, expect, it } from 'bun:test';
import { isAllowedOrigin, serverConfig } from './config';

describe('serverConfig', () => {
    it('should have a valid simulationTickHz', () => {
        expect(serverConfig.simulationTickHz).toBeGreaterThan(0);
    });

    it('should have a valid snapshotTickHz', () => {
        expect(serverConfig.snapshotTickHz).toBeGreaterThan(0);
    });

    it('should have a valid port number', () => {
        expect(serverConfig.port).toBeGreaterThan(0);
    });

    it('should have positive maxMovementSpeedPerSecond', () => {
        expect(serverConfig.maxMovementSpeedPerSecond).toBeGreaterThan(0);
    });

    it('should have positive maxPositionDeltaPerTick', () => {
        expect(serverConfig.maxPositionDeltaPerTick).toBeGreaterThan(0);
    });

    it('should have positive maxRotationDeltaPerTick', () => {
        expect(serverConfig.maxRotationDeltaPerTick).toBeGreaterThan(0);
    });

    it('should have a valid defaultTotalLaps of at least 1', () => {
        expect(serverConfig.defaultTotalLaps).toBeGreaterThanOrEqual(1);
    });

    it('should have a non-empty defaultTrackId', () => {
        expect(serverConfig.defaultTrackId.length).toBeGreaterThan(0);
    });

    it('should have nodeEnv set to test in the test environment', () => {
        // In bun:test, NODE_ENV is 'test'
        expect(serverConfig.nodeEnv).toBe('test');
    });

    it('should have allowedOrigins as an array', () => {
        expect(Array.isArray(serverConfig.allowedOrigins)).toBeTrue();
    });
});

describe('isAllowedOrigin', () => {
    it('should allow all origins when no origin is provided (undefined)', () => {
        expect(isAllowedOrigin(undefined)).toBeTrue();
    });

    it('should allow all origins when origin is empty string', () => {
        // Empty string is falsy, so it returns true
        expect(isAllowedOrigin('')).toBeTrue();
    });

    it('should allow any origin in test/development mode when no allowedOrigins is set', () => {
        // In test mode with empty allowedOrigins list, nodeEnv !== 'production' → returns true
        const origEnv = serverConfig.nodeEnv;
        const origAllowed = serverConfig.allowedOrigins;

        // Temporarily set nodeEnv to 'test' and allowedOrigins to []
        (serverConfig as any).allowedOrigins = [];
        (serverConfig as any).nodeEnv = 'test';

        expect(isAllowedOrigin('http://localhost:3000')).toBeTrue();

        // Restore
        (serverConfig as any).nodeEnv = origEnv;
        (serverConfig as any).allowedOrigins = origAllowed;
    });

    it('should block unknown origin in production mode when no allowedOrigins is set', () => {
        const origEnv = serverConfig.nodeEnv;
        const origAllowed = serverConfig.allowedOrigins;

        (serverConfig as any).allowedOrigins = [];
        (serverConfig as any).nodeEnv = 'production';

        expect(isAllowedOrigin('http://evil.com')).toBeFalse();

        (serverConfig as any).nodeEnv = origEnv;
        (serverConfig as any).allowedOrigins = origAllowed;
    });

    it('should allow a listed origin when allowedOrigins is configured', () => {
        const origAllowed = serverConfig.allowedOrigins;
        (serverConfig as any).allowedOrigins = ['http://allowed.com'];

        expect(isAllowedOrigin('http://allowed.com')).toBeTrue();

        (serverConfig as any).allowedOrigins = origAllowed;
    });

    it('should block an unlisted origin when allowedOrigins is configured', () => {
        const origAllowed = serverConfig.allowedOrigins;
        (serverConfig as any).allowedOrigins = ['http://allowed.com'];

        expect(isAllowedOrigin('http://other.com')).toBeFalse();

        (serverConfig as any).allowedOrigins = origAllowed;
    });
});
