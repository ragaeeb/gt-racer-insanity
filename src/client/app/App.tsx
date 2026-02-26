import type React from 'react';
import { useEffect, useState } from 'react';
import { COLOR_ID_TO_HSL } from '@/client/game/vehicleSelections';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import { generateRoomId, readLobbyMode, sanitizePlayerName, sanitizeRoomId, writeLobbyMode } from './appUtils';
import { clientConfig } from './config';
import { LandingHero } from './LandingHero';
import { LobbyScreen } from './LobbyScreen';
import { RaceScreen } from './RaceScreen';

export const App = () => {
    const [playerName, setPlayerName] = useState(() => window.sessionStorage.getItem('gt-player-name-session') ?? '');
    const [nameInput, setNameInput] = useState(playerName);
    const [joinRoomInput, setJoinRoomInput] = useState('');
    const [showJoinPrompt, setShowJoinPrompt] = useState(false);
    const [homeError, setHomeError] = useState('');
    const [isCheckingServer, setIsCheckingServer] = useState(false);
    const [routePath, setRoutePath] = useState(window.location.pathname);
    const [routeSearch, setRouteSearch] = useState(window.location.search);

    const [selectedVehicleId, setSelectedVehicleId] = useState<VehicleClassId>('sport');
    const [selectedColorId, setSelectedColorId] = useState(() => {
        const colors = Object.keys(COLOR_ID_TO_HSL);
        return colors[Math.floor(Math.random() * colors.length)];
    });
    const [selectedTrackId, setSelectedTrackId] = useState<string>('');

    const routeParams = new URLSearchParams(routeSearch);
    const roomIdFromUrl = sanitizeRoomId(routeParams.get('room') ?? '');

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
        const onPopState = () => setLocationState();
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // Route guards
    useEffect(() => {
        const searchRoomId = sanitizeRoomId(new URLSearchParams(routeSearch).get('room') ?? '');
        const hasPlayerName = playerName.trim().length > 0;

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

    const handleCreateNewGame = async () => {
        setHomeError('');
        setIsCheckingServer(true);
        try {
            const response = await fetch(`${clientConfig.serverUrl}/health`);
            if (!response.ok) {
                throw new Error('Server health check failed');
            }
            writeLobbyMode('create');
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

    const handleJoinSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const sanitizedRoomId = sanitizeRoomId(joinRoomInput);
        if (!sanitizedRoomId) {
            return;
        }
        writeLobbyMode('join');
        navigateTo('/lobby', sanitizedRoomId);
    };

    const handleStartRace = (event: React.FormEvent<HTMLFormElement>) => {
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
            <LandingHero
                isCheckingServer={isCheckingServer}
                handleCreateNewGame={handleCreateNewGame}
                handleJoinExistingGame={handleJoinExistingGame}
                showJoinPrompt={showJoinPrompt}
                joinRoomInput={joinRoomInput}
                setJoinRoomInput={setJoinRoomInput}
                handleJoinSubmit={handleJoinSubmit}
                homeError={homeError}
            />
        );
    }

    if (routePath === '/lobby') {
        return (
            <LobbyScreen
                allowTrackSelection={readLobbyMode() === 'create'}
                nameInput={nameInput}
                onNameChange={setNameInput}
                onSelectColor={setSelectedColorId}
                onSelectTrack={setSelectedTrackId}
                onSelectVehicle={setSelectedVehicleId}
                onSubmit={handleStartRace}
                roomCode={roomIdFromUrl}
                selectedColorId={selectedColorId}
                selectedTrackId={selectedTrackId}
                selectedVehicleId={selectedVehicleId}
            />
        );
    }

    if (routePath === '/race') {
        if (!roomIdFromUrl || playerName.trim().length === 0) {
            return null;
        }
        return (
            <RaceScreen
                playerName={playerName}
                roomId={roomIdFromUrl}
                selectedColorId={selectedColorId}
                selectedTrackId={selectedTrackId}
                selectedVehicleId={selectedVehicleId}
            />
        );
    }

    return null;
};
