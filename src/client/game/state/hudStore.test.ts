import { describe, expect, it } from 'bun:test';
import { useHudStore } from './hudStore';

const reset = () => {
    useHudStore.setState({
        activeEffectIds: [],
        cooldownMsByAbilityId: {},
        driftBoostTier: 0,
        lap: 1,
        pendingToasts: [],
        position: 1,
        speedKph: 0,
    });
};

describe('useHudStore', () => {
    describe('setActiveEffectIds', () => {
        it('should update activeEffectIds when a new array is provided', () => {
            reset();
            useHudStore.getState().setActiveEffectIds(['slowed', 'flipped']);
            expect(useHudStore.getState().activeEffectIds).toEqual(['slowed', 'flipped']);
        });

        it('should not change state reference when contents are identical', () => {
            reset();
            useHudStore.getState().setActiveEffectIds(['boosted']);
            const before = useHudStore.getState();
            useHudStore.getState().setActiveEffectIds(['boosted']);
            const after = useHudStore.getState();
            expect(after).toBe(before);
        });

        it('should update when length differs', () => {
            reset();
            useHudStore.getState().setActiveEffectIds(['slowed']);
            useHudStore.getState().setActiveEffectIds(['slowed', 'boosted']);
            expect(useHudStore.getState().activeEffectIds).toHaveLength(2);
        });
    });

    describe('setDriftBoostTier', () => {
        it('should set drift boost tier 0-3', () => {
            reset();
            useHudStore.getState().setDriftBoostTier(2);
            expect(useHudStore.getState().driftBoostTier).toBe(2);
        });

        it('should clamp tier to minimum 0', () => {
            reset();
            useHudStore.getState().setDriftBoostTier(-1);
            expect(useHudStore.getState().driftBoostTier).toBe(0);
        });

        it('should clamp tier to maximum 3', () => {
            reset();
            useHudStore.getState().setDriftBoostTier(5);
            expect(useHudStore.getState().driftBoostTier).toBe(3);
        });

        it('should truncate floating point values', () => {
            reset();
            useHudStore.getState().setDriftBoostTier(1.9);
            expect(useHudStore.getState().driftBoostTier).toBe(1);
        });

        it('should not change state when tier is already the same', () => {
            reset();
            useHudStore.getState().setDriftBoostTier(2);
            const before = useHudStore.getState();
            useHudStore.getState().setDriftBoostTier(2);
            const after = useHudStore.getState();
            expect(after).toBe(before);
        });
    });

    describe('setLap', () => {
        it('should update the lap number', () => {
            reset();
            useHudStore.getState().setLap(3);
            expect(useHudStore.getState().lap).toBe(3);
        });

        it('should not change state when lap is already the same', () => {
            reset();
            useHudStore.getState().setLap(2);
            const before = useHudStore.getState();
            useHudStore.getState().setLap(2);
            expect(useHudStore.getState()).toBe(before);
        });
    });

    describe('setPosition', () => {
        it('should update the race position', () => {
            reset();
            useHudStore.getState().setPosition(4);
            expect(useHudStore.getState().position).toBe(4);
        });

        it('should not change state when position is already the same', () => {
            reset();
            useHudStore.getState().setPosition(2);
            const before = useHudStore.getState();
            useHudStore.getState().setPosition(2);
            expect(useHudStore.getState()).toBe(before);
        });
    });

    describe('setSpeedKph', () => {
        it('should round speed to nearest integer', () => {
            reset();
            useHudStore.getState().setSpeedKph(120.7);
            expect(useHudStore.getState().speedKph).toBe(121);
        });

        it('should clamp speed to 0 minimum', () => {
            reset();
            useHudStore.getState().setSpeedKph(-5);
            expect(useHudStore.getState().speedKph).toBe(0);
        });

        it('should not change state when speed rounds to same value', () => {
            reset();
            useHudStore.getState().setSpeedKph(100);
            const before = useHudStore.getState();
            useHudStore.getState().setSpeedKph(100.1);
            expect(useHudStore.getState()).toBe(before);
        });
    });

    describe('setTrackLabel', () => {
        it('should update the track label', () => {
            reset();
            useHudStore.getState().setTrackLabel('Neon City');
            expect(useHudStore.getState().trackLabel).toBe('Neon City');
        });

        it('should not change state when label is already the same', () => {
            reset();
            useHudStore.getState().setTrackLabel('Canyon Sprint');
            const before = useHudStore.getState();
            useHudStore.getState().setTrackLabel('Canyon Sprint');
            expect(useHudStore.getState()).toBe(before);
        });
    });

    describe('setCooldownMsByAbilityId', () => {
        it('should update cooldown map', () => {
            reset();
            useHudStore.getState().setCooldownMsByAbilityId({ 'turbo-boost': 5000 });
            expect(useHudStore.getState().cooldownMsByAbilityId['turbo-boost']).toBe(5000);
        });
    });

    describe('setAbilityReadyAtMs', () => {
        it('should set ability cooldown for a given id', () => {
            reset();
            useHudStore.getState().setAbilityReadyAtMs('spike-shot', 9999);
            expect(useHudStore.getState().cooldownMsByAbilityId['spike-shot']).toBe(9999);
        });

        it('should merge with existing cooldowns', () => {
            reset();
            useHudStore.getState().setCooldownMsByAbilityId({ 'turbo-boost': 1000 });
            useHudStore.getState().setAbilityReadyAtMs('spike-shot', 2000);
            const cooldowns = useHudStore.getState().cooldownMsByAbilityId;
            expect(cooldowns['turbo-boost']).toBe(1000);
            expect(cooldowns['spike-shot']).toBe(2000);
        });
    });

    describe('showToast / clearPendingToast', () => {
        it('should add a toast to pendingToasts', () => {
            reset();
            useHudStore.getState().showToast('Lap completed!', 'success');
            expect(useHudStore.getState().pendingToasts).toHaveLength(1);
            expect(useHudStore.getState().pendingToasts[0]).toEqual({
                message: 'Lap completed!',
                variant: 'success',
            });
        });

        it('should remove the first toast when clearPendingToast is called', () => {
            reset();
            useHudStore.getState().showToast('First', 'success');
            useHudStore.getState().showToast('Second', 'warning');
            useHudStore.getState().clearPendingToast();
            const toasts = useHudStore.getState().pendingToasts;
            expect(toasts).toHaveLength(1);
            expect(toasts[0]?.message).toBe('Second');
        });

        it('should support error variant', () => {
            reset();
            useHudStore.getState().showToast('Error occurred', 'error');
            expect(useHudStore.getState().pendingToasts[0]?.variant).toBe('error');
        });
    });
});
