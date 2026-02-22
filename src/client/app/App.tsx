import { Canvas } from '@react-three/fiber';
import { Suspense, lazy, useEffect, useMemo, useState, type FormEvent } from 'react';
import * as THREE from 'three';
import { clientConfig } from '@/client/app/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ConnectionStatus } from '@/shared/network/types';

const RaceWorld = lazy(async () => {
    const module = await import('@/client/game/scene/RaceWorld');
    return { default: module.RaceWorld };
});

export const App = () => {
    const [playerName, setPlayerName] = useState(() => window.sessionStorage.getItem('gt-player-name-session') ?? '');
    const [nameInput, setNameInput] = useState(playerName);
    const [joinRoomInput, setJoinRoomInput] = useState('');
    const [showJoinPrompt, setShowJoinPrompt] = useState(false);
    const [homeError, setHomeError] = useState('');
    const [isCheckingServer, setIsCheckingServer] = useState(false);
    const [routePath, setRoutePath] = useState(window.location.pathname);
    const [routeSearch, setRouteSearch] = useState(window.location.search);

    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [resetNonce, setResetNonce] = useState(0);
    const [cruiseControlEnabled, setCruiseControlEnabled] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const appVersion = __APP_VERSION__;
    const roomIdFromUrl = useMemo(() => new URLSearchParams(routeSearch).get('room') ?? '', [routeSearch]);

    const setLocationState = () => {
        setRoutePath(window.location.pathname);
        setRouteSearch(window.location.search);
    };

    const navigateTo = (path: string, roomId?: string, replace = false) => {
        const search = roomId ? `?room=${encodeURIComponent(roomId)}` : '';
        const target = `${path}${search}`;
        if (replace) {
            window.history.replaceState({}, '', target);
        } else {
            window.history.pushState({}, '', target);
        }
        setLocationState();
    };

    useEffect(() => {
        const onPopState = () => {
            setLocationState();
        };

        window.addEventListener('popstate', onPopState);
        return () => {
            window.removeEventListener('popstate', onPopState);
        };
    }, []);

    useEffect(() => {
        const searchRoomId = new URLSearchParams(routeSearch).get('room');
        const hasPlayerName = playerName.trim().length > 0;

        // Legacy direct links like "/?room=ABCD" should go to the lobby first.
        if (routePath === '/' && searchRoomId) {
            navigateTo('/lobby', searchRoomId, true);
            return;
        }

        if (routePath === '/lobby' && !searchRoomId) {
            navigateTo('/', undefined, true);
            return;
        }

        if (routePath === '/lobby') {
            return;
        }

        if (routePath === '/race') {
            if (!searchRoomId) {
                navigateTo('/', undefined, true);
                return;
            }
            if (!hasPlayerName) {
                navigateTo('/lobby', searchRoomId, true);
            }
            return;
        }

        if (routePath !== '/') {
            navigateTo('/', undefined, true);
        }
    }, [playerName, routePath, routeSearch]);

    useEffect(() => {
        setNameInput(playerName);
    }, [playerName]);

    const sanitizePlayerName = (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            return 'Player';
        }
        return trimmed.slice(0, 24);
    };

    const sanitizeRoomId = (value: string) => {
        return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
    };

    const generateRoomId = () => {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    };

    const handleRestart = () => {
        setGameOver(false);
        setResetNonce((current) => current + 1);
    };

    const handleCreateNewGame = async () => {
        setHomeError('');
        setIsCheckingServer(true);

        try {
            const response = await fetch(`${clientConfig.serverUrl}/health`);
            if (!response.ok) {
                throw new Error('Server health check failed');
            }

            navigateTo('/lobby', generateRoomId());
        } catch {
            setHomeError('Server is not running');
        } finally {
            setIsCheckingServer(false);
        }
    };

    const handleJoinExistingGame = () => {
        setHomeError('');
        setShowJoinPrompt(true);
    };

    const handleJoinSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const sanitizedRoomId = sanitizeRoomId(joinRoomInput);
        if (!sanitizedRoomId) {
            return;
        }
        navigateTo('/lobby', sanitizedRoomId);
    };

    const handleStartRace = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const nextName = sanitizePlayerName(nameInput);
        window.sessionStorage.setItem('gt-player-name-session', nextName);
        setPlayerName(nextName);
        if (roomIdFromUrl) {
            navigateTo('/race', roomIdFromUrl);
        }
    };

    if (routePath === '/') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
                <div className="w-full max-w-sm space-y-3">
                    <Button disabled={isCheckingServer} onClick={handleCreateNewGame} type="button">
                        Create New Game
                    </Button>
                    <Button onClick={handleJoinExistingGame} type="button" variant="ghost">
                        Join Existing Game
                    </Button>
                    {showJoinPrompt ? (
                        <form className="space-y-3" onSubmit={handleJoinSubmit}>
                            <Input
                                autoFocus
                                onChange={(event) => setJoinRoomInput(event.target.value)}
                                placeholder="Game ID"
                                value={joinRoomInput}
                            />
                            <Button type="submit">Continue</Button>
                        </form>
                    ) : null}
                    {homeError ? <div className="text-sm text-red-600">{homeError}</div> : null}
                </div>
            </div>
        );
    }

    if (routePath === '/lobby') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
                <form className="w-full max-w-sm space-y-3" onSubmit={handleStartRace}>
                    <Input
                        autoFocus
                        id="player-name-input"
                        maxLength={24}
                        onChange={(event) => setNameInput(event.target.value)}
                        placeholder="Player Name"
                        value={nameInput}
                    />
                    <Button id="player-name-confirm" type="submit">
                        Start
                    </Button>
                </form>
            </div>
        );
    }

    if (routePath !== '/race') {
        return null;
    }

    return (
        <div className="h-full w-full">
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
                    {playerName && roomIdFromUrl ? (
                        <RaceWorld
                            cruiseControlEnabled={cruiseControlEnabled}
                            onConnectionStatusChange={setConnectionStatus}
                            onGameOverChange={setGameOver}
                            onScoreChange={setScore}
                            playerName={playerName}
                            roomId={roomIdFromUrl}
                            resetNonce={resetNonce}
                        />
                    ) : null}
                </Suspense>
            </Canvas>
        </div>
    );
};
