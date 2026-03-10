import { describe, expect, it } from 'bun:test';
import { shouldCheckServerHealth } from '@/client/app/healthCheck';

describe('App health-check gating', () => {
    it('should skip server health checks in singleplayer mode', () => {
        expect(shouldCheckServerHealth('singleplayer')).toBeFalse();
    });

    it('should keep server health checks in multiplayer mode', () => {
        expect(shouldCheckServerHealth('multiplayer')).toBeTrue();
    });
});
