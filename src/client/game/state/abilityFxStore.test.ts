import { describe, expect, it } from 'bun:test';
import type { PendingSpikeShot } from './abilityFxStore';
import { useAbilityFxStore } from './abilityFxStore';

const makeSpikeShot = (triggeredAtMs: number): PendingSpikeShot => ({
    sourceX: 0,
    sourceZ: 0,
    targetX: 10,
    targetZ: 20,
    triggeredAtMs,
});

describe('useAbilityFxStore', () => {
    it('should start with an empty pendingSpikeShots array', () => {
        // Reset store to initial state via a fresh read
        useAbilityFxStore.setState({ pendingSpikeShots: [] });
        const { pendingSpikeShots } = useAbilityFxStore.getState();
        expect(pendingSpikeShots).toEqual([]);
    });

    it('should add a spike shot via addPendingSpikeShot', () => {
        useAbilityFxStore.setState({ pendingSpikeShots: [] });
        const { addPendingSpikeShot } = useAbilityFxStore.getState();
        const shot = makeSpikeShot(1000);
        addPendingSpikeShot(shot);
        const { pendingSpikeShots } = useAbilityFxStore.getState();
        expect(pendingSpikeShots).toHaveLength(1);
        expect(pendingSpikeShots[0]).toEqual(shot);
    });

    it('should append multiple spike shots', () => {
        useAbilityFxStore.setState({ pendingSpikeShots: [] });
        const { addPendingSpikeShot } = useAbilityFxStore.getState();
        addPendingSpikeShot(makeSpikeShot(1000));
        addPendingSpikeShot(makeSpikeShot(1100));
        const { pendingSpikeShots } = useAbilityFxStore.getState();
        expect(pendingSpikeShots).toHaveLength(2);
    });

    it('should remove expired shots when removeExpiredSpikeShots is called', () => {
        useAbilityFxStore.setState({ pendingSpikeShots: [] });
        const { addPendingSpikeShot, removeExpiredSpikeShots } = useAbilityFxStore.getState();
        addPendingSpikeShot(makeSpikeShot(1000));
        addPendingSpikeShot(makeSpikeShot(2000));
        // nowMs = 1800, maxAgeMs = 700 -> shot at 1000 is expired (1800-1000=800>700), shot at 2000 is fresh
        removeExpiredSpikeShots(1800);
        const { pendingSpikeShots } = useAbilityFxStore.getState();
        expect(pendingSpikeShots).toHaveLength(1);
        expect(pendingSpikeShots[0]?.triggeredAtMs).toBe(2000);
    });

    it('should keep shots that are within the max age window', () => {
        useAbilityFxStore.setState({ pendingSpikeShots: [] });
        const { addPendingSpikeShot, removeExpiredSpikeShots } = useAbilityFxStore.getState();
        addPendingSpikeShot(makeSpikeShot(1000));
        // nowMs = 1500, maxAgeMs = 700 -> 1500-1000=500 <= 700, should keep
        removeExpiredSpikeShots(1500);
        const { pendingSpikeShots } = useAbilityFxStore.getState();
        expect(pendingSpikeShots).toHaveLength(1);
    });

    it('should be a no-op when there are no shots to remove', () => {
        useAbilityFxStore.setState({ pendingSpikeShots: [] });
        const { removeExpiredSpikeShots } = useAbilityFxStore.getState();
        // Should not throw
        expect(() => removeExpiredSpikeShots(9999)).not.toThrow();
        const { pendingSpikeShots } = useAbilityFxStore.getState();
        expect(pendingSpikeShots).toHaveLength(0);
    });

    it('should accept a custom maxAgeMs override', () => {
        useAbilityFxStore.setState({ pendingSpikeShots: [] });
        const { addPendingSpikeShot, removeExpiredSpikeShots } = useAbilityFxStore.getState();
        addPendingSpikeShot(makeSpikeShot(1000));
        // With maxAgeMs=100, nowMs=1050 -> age=50 <= 100, keep
        removeExpiredSpikeShots(1050, 100);
        expect(useAbilityFxStore.getState().pendingSpikeShots).toHaveLength(1);
        // With maxAgeMs=100, nowMs=1200 -> age=200 > 100, remove
        removeExpiredSpikeShots(1200, 100);
        expect(useAbilityFxStore.getState().pendingSpikeShots).toHaveLength(0);
    });

    it('should not update state when all shots are still within the age window', () => {
        useAbilityFxStore.setState({ pendingSpikeShots: [] });
        const { addPendingSpikeShot, removeExpiredSpikeShots } = useAbilityFxStore.getState();
        addPendingSpikeShot(makeSpikeShot(1000));
        const beforeShots = useAbilityFxStore.getState().pendingSpikeShots;
        removeExpiredSpikeShots(1100); // well within 700ms window
        const afterShots = useAbilityFxStore.getState().pendingSpikeShots;
        // State reference should not change (no set call)
        expect(afterShots).toBe(beforeShots);
    });
});
