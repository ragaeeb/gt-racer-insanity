import type { GameMode } from './config';

export const shouldCheckServerHealth = (gameMode: GameMode) => gameMode !== 'singleplayer';
