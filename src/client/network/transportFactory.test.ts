import { describe, expect, it } from 'bun:test';
import { LocalSimulationManager } from '@/client/network/LocalSimulationManager';
import { createRealtimeTransport, resolveTransportKind } from '@/client/network/transportFactory';

describe('transportFactory', () => {
    it('should select local transport for singleplayer mode', () => {
        expect(resolveTransportKind('singleplayer')).toEqual('local');
    });

    it('should select socket transport for multiplayer mode', () => {
        expect(resolveTransportKind('multiplayer')).toEqual('socket');
    });

    it('should create local simulation transport for singleplayer mode', () => {
        const transport = createRealtimeTransport('Solo', 'SPTEST', {}, 'singleplayer');
        expect(transport).toBeInstanceOf(LocalSimulationManager);
        transport.disconnect();
    });

    it('should create socket transport for multiplayer mode', () => {
        const transport = createRealtimeTransport('Player', 'MPTEST', {}, 'multiplayer');
        // Assert it's the expected socket transport type
        expect(transport).not.toBeInstanceOf(LocalSimulationManager);
        transport.disconnect();
    });
});
