import { useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import { AbilityIndicator } from '@/components/AbilityIndicator';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import type { ConnectionStatus, RaceState } from '@/shared/network/types';
import {
    buildShareRaceUrl,
    type DiagnosticsVerbosity,
    formatRaceDurationMs,
    getDiagControls,
    readDiagnosticsEnabledDefault,
    readDiagnosticsVerboseDefault,
} from './appUtils';
import { RaceSceneCanvas } from './RaceSceneCanvas';

const EFFECT_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
    boosted: { label: 'BOOSTED', className: 'effect-boost' },
    flat_tire: { label: 'FLAT TIRE', className: 'effect-flat-tire' },
    speed_burst: { label: 'SPEED BURST', className: 'effect-boost' },
    stunned: { label: 'STUNNED', className: 'effect-stunned' },
    slowed: { label: 'SLOWED', className: 'effect-slowed' },
};

const DRIFT_TIER_CONFIG: Record<number, { color: string; glow: string; dotGlow: string; label: string }> = {
    1: {
        color: '#29B6F6',
        glow: '0 0 8px rgba(41,182,246,0.7)',
        dotGlow: '0 0 6px rgba(41,182,246,0.9)',
        label: 'MINI',
    },
    2: {
        color: '#FF9800',
        glow: '0 0 8px rgba(255,152,0,0.7)',
        dotGlow: '0 0 6px rgba(255,152,0,0.9)',
        label: 'SUPER',
    },
    3: {
        color: '#BB86FC',
        glow: '0 0 8px rgba(187,134,252,0.7)',
        dotGlow: '0 0 6px rgba(187,134,252,0.9)',
        label: 'ULTRA',
    },
};

export type RaceScreenProps = {
    playerName: string;
    roomId: string;
    selectedColorId: string;
    selectedTrackId: string;
    selectedVehicleId: VehicleClassId;
};

export const RaceScreen = ({
    playerName,
    roomId,
    selectedColorId,
    selectedTrackId,
    selectedVehicleId,
}: RaceScreenProps) => {
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [cruiseControlEnabled, setCruiseControlEnabled] = useState(true);
    const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(() => readDiagnosticsEnabledDefault());
    const [diagnosticsVerbosity, setDiagnosticsVerbosity] = useState<DiagnosticsVerbosity>(() =>
        readDiagnosticsVerboseDefault() ? 'verbose' : 'standard',
    );
    const [gameOver, setGameOver] = useState(false);
    const [raceState, setRaceState] = useState<RaceState | null>(null);
    const [resetNonce, setResetNonce] = useState(0);

    const speedKph = useHudStore((state) => state.speedKph);
    const lap = useHudStore((state) => state.lap);
    const position = useHudStore((state) => state.position);
    const trackLabel = useHudStore((state) => state.trackLabel);
    const activeEffectIds = useHudStore((state) => state.activeEffectIds);
    const driftBoostTier = useHudStore((state) => state.driftBoostTier);
    const pendingToasts = useHudStore((state) => state.pendingToasts);
    const clearPendingToast = useHudStore((state) => state.clearPendingToast);
    const latestSnapshot = useRuntimeStore((state) => state.latestSnapshot);

    const appVersion = __APP_VERSION__;

    const winnerName = raceState?.winnerPlayerId
        ? (latestSnapshot?.players.find((player) => player.id === raceState.winnerPlayerId)?.name ??
          raceState.winnerPlayerId)
        : null;

    const raceDurationLabel =
        raceState?.startedAtMs && raceState?.status === 'finished'
            ? formatRaceDurationMs((raceState.endedAtMs ?? Date.now()) - raceState.startedAtMs)
            : null;

    useEffect(() => {
        if (pendingToasts.length === 0) {
            return;
        }
        const next = pendingToasts[0];
        if (next.variant === 'success') {
            toast.success(next.message);
        } else if (next.variant === 'error') {
            toast.error(next.message);
        } else {
            toast.warning(next.message);
        }
        clearPendingToast();
    }, [pendingToasts, clearPendingToast]);

    const handleRestart = () => {
        setGameOver(false);
        setRaceState(null);
        setResetNonce((current) => current + 1);
    };

    const handleGenerateDebugLog = () => {
        getDiagControls()?.downloadReport();
    };

    const handleShareRaceLink = async () => {
        const shareUrl = await buildShareRaceUrl(roomId);
        if (!shareUrl) {
            toast.error('No room URL available to share.');
            return;
        }
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                toast.success('Race link copied to clipboard.');
                return;
            }
        } catch {
            // fall through
        }
        toast.error('Clipboard unavailable. Please allow clipboard access and try again.');
    };

    const handleDiagnosticsEnabledChange = (enabled: boolean) => {
        setDiagnosticsEnabled(enabled);
        window.localStorage.setItem('gt-diag', enabled ? 'true' : 'false');
        if (enabled) {
            getDiagControls()?.enable();
        } else {
            getDiagControls()?.disable();
        }
    };

    const handleDiagnosticsVerbosityChange = (verbosity: DiagnosticsVerbosity) => {
        setDiagnosticsVerbosity(verbosity);
        const isVerbose = verbosity === 'verbose';
        window.localStorage.setItem('gt-diag-verbose', isVerbose ? 'true' : 'false');
        getDiagControls()?.setVerbose(isVerbose);
    };

    const tierConfig = DRIFT_TIER_CONFIG[driftBoostTier] ?? DRIFT_TIER_CONFIG[1];

    return (
        <div className="h-full w-full">
            <div id="game-ui">
                <div id="hud-panel">
                    <div id="speed">{Math.round(speedKph)} km/h</div>
                    <div id="lap-position">
                        LAP {lap} &nbsp;|&nbsp; P{position}
                    </div>
                    <div id="track-name">{trackLabel}</div>
                    <div data-status={connectionStatus} id="connection-status">
                        {connectionStatus}
                    </div>
                    <label id="control-mode-toggle">
                        <input
                            checked={cruiseControlEnabled}
                            onChange={(event) => setCruiseControlEnabled(event.target.checked)}
                            type="checkbox"
                        />
                        CRUISE
                    </label>
                    <label id="diagnostics-toggle">
                        <input
                            checked={diagnosticsEnabled}
                            onChange={(event) => handleDiagnosticsEnabledChange(event.target.checked)}
                            type="checkbox"
                        />
                        DIAG
                    </label>
                    <label id="diagnostics-level">
                        VERBOSITY
                        <select
                            disabled={!diagnosticsEnabled}
                            id="diagnostics-level-select"
                            onChange={(event) =>
                                handleDiagnosticsVerbosityChange(event.target.value as DiagnosticsVerbosity)
                            }
                            value={diagnosticsVerbosity}
                        >
                            <option value="standard">STANDARD</option>
                            <option value="verbose">VERBOSE</option>
                        </select>
                    </label>
                    <button id="generate-debug-log-btn" onClick={handleGenerateDebugLog} type="button">
                        EXPORT LOG
                    </button>
                    <button id="share-race-link-btn" onClick={handleShareRaceLink} type="button">
                        SHARE RACE LINK
                    </button>
                    <div id="player-name-badge">{playerName || 'UNKNOWN'}</div>
                    {activeEffectIds.length > 0 && (
                        <div id="effect-indicators">
                            {activeEffectIds.map((effectId) => (
                                <span
                                    key={effectId}
                                    className={`effect-badge ${EFFECT_BADGE_CONFIG[effectId]?.className ?? 'effect-slowed'}`}
                                >
                                    {EFFECT_BADGE_CONFIG[effectId]?.label ?? effectId.toUpperCase()}
                                </span>
                            ))}
                        </div>
                    )}
                    <AbilityIndicator />
                    {driftBoostTier > 0 && (
                        <div
                            id="drift-tier-indicator"
                            data-tier={driftBoostTier}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontFamily: "'Courier New', monospace",
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                marginTop: '4px',
                                color: tierConfig.color,
                                textShadow: tierConfig.glow,
                                transition: 'color 0.3s, text-shadow 0.3s',
                            }}
                        >
                            <span
                                style={{
                                    display: 'inline-block',
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: tierConfig.color,
                                    boxShadow: tierConfig.dotGlow,
                                }}
                            />
                            DRIFT {tierConfig.label}
                        </div>
                    )}
                </div>

                <Toaster position="top-center" richColors closeButton duration={2000} />
                <div id="app-version">v{appVersion}</div>

                <div id="game-over" className={gameOver ? '' : 'hidden'}>
                    <h1>RACE RESULTS</h1>
                    <p id="race-result-summary">WINNER: {winnerName ?? 'TBD'}</p>
                    <p id="race-result-position">FINISH: P{position}</p>
                    <p id="race-result-laps">
                        LAPS: {lap}/{raceState?.totalLaps ?? lap}
                    </p>
                    <p id="race-result-track">TRACK: {trackLabel}</p>
                    <p id="race-result-duration">TIME: {raceDurationLabel ?? '--:--.--'}</p>
                    <button id="restart-btn" onClick={handleRestart} type="button">
                        REINITIALIZE
                    </button>
                </div>
            </div>

            <RaceSceneCanvas
                cruiseControlEnabled={cruiseControlEnabled}
                onConnectionStatusChange={setConnectionStatus}
                onGameOverChange={setGameOver}
                onRaceStateChange={setRaceState}
                playerName={playerName}
                resetNonce={resetNonce}
                roomId={roomId}
                selectedColorId={selectedColorId}
                selectedTrackId={selectedTrackId}
                selectedVehicleId={selectedVehicleId}
            />
        </div>
    );
};
