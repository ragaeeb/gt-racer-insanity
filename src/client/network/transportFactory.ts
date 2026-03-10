import { clientConfig, type GameMode } from '@/client/app/config';
import { LocalSimulationManager } from '@/client/network/LocalSimulationManager';
import { NetworkManager } from '@/client/network/NetworkManager';
import type { RealtimeTransport, RealtimeTransportOptions } from '@/client/network/realtimeTransport';

export const resolveTransportKind = (gameMode: GameMode): 'local' | 'socket' => {
    return gameMode === 'singleplayer' ? 'local' : 'socket';
};

export const createRealtimeTransport = (
    playerName: string,
    roomId: string,
    options: RealtimeTransportOptions = {},
    gameMode: GameMode = clientConfig.gameMode,
): RealtimeTransport => {
    if (resolveTransportKind(gameMode) === 'local') {
        return new LocalSimulationManager(playerName, roomId, options);
    }

    return new NetworkManager(playerName, roomId, options);
};
