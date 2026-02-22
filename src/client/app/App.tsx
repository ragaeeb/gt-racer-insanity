import { Canvas } from '@react-three/fiber';
import { Suspense, lazy, useState } from 'react';
import * as THREE from 'three';
import { PlayerNameDialog } from '@/client/app/PlayerNameDialog';
import type { ConnectionStatus } from '@/shared/network/types';

const RaceWorld = lazy(async () => {
    const module = await import('@/client/game/scene/RaceWorld');
    return { default: module.RaceWorld };
});

export const App = () => {
    const [playerName, setPlayerName] = useState(() => {
        const storedName = window.sessionStorage.getItem('gt-player-name-session');
        return storedName?.trim() ? storedName : '';
    });
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [resetNonce, setResetNonce] = useState(0);
    const [cruiseControlEnabled, setCruiseControlEnabled] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const appVersion = __APP_VERSION__;

    const handleRestart = () => {
        setGameOver(false);
        setResetNonce((current) => current + 1);
    };

    const handlePlayerNameConfirmed = (nextName: string) => {
        window.sessionStorage.setItem('gt-player-name-session', nextName);
        setPlayerName(nextName);
    };

    return (
        <>
            <div id="game-ui">
                <img alt="GT Racer Insanity logo" id="game-logo" src="/branding/icon.svg" />
                <div id="score">Score: {score}</div>
                <div data-status={connectionStatus} id="connection-status">
                    {connectionStatus}
                </div>
                <label id="control-mode-toggle">
                    <input
                        checked={cruiseControlEnabled}
                        onChange={(event) => setCruiseControlEnabled(event.target.checked)}
                        type="checkbox"
                    />
                    Cruise
                </label>
                <div id="player-name-badge">{playerName || 'Not set'}</div>
                <div id="app-version">v{appVersion}</div>
                <div id="game-over" className={gameOver ? '' : 'hidden'}>
                    <h1>GAME OVER</h1>
                    <button id="restart-btn" onClick={handleRestart} type="button">
                        Restart
                    </button>
                </div>
            </div>

            <Canvas
                camera={{ fov: 60, near: 0.1, far: 1000, position: [0, 30, -30] }}
                dpr={[1, 2]}
                onCreated={({ gl }) => {
                    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                    gl.shadowMap.enabled = true;
                    gl.shadowMap.type = THREE.PCFShadowMap;
                }}
                shadows
            >
                <Suspense fallback={null}>
                    {playerName ? (
                        <RaceWorld
                            cruiseControlEnabled={cruiseControlEnabled}
                            onConnectionStatusChange={setConnectionStatus}
                            onGameOverChange={setGameOver}
                            onScoreChange={setScore}
                            playerName={playerName}
                            resetNonce={resetNonce}
                        />
                    ) : null}
                </Suspense>
            </Canvas>

            <PlayerNameDialog
                initialValue={playerName}
                isOpen={!playerName}
                onConfirm={handlePlayerNameConfirmed}
            />
        </>
    );
};
