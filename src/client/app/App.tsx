import { Canvas, type RootState } from '@react-three/fiber';
import {
    Suspense,
    lazy,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type FormEvent,
    type SetStateAction,
} from 'react';
import * as THREE from 'three';
import { toast, Toaster } from 'sonner';
import { clientConfig } from '@/client/app/config';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LobbyCarPreview } from '@/components/LobbyCarPreview';
import { VEHICLE_CLASS_MANIFESTS, type VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import { colorIdToHexString } from '@/client/game/vehicleSelections';
import type { ConnectionStatus, RaceState } from '@/shared/network/types';

const RaceWorld = lazy(async () => {
    const module = await import('@/client/game/scene/RaceWorld');
    return { default: module.RaceWorld };
});

const GithubIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
);

const BunIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12">
        <path d="M12 22.596c6.628 0 12-4.338 12-9.688 0-3.318-2.057-6.248-5.219-7.986-1.286-.715-2.297-1.357-3.139-1.89C14.058 2.025 13.08 1.404 12 1.404c-1.097 0-2.334.785-3.966 1.821a49.92 49.92 0 0 1-2.816 1.697C2.057 6.66 0 9.59 0 12.908c0 5.35 5.372 9.687 12 9.687v.001ZM10.599 4.715c.334-.759.503-1.58.498-2.409 0-.145.202-.187.23-.029.658 2.783-.902 4.162-2.057 4.624-.124.048-.199-.121-.103-.209a5.763 5.763 0 0 0 1.432-1.977Zm2.058-.102a5.82 5.82 0 0 0-.782-2.306v-.016c-.069-.123.086-.263.185-.172 1.962 2.111 1.307 4.067.556 5.051-.082.103-.23-.003-.189-.126a5.85 5.85 0 0 0 .23-2.431Zm1.776-.561a5.727 5.727 0 0 0-1.612-1.806v-.014c-.112-.085-.024-.274.114-.218 2.595 1.087 2.774 3.18 2.459 4.407a.116.116 0 0 1-.049.071.11.11 0 0 1-.153-.026.122.122 0 0 1-.022-.083 5.891 5.891 0 0 0-.737-2.331Zm-5.087.561c-.617.546-1.282.76-2.063 1-.117 0-.195-.078-.156-.181 1.752-.909 2.376-1.649 2.999-2.778 0 0 .155-.118.188.085 0 .304-.349 1.329-.968 1.874Zm4.945 11.237a2.957 2.957 0 0 1-.937 1.553c-.346.346-.8.565-1.286.62a2.178 2.178 0 0 1-1.327-.62 2.955 2.955 0 0 1-.925-1.553.244.244 0 0 1 .064-.198.234.234 0 0 1 .193-.069h3.965a.226.226 0 0 1 .19.07c.05.053.073.125.063.197Zm-5.458-2.176a1.862 1.862 0 0 1-2.384-.245 1.98 1.98 0 0 1-.233-2.447c.207-.319.503-.566.848-.713a1.84 1.84 0 0 1 1.092-.11c.366.075.703.261.967.531a1.98 1.98 0 0 1 .408 2.114 1.931 1.931 0 0 1-.698.869v.001Zm8.495.005a1.86 1.86 0 0 1-2.381-.253 1.964 1.964 0 0 1-.547-1.366c0-.384.11-.76.32-1.079.207-.319.503-.567.849-.713a1.844 1.844 0 0 1 1.093-.108c.367.076.704.262.968.534a1.98 1.98 0 0 1 .4 2.117 1.932 1.932 0 0 1-.702.868Z" />
    </svg>
);

const ThreeIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12">
        <path d="M.38 0a.268.268 0 0 0-.256.332l2.894 11.716a.268.268 0 0 0 .01.04l2.89 11.708a.268.268 0 0 0 .447.128L23.802 7.15a.268.268 0 0 0-.112-.45l-5.784-1.667a.268.268 0 0 0-.123-.035L6.38 1.715a.268.268 0 0 0-.144-.04L.456.01A.268.268 0 0 0 .38 0zm.374.654L5.71 2.08 1.99 5.664zM6.61 2.34l4.864 1.4-3.65 3.515zm-.522.12l1.217 4.926-4.877-1.4zm6.28 1.538l4.878 1.404-3.662 3.53zm-.52.13l1.208 4.9-4.853-1.392zm6.3 1.534l4.947 1.424-3.715 3.574zm-.524.12l1.215 4.926-4.876-1.398zm-15.432.696l4.964 1.424-3.726 3.586zM8.047 8.15l4.877 1.4-3.66 3.527zm-.518.137l1.236 5.017-4.963-1.432zm6.274 1.535l4.965 1.425-3.73 3.586zm-.52.127l1.235 5.012-4.958-1.43zm-9.63 2.438l4.873 1.406-3.656 3.523zm5.854 1.687l4.863 1.403-3.648 3.51zm-.54.04l1.214 4.927-4.875-1.4zm-3.896 4.02l5.037 1.442-3.782 3.638z" />
    </svg>
);

const SocketIoIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12">
        <path d="M11.9362.0137a12.1694 12.1694 0 00-2.9748.378C4.2816 1.5547.5678 5.7944.0918 10.6012c-.59 4.5488 1.7079 9.2856 5.6437 11.6345 3.8608 2.4179 9.0926 2.3199 12.8734-.223 3.3969-2.206 5.5118-6.2277 5.3858-10.2845-.058-4.0159-2.31-7.9167-5.7588-9.9796C16.354.5876 14.1431.0047 11.9362.0137zm-.063 1.696c4.9448-.007 9.7886 3.8137 10.2815 8.9245.945 5.6597-3.7528 11.4125-9.4875 11.5795-5.4538.544-10.7245-4.0798-10.8795-9.5566-.407-4.4338 2.5159-8.8346 6.6977-10.2995a9.1126 9.1126 0 013.3878-.647zm5.0908 3.2248c-2.6869 2.0849-5.2598 4.3078-7.8886 6.4567 1.2029.017 2.4118.016 3.6208.01 1.41-2.165 2.8589-4.3008 4.2678-6.4667zm-5.6647 7.6536c-1.41 2.166-2.86 4.3088-4.2699 6.4737 2.693-2.0799 5.2548-4.3198 7.9017-6.4557a255.4132 255.4132 0 00-3.6318-.018z" />
    </svg>
);

const TailwindIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12">
        <path d="M12.001,4.8c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624 C13.666,10.618,15.027,12,18.001,12c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624 C16.337,6.182,14.976,4.8,12.001,4.8z M6.001,12c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624 c1.177,1.194,2.538,2.576,5.512,2.576c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624 C10.337,13.382,8.976,12,6.001,12z" />
    </svg>
);

const techStack = [
    { name: 'Bun', description: 'Blazing fast JavaScript runtime & package manager.', icon: <BunIcon /> },
    { name: 'React Three Fiber', description: 'Declarative 3D graphics and scenes for the web.', icon: <ThreeIcon /> },
    { name: 'Socket.IO', description: 'Real-time, ultra-fast multiplayer game synchronization.', icon: <SocketIoIcon /> },
    { name: 'Tailwind CSS', description: 'Utility-first styling for beautiful and responsive UIs.', icon: <TailwindIcon /> }
];

type RaceSceneCanvasProps = {
    cruiseControlEnabled: boolean;
    onConnectionStatusChange: (status: ConnectionStatus) => void;
    onGameOverChange: (isGameOver: boolean) => void;
    onRaceStateChange: (state: RaceState | null) => void;
    playerName: string;
    resetNonce: number;
    roomId: string;
    selectedColorId: string;
    selectedVehicleId: VehicleClassId;
};

const RACE_CANVAS_CAMERA = { fov: 60, near: 0.1, far: 1000, position: [0, 30, -30] as [number, number, number] };
const RACE_CANVAS_SHADOWS = { type: THREE.PCFShadowMap as THREE.ShadowMapType };
const THREE_CLOCK_DEPRECATION_WARNING =
    'THREE.THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.';
const RAPIER_DEPRECATION_WARNING =
    'using deprecated parameters for the initialization function; pass a single object instead';

/**
 * Known deprecation and context-loss messages from Three.js / Rapier dependencies.
 * We suppress these to reduce console noise since the underlying issues live in
 * third-party code we cannot patch until the next major upgrade.
 *
 * WARNING: This also wraps console.error to suppress the context-loss message.
 * Keep patterns narrow and specific — avoid broad substrings that could hide
 * genuine application errors. Remove entries as soon as the upstream fix ships.
 */
const SUPPRESSED_PATTERNS = [
    THREE_CLOCK_DEPRECATION_WARNING,
    RAPIER_DEPRECATION_WARNING,
    'THREE.WebGLRenderer: Context Lost.',
];

const matchesSuppressedPattern = (value: unknown): boolean =>
    typeof value === 'string' && SUPPRESSED_PATTERNS.some((p) => value.includes(p));

const suppressThreeDeprecationWarnings = () => {
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);
    const suppressedMessages = new Set<string>();

    const wrapLogger = (original: typeof console.warn): typeof console.warn =>
        (...args: unknown[]) => {
            const firstArg = args[0];
            if (matchesSuppressedPattern(firstArg)) {
                const key = firstArg as string;
                if (!suppressedMessages.has(key)) {
                    suppressedMessages.add(key);
                    original(`[GT Racer] Suppressing repeated message until dependency upgrade: ${key}`);
                }
                return;
            }
            original(...args);
        };

    const wrappedWarn = wrapLogger(originalWarn);
    const wrappedError = wrapLogger(originalError);
    console.warn = wrappedWarn;
    console.error = wrappedError;

    return () => {
        if (console.warn === wrappedWarn) {
            console.warn = originalWarn;
        }
        if (console.error === wrappedError) {
            console.error = originalError;
        }
    };
};

const EFFECT_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
    boosted: { label: 'BOOSTED', className: 'effect-boost' },
    flat_tire: { label: 'FLAT TIRE', className: 'effect-flat-tire' },
    stunned: { label: 'STUNNED', className: 'effect-stunned' },
    slowed: { label: 'SLOWED', className: 'effect-slowed' },
};

const RaceSceneCanvas = memo(
    ({
        cruiseControlEnabled,
        onConnectionStatusChange,
        onGameOverChange,
        onRaceStateChange,
        playerName,
        resetNonce,
        roomId,
        selectedColorId,
        selectedVehicleId,
    }: RaceSceneCanvasProps) => {
        const handleCreated = useCallback(({ gl }: RootState) => {
            gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }, []);

        useEffect(() => {
            // TODO(gt-212): Remove this temporary suppression after upgrading Three.js/Rapier.
            return suppressThreeDeprecationWarnings();
        }, []);

        return (
            <Canvas
                camera={RACE_CANVAS_CAMERA}
                dpr={[1, 2]}
                onCreated={handleCreated}
                shadows={RACE_CANVAS_SHADOWS}
            >
                <Suspense fallback={null}>
                    {playerName && roomId ? (
                        <RaceWorld
                            cruiseControlEnabled={cruiseControlEnabled}
                            onConnectionStatusChange={onConnectionStatusChange}
                            onGameOverChange={onGameOverChange}
                            onRaceStateChange={onRaceStateChange}
                            playerName={playerName}
                            roomId={roomId}
                            resetNonce={resetNonce}
                            selectedColorId={selectedColorId}
                            selectedVehicleId={selectedVehicleId}
                        />
                    ) : null}
                </Suspense>
            </Canvas>
        );
    }
);

RaceSceneCanvas.displayName = 'RaceSceneCanvas';

type LandingHeroProps = {
    handleCreateNewGame: () => Promise<void>;
    handleJoinExistingGame: () => void;
    handleJoinSubmit: (event: FormEvent<HTMLFormElement>) => void;
    homeError: string;
    isCheckingServer: boolean;
    joinRoomInput: string;
    setJoinRoomInput: Dispatch<SetStateAction<string>>;
    showJoinPrompt: boolean;
};

const LandingHero = ({
    isCheckingServer,
    handleCreateNewGame,
    handleJoinExistingGame,
    showJoinPrompt,
    joinRoomInput,
    setJoinRoomInput,
    handleJoinSubmit,
    homeError
}: LandingHeroProps) => {
    const [scrollY, setScrollY] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            setScrollY(window.scrollY);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Speeds up the scroll offset mapped to horizontal translation
    const carOffset = scrollY * 2.5;

    return (
        <div className="text-[#D0B378] relative font-sans bg-[#1D1F2D] overflow-x-hidden">
            {/* Background layer */}
            <div className="fixed top-0 left-0 w-full h-screen bg-gradient-to-b from-[#252838] to-[#0A0B10] pointer-events-none z-0">
                <div className="absolute inset-0 bg-[url('/branding/icon.svg')] bg-no-repeat bg-center opacity-5 scale-110 blur-[2px]"></div>
            </div>

            {/* Parallax Car (Fixed Position) */}
            <div 
                className="fixed top-[45vh] w-[800px] pointer-events-none z-50 transition-transform duration-75 ease-out drop-shadow-[0_0_50px_rgba(255,40,40,0.5)]"
                style={{ transform: `translate3d(calc(100vw - ${carOffset}px), 0vh, 0)` }}
            >
                <svg viewBox="0 0 500 150" className="w-[800px] h-auto">
                    {/* Speed lines */}
                    <path d="M500,100 L440,100 M480,80 L420,80 M490,120 L450,120" stroke="#ff2a2a" strokeWidth="4" strokeLinecap="round" opacity="0.6" className="animate-pulse" />
                    <path d="M460,90 L400,90 M470,110 L430,110" stroke="#ff2a2a" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                    
                    {/* Shadow */}
                    <ellipse cx="230" cy="130" rx="180" ry="10" fill="#000" opacity="0.6" />

                    {/* Rear Wing (F50 signature swooping wing) */}
                    <path d="M 400,65 C 420,50 430,45 440,45 L 435,70 Z" fill="#900" />
                    <path d="M 440,45 C 430,45 380,55 350,65 L 400,65 Z" fill="#b00" />
                    
                    {/* Car Body (Ferrari Red) */}
                    <path d="M 60,110 C 50,110 40,105 35,95 C 45,85 70,80 120,75 C 150,65 180,50 220,45 C 260,40 280,45 310,55 C 330,60 380,60 410,65 C 430,68 440,75 440,85 C 440,100 430,110 420,110 Z" fill="url(#ferrari-red)" />
                    
                    {/* Side detailing and intakes */}
                    <path d="M 60,95 C 100,90 200,85 280,95 C 320,100 360,95 400,90" fill="none" stroke="#310000" strokeWidth="3" />
                    <path d="M 280,95 C 310,95 330,85 340,75 C 320,85 290,95 280,95 Z" fill="#111" />
                    
                    {/* Windshield & Windows */}
                    <path d="M 180,50 C 210,45 240,45 260,50 C 255,60 210,65 160,65 C 160,65 170,55 180,50 Z" fill="#111" stroke="#333" strokeWidth="1" />
                    <path d="M 265,52 C 275,55 290,60 300,65 L 250,65 C 255,60 260,55 265,52 Z" fill="#111" />

                    {/* Front intake & lights */}
                    <path d="M 35,95 C 45,85 60,85 65,90 C 60,95 45,100 35,95 Z" fill="#fff" opacity="0.9" />
                    <path d="M 40,105 C 50,100 65,100 75,105 L 65,110 Z" fill="#111" />
                    
                    {/* Tail lights */}
                    <circle cx="435" cy="85" r="4" fill="#f00" stroke="#500" strokeWidth="1" />
                    <circle cx="435" cy="85" r="2" fill="#ffaaaa" />

                    {/* Wheels */}
                    <circle cx="120" cy="105" r="22" fill="#111" />
                    <circle cx="120" cy="105" r="16" fill="url(#wheel-silver)" />
                    <circle cx="120" cy="105" r="14" fill="none" stroke="#222" strokeWidth="2" strokeDasharray="4 2" />
                    <circle cx="120" cy="105" r="4" fill="#000" />
                    
                    <circle cx="360" cy="103" r="24" fill="#111" />
                    <circle cx="360" cy="103" r="18" fill="url(#wheel-silver)" />
                    <circle cx="360" cy="103" r="16" fill="none" stroke="#222" strokeWidth="2" strokeDasharray="4 3" />
                    <circle cx="360" cy="103" r="5" fill="#000" />

                    {/* Headlight Beam */}
                    <path d="M 30,95 L -200,60 L -200,140 L 30,105 Z" fill="url(#headlight-grad)" opacity="0.8" />
                    <ellipse cx="35" cy="98" rx="5" ry="12" fill="#FFFFFF" className="animate-pulse" />
                    
                    <defs>
                        <linearGradient id="ferrari-red" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#ff1a1a" />
                            <stop offset="40%" stopColor="#cc0000" />
                            <stop offset="100%" stopColor="#660000" />
                        </linearGradient>
                        <radialGradient id="wheel-silver" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="70%" stopColor="#888888" />
                            <stop offset="100%" stopColor="#444444" />
                        </radialGradient>
                        <linearGradient id="headlight-grad" x1="100%" y1="50%" x2="0%" y2="50%">
                            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                            <stop offset="40%" stopColor="#ffdd99" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#ffdd99" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>

            {/* Content Container (Scrolls naturally) */}
            <div className="relative z-20 w-full flex flex-col items-center">
                
                {/* Hero Section */}
                <div className="w-full min-h-screen flex flex-col items-center justify-center p-4">
                    <h1 className="text-6xl md:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-[#FFF] via-[#EBD4A0] to-[#BBAE8B] mb-12 uppercase drop-shadow-[0_0_20px_rgba(208,179,120,0.4)] text-center px-4 leading-tight">
                        GT Racer Insanity
                    </h1>
                    
                    <div className="w-full max-w-md space-y-5 p-8 bg-[#1D1F2D]/70 backdrop-blur-xl rounded-2xl border border-[#BCAE8A]/30 shadow-[0_0_50px_rgba(32,34,48,0.8)] hover:border-[#D0B378]/50 transition-colors">
                        <Button 
                            disabled={isCheckingServer} 
                            onClick={handleCreateNewGame} 
                            type="button"
                            className="w-full h-16 text-xl font-black bg-gradient-to-r from-[#D0B378] via-[#EBD4A0] to-[#CBB485] text-[#1D1F2B] hover:opacity-90 hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(208,179,120,0.5)] border-none"
                        >
                            PLAY GAME
                        </Button>
                        <Button 
                            onClick={handleJoinExistingGame} 
                            type="button" 
                            variant="ghost"
                            className="w-full h-14 text-lg font-bold border-2 border-[#D0B378]/70 text-[#EBD4A0] hover:bg-[#D0B378] hover:text-[#1D1F2B] bg-transparent transition-all"
                        >
                            JOIN EXISTING GAME
                        </Button>
                        {showJoinPrompt ? (
                            <form className="space-y-4 mt-6 pt-6 border-t-2 border-[#BCAE8A]/20" onSubmit={handleJoinSubmit}>
                                <Input
                                    autoFocus
                                    onChange={(event) => setJoinRoomInput(event.target.value)}
                                    placeholder="Enter Game ID"
                                    value={joinRoomInput}
                                    className="h-14 text-center text-xl tracking-widest bg-[#151722] border-[#D0B378]/40 text-[#EBD4A0] placeholder:text-[#BCAE8A]/40 focus-visible:ring-[#D0B378] uppercase"
                                />
                                <Button type="submit" className="w-full h-14 bg-[#BBAE8B] text-[#1D1F2B] hover:bg-[#DEC58B] font-black text-lg">ENTER RACE</Button>
                            </form>
                        ) : null}
                        {homeError ? <div className="text-center font-bold text-red-400 bg-red-950/60 p-4 rounded-lg mt-4 animate-pulse border border-red-500/50">{homeError}</div> : null}
                    </div>
                </div>

                {/* Tech Stack Section */}
                <div className="w-full min-h-screen flex flex-col items-center justify-center p-8 bg-[#0A0B10]/80 backdrop-blur-md border-y border-[#BCAE8A]/10 mt-32">
                    <h2 className="text-4xl md:text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-[#D0B378] to-[#BBAE8B] mb-16 uppercase drop-shadow-md">
                        Under The Hood
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl w-full">
                        {techStack.map((tech) => (
                            <div key={tech.name} className="group relative p-8 bg-[#1A1C29] border border-[#BCAE8A]/20 rounded-2xl overflow-hidden hover:-translate-y-3 transition-transform duration-500 shadow-xl hover:shadow-[0_10px_40px_rgba(208,179,120,0.15)]">
                                <div className="absolute inset-0 bg-gradient-to-br from-[#D0B378]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-500 transform-gpu">{tech.icon}</div>
                                <h3 className="text-2xl font-bold text-[#EBD4A0] mb-3">{tech.name}</h3>
                                <p className="text-[#BCAE8A]/70 text-lg leading-relaxed">{tech.description}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Section */}
                <footer className="w-full bg-[#050608] pt-20 pb-12 flex flex-col items-center justify-center border-t border-[#BCAE8A]/20">
                    <h2 className="text-3xl font-black italic tracking-tighter text-[#EBD4A0] mb-8 uppercase">GT Racer Insanity</h2>
                    <div className="flex gap-6 mb-12">
                        <a 
                            href="https://github.com/ragaeeb/gt-racer-insanity" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[#BCAE8A] hover:text-[#FFF] hover:scale-110 transition-all duration-300"
                        >
                            <GithubIcon />
                        </a>
                    </div>
                    <p className="text-[#BCAE8A]/50 text-sm font-medium tracking-wider uppercase">
                        © {new Date().getFullYear()} GT Racer Insanity. Built from the ground up.
                    </p>
                </footer>
            </div>
        </div>
    );
};

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
    const [selectedColorId, setSelectedColorId] = useState('red');
    const [gameOver, setGameOver] = useState(false);
    const [resetNonce, setResetNonce] = useState(0);
    const [cruiseControlEnabled, setCruiseControlEnabled] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [raceState, setRaceState] = useState<RaceState | null>(null);
    const appVersion = __APP_VERSION__;
    const speedKph = useHudStore((state) => state.speedKph);
    const lap = useHudStore((state) => state.lap);
    const position = useHudStore((state) => state.position);
    const trackLabel = useHudStore((state) => state.trackLabel);
    const activeEffectIds = useHudStore((state) => state.activeEffectIds);
    const pendingToasts = useHudStore((state) => state.pendingToasts);
    const clearPendingToast = useHudStore((state) => state.clearPendingToast);
    const latestSnapshot = useRuntimeStore((state) => state.latestSnapshot);
    const roomIdFromUrl = useMemo(() => new URLSearchParams(routeSearch).get('room') ?? '', [routeSearch]);
    const winnerName = useMemo(() => {
        if (!raceState?.winnerPlayerId) {
            return null;
        }

        const winnerSnapshot = latestSnapshot?.players.find((player) => player.id === raceState.winnerPlayerId);
        return winnerSnapshot?.name ?? raceState.winnerPlayerId;
    }, [latestSnapshot, raceState]);

    useEffect(() => {
        if (routePath !== '/lobby') {
            return;
        }
        const activeVehicle = VEHICLE_CLASS_MANIFESTS.find((v) => v.id === selectedVehicleId) ?? VEHICLE_CLASS_MANIFESTS[0];
        const palette = activeVehicle.colorPaletteIds;
        if (!palette.includes(selectedColorId)) {
            setSelectedColorId(palette[0]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedColorId excluded: only re-check on vehicle/route change
    }, [routePath, selectedVehicleId]);

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
        setRaceState(null);
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

    const handleGenerateDebugLog = useCallback(() => {
        const debugWindow = window as Window & {
            __GT_DIAG__?: {
                clearReport: () => void;
                downloadReport: () => void;
            };
        };

        debugWindow.__GT_DIAG__?.downloadReport();
    }, []);

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
        const activeVehicle = VEHICLE_CLASS_MANIFESTS.find((v) => v.id === selectedVehicleId) ?? VEHICLE_CLASS_MANIFESTS[0];
        const availableColors = activeVehicle.colorPaletteIds;

        return (
            <div className="flex min-h-screen items-center justify-center bg-[#202230] px-4 font-sans before:absolute before:inset-0 before:bg-[url('/branding/icon.svg')] before:bg-no-repeat before:bg-center before:opacity-5 before:pointer-events-none">
                <form className="w-full max-w-sm space-y-8 p-8 pb-10 bg-[#2A2D3D]/80 backdrop-blur-md rounded-xl border border-[#BCAE8A]/20 shadow-2xl relative z-10" onSubmit={handleStartRace}>
                    <h2 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-[#D0B378] to-[#BBAE8B] text-center uppercase">Join Race</h2>
                    <Input
                        autoFocus
                        id="player-name-input"
                        maxLength={24}
                        onChange={(event) => setNameInput(event.target.value)}
                        placeholder="Player Name"
                        value={nameInput}
                        className="h-14 text-lg bg-[#1D1F2D] border-[#BCAE8A]/40 text-[#EBD4A0] placeholder:text-[#BCAE8A]/50 focus-visible:ring-[#D0B378] text-center font-bold"
                    />

                    <fieldset className="space-y-3 border-none p-0 m-0">
                        <legend className="text-sm font-bold text-[#BCAE8A]/80 uppercase tracking-wider mb-1 block">Vehicle Class</legend>
                        <div className="grid grid-cols-3 gap-3">
                            {VEHICLE_CLASS_MANIFESTS.map((vehicle) => (
                                <button
                                    key={vehicle.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedVehicleId(vehicle.id);
                                        if (!vehicle.colorPaletteIds.includes(selectedColorId)) {
                                            setSelectedColorId(vehicle.colorPaletteIds[0]);
                                        }
                                    }}
                                    className={`py-4 px-3 rounded-lg border-2 font-bold text-sm uppercase transition-all ${
                                        selectedVehicleId === vehicle.id
                                            ? 'border-[#D0B378] bg-[#D0B378]/20 text-[#EBD4A0]'
                                            : 'border-[#BCAE8A]/20 text-[#BCAE8A]/60 hover:border-[#BCAE8A]/40'
                                    }`}
                                >
                                    {vehicle.label}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className="space-y-3 border-none p-0 m-0 mt-6">
                        <legend className="text-sm font-bold text-[#BCAE8A]/80 uppercase tracking-wider mb-2 block">Paintjob</legend>
                        <div className="flex gap-4 justify-center flex-wrap">
                            {availableColors.map((colorId) => (
                                <button
                                    key={colorId}
                                    type="button"
                                    onClick={() => setSelectedColorId(colorId)}
                                    className={`w-11 h-11 rounded-full border-[3px] transition-all ${
                                        selectedColorId === colorId
                                            ? 'border-[#EBD4A0] scale-110 ring-2 ring-[#D0B378]/50'
                                            : 'border-[#BCAE8A]/30 hover:border-[#BCAE8A]/60'
                                    }`}
                                    style={{ backgroundColor: colorIdToHexString(colorId) }}
                                    title={colorId}
                                />
                            ))}
                        </div>
                    </fieldset>

                    <div className="mt-6">
                        <LobbyCarPreview selectedVehicleId={selectedVehicleId} selectedColorId={selectedColorId} />
                    </div>

                    <Button 
                        id="player-name-confirm" 
                        type="submit"
                        className="w-full h-14 text-lg font-bold bg-gradient-to-r from-[#D0B378] to-[#CBB485] text-[#1D1F2B] hover:from-[#EBD4A0] hover:to-[#CFB479] hover:text-[#1D1F2B] transition-all transform hover:scale-105"
                    >
                        START
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
                <div id="hud-panel">
                    <div id="speed">Speed: {Math.round(speedKph)} km/h</div>
                    <div id="lap-position">
                        Lap {lap} | P{position}
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
                        Cruise
                    </label>
                    <button id="generate-debug-log-btn" onClick={handleGenerateDebugLog} type="button">
                        Generate Debug Log
                    </button>
                    <div id="player-name-badge">{playerName || 'Not set'}</div>
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
                </div>
                <Toaster position="top-center" richColors closeButton duration={2000} />
                <div id="app-version">v{appVersion}</div>
                <div id="game-over" className={gameOver ? '' : 'hidden'}>
                    <h1>RACE RESULTS</h1>
                    <p id="race-result-summary">
                        Winner: {winnerName ?? 'TBD'}
                    </p>
                    <p id="race-result-position">
                        Your Finish: P{position}
                    </p>
                    <p id="race-result-laps">
                        Laps: {lap}/{raceState?.totalLaps ?? lap}
                    </p>
                    <p id="race-result-track">
                        Track: {trackLabel}
                    </p>
                    <button id="restart-btn" onClick={handleRestart} type="button">
                        Restart
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
                roomId={roomIdFromUrl}
                selectedColorId={selectedColorId}
                selectedVehicleId={selectedVehicleId}
            />
        </div>
    );
};
