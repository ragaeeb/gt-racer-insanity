import { describe, expect, it } from 'bun:test';
import { MIN_CORRECTION_THRESHOLD } from '@/client/game/systems/correctionSystem';
import { resolveCollisionAuthorityRecoveryMode } from './useCarInterpolation';

describe('useCarInterpolation collision recovery mode', () => {
    it('should return none when outside collision authority window', () => {
        const mode = resolveCollisionAuthorityRecoveryMode(false, MIN_CORRECTION_THRESHOLD + 1, 400);
        expect(mode).toBe('none');
    });

    it('should return none when correction error is below threshold', () => {
        const mode = resolveCollisionAuthorityRecoveryMode(true, MIN_CORRECTION_THRESHOLD - 0.0001, 400);
        expect(mode).toBe('none');
    });

    it('should return hard when in collision authority window without stalled frame gap', () => {
        const mode = resolveCollisionAuthorityRecoveryMode(true, MIN_CORRECTION_THRESHOLD + 2, 40);
        expect(mode).toBe('hard');
    });

    it('should return soft when frame gap indicates a recovered stall', () => {
        const mode = resolveCollisionAuthorityRecoveryMode(true, MIN_CORRECTION_THRESHOLD + 2, 800);
        expect(mode).toBe('soft');
    });
});

