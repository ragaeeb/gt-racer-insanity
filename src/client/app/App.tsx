import { Canvas } from '@react-three/fiber';
import { Suspense, lazy, useState } from 'react';
import * as THREE from 'three';
import type { ConnectionStatus } from '@/shared/network/types';

const RaceWorld = lazy(async () => {
    const module = await import('@/client/game/scene/RaceWorld');
    return { default: module.RaceWorld };
});

export const App = () => {
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [resetNonce, setResetNonce] = useState(0);
    const [cruiseControlEnabled, setCruiseControlEnabled] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
    const appVersion = __APP_VERSION__;

    const handleRestart = () => {
        setGameOver(false);
        setResetNonce((current) => current + 1);
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
                    <RaceWorld
                        cruiseControlEnabled={cruiseControlEnabled}
                        onConnectionStatusChange={setConnectionStatus}
                        onGameOverChange={setGameOver}
                        onScoreChange={setScore}
                        resetNonce={resetNonce}
                    />
                </Suspense>
            </Canvas>
        </>
    );
};
