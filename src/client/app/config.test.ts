import { describe, expect, it } from 'bun:test';
import { coerceGameMode, resolveGameMode } from '@/client/app/config';

describe('client config game mode', () => {
    it('should coerce valid modes', () => {
        expect(coerceGameMode('singleplayer')).toEqual('singleplayer');
        expect(coerceGameMode('multiplayer')).toEqual('multiplayer');
    });

    it('should return null for invalid modes', () => {
        expect(coerceGameMode('coop')).toBeNull();
        expect(coerceGameMode('')).toBeNull();
        expect(coerceGameMode(undefined)).toBeNull();
    });

    it('should prioritize query override over env mode', () => {
        expect(resolveGameMode('multiplayer', '?gameMode=singleplayer')).toEqual('singleplayer');
    });

    it('should fallback to env mode when query is not set', () => {
        expect(resolveGameMode('singleplayer')).toEqual('singleplayer');
    });

    it('should default to multiplayer for invalid query and env values', () => {
        expect(resolveGameMode('invalid', '?gameMode=invalid')).toEqual('multiplayer');
    });
});
