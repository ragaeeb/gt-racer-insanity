import React, { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const APP_NAME = __APP_NAME__;
const APP_VERSION = __APP_VERSION__;
const APP_HOMEPAGE = __APP_HOMEPAGE__;
const APP_AUTHOR_NAME = __APP_AUTHOR_NAME__;
const APP_AUTHOR_URL = __APP_AUTHOR_URL__ || APP_HOMEPAGE;

const GithubIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden="true" focusable="false">
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"
        />
    </svg>
);

const BunIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10" aria-hidden="true" focusable="false">
        <path d="M12 22.596c6.628 0 12-4.338 12-9.688 0-3.318-2.057-6.248-5.219-7.986-1.286-.715-2.297-1.357-3.139-1.89C14.058 2.025 13.08 1.404 12 1.404c-1.097 0-2.334.785-3.966 1.821a49.92 49.92 0 0 1-2.816 1.697C2.057 6.66 0 9.59 0 12.908c0 5.35 5.372 9.687 12 9.687v.001ZM10.599 4.715c.334-.759.503-1.58.498-2.409 0-.145.202-.187.23-.029.658 2.783-.902 4.162-2.057 4.624-.124.048-.199-.121-.103-.209a5.763 5.763 0 0 0 1.432-1.977Zm2.058-.102a5.82 5.82 0 0 0-.782-2.306v-.016c-.069-.123.086-.263.185-.172 1.962 2.111 1.307 4.067.556 5.051-.082.103-.23-.003-.189-.126a5.85 5.85 0 0 0 .23-2.431Zm1.776-.561a5.727 5.727 0 0 0-1.612-1.806v-.014c-.112-.085-.024-.274.114-.218 2.595 1.087 2.774 3.18 2.459 4.407a.116.116 0 0 1-.049.071.11.11 0 0 1-.153-.026.122.122 0 0 1-.022-.083 5.891 5.891 0 0 0-.737-2.331Zm-5.087.561c-.617.546-1.282.76-2.063 1-.117 0-.195-.078-.156-.181 1.752-.909 2.376-1.649 2.999-2.778 0 0 .155-.118.188.085 0 .304-.349 1.329-.968 1.874Zm4.945 11.237a2.957 2.957 0 0 1-.937 1.553c-.346.346-.8.565-1.286.62a2.178 2.178 0 0 1-1.327-.62 2.955 2.955 0 0 1-.925-1.553.244.244 0 0 1 .064-.198.234.234 0 0 1 .193-.069h3.965a.226.226 0 0 1 .19.07c.05.053.073.125.063.197Zm-5.458-2.176a1.862 1.862 0 0 1-2.384-.245 1.98 1.98 0 0 1-.233-2.447c.207-.319.503-.566.848-.713a1.84 1.84 0 0 1 1.092-.11c.366.075.703.261.967.531a1.98 1.98 0 0 1 .408 2.114 1.931 1.931 0 0 1-.698.869v.001Zm8.495.005a1.86 1.86 0 0 1-2.381-.253 1.964 1.964 0 0 1-.547-1.366c0-.384.11-.76.32-1.079.207-.319.503-.567.849-.713a1.844 1.844 0 0 1 1.093-.108c.367.076.704.262.968.534a1.98 1.98 0 0 1 .4 2.117 1.932 1.932 0 0 1-.702.868Z" />
    </svg>
);

const ThreeIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10" aria-hidden="true" focusable="false">
        <path d="M.38 0a.268.268 0 0 0-.256.332l2.894 11.716a.268.268 0 0 0 .01.04l2.89 11.708a.268.268 0 0 0 .447.128L23.802 7.15a.268.268 0 0 0-.112-.45l-5.784-1.667a.268.268 0 0 0-.123-.035L6.38 1.715a.268.268 0 0 0-.144-.04L.456.01A.268.268 0 0 0 .38 0zm.374.654L5.71 2.08 1.99 5.664zM6.61 2.34l4.864 1.4-3.65 3.515zm-.522.12l1.217 4.926-4.877-1.4zm6.28 1.538l4.878 1.404-3.662 3.53zm-.52.13l1.208 4.9-4.853-1.392zm6.3 1.534l4.947 1.424-3.715 3.574zm-.524.12l1.215 4.926-4.876-1.398zm-15.432.696l4.964 1.424-3.726 3.586zM8.047 8.15l4.877 1.4-3.66 3.527zm-.518.137l1.236 5.017-4.963-1.432zm6.274 1.535l4.965 1.425-3.73 3.586zm-.52.127l1.235 5.012-4.958-1.43zm-9.63 2.438l4.873 1.406-3.656 3.523zm5.854 1.687l4.863 1.403-3.648 3.51zm-.54.04l1.214 4.927-4.875-1.4zm-3.896 4.02l5.037 1.442-3.782 3.638z" />
    </svg>
);

const SocketIoIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10" aria-hidden="true" focusable="false">
        <path d="M11.9362.0137a12.1694 12.1694 0 00-2.9748.378C4.2816 1.5547.5678 5.7944.0918 10.6012c-.59 4.5488 1.7079 9.2856 5.6437 11.6345 3.8608 2.4179 9.0926 2.3199 12.8734-.223 3.3969-2.206 5.5118-6.2277 5.3858-10.2845-.058-4.0159-2.31-7.9167-5.7588-9.9796C16.354.5876 14.1431.0047 11.9362.0137zm-.063 1.696c4.9448-.007 9.7886 3.8137 10.2815 8.9245.945 5.6597-3.7528 11.4125-9.4875 11.5795-5.4538.544-10.7245-4.0798-10.8795-9.5566-.407-4.4338 2.5159-8.8346 6.6977-10.2995a9.1126 9.1126 0 013.3878-.647zm5.0908 3.2248c-2.6869 2.0849-5.2598 4.3078-7.8886 6.4567 1.2029.017 2.4118.016 3.6208.01 1.41-2.165 2.8589-4.3008 4.2678-6.4667zm-5.6647 7.6536c-1.41 2.166-2.86 4.3088-4.2699 6.4737 2.693-2.0799 5.2548-4.3198 7.9017-6.4557a255.4132 255.4132 0 00-3.6318-.018z" />
    </svg>
);

const TailwindIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10" aria-hidden="true" focusable="false">
        <path d="M12.001,4.8c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624 C13.666,10.618,15.027,12,18.001,12c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624 C16.337,6.182,14.976,4.8,12.001,4.8z M6.001,12c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624 c1.177,1.194,2.538,2.576,5.512,2.576c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624 C10.337,13.382,8.976,12,6.001,12z" />
    </svg>
);

const techStack = [
    {
        name: 'Bun',
        description: 'Blazing-fast JS runtime & package manager for the server and toolchain.',
        icon: <BunIcon />,
    },
    {
        name: 'React Three Fiber',
        description: 'Declarative 3D scene graph rendering powered by Three.js.',
        icon: <ThreeIcon />,
    },
    {
        name: 'Socket.IO',
        description: 'Real-time bidirectional event-based multiplayer synchronization.',
        icon: <SocketIoIcon />,
    },
    {
        name: 'Tailwind CSS',
        description: 'Utility-first CSS framework for precise and responsive UI styling.',
        icon: <TailwindIcon />,
    },
];

const systemStatus = [
    { label: 'MULTIPLAYER', color: '#00E5FF' },
    { label: 'PHYSICS: RAPIER3D', color: '#00FFA3' },
    { label: 'ENGINE: READY', color: '#D0B378' },
];

export type LandingHeroProps = {
    handleCreateNewGame: () => Promise<void>;
    handleJoinExistingGame: () => void;
    handleJoinSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    homeError: string;
    isCheckingServer: boolean;
    joinRoomInput: string;
    setJoinRoomInput: Dispatch<SetStateAction<string>>;
    showJoinPrompt: boolean;
};

export const LandingHero = ({
    isCheckingServer,
    handleCreateNewGame,
    handleJoinExistingGame,
    showJoinPrompt,
    joinRoomInput,
    setJoinRoomInput,
    handleJoinSubmit,
    homeError,
}: LandingHeroProps) => {
    const [scrollY, setScrollY] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            setScrollY(window.scrollY);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const carOffset = scrollY * 2.5;

    return (
        <div className="text-[#C8E8FF] relative font-sans bg-[#020408] overflow-x-hidden">
            {/* ── Background layers ── */}
            <div className="fixed top-0 left-0 w-full h-screen pointer-events-none z-0">
                <div className="absolute inset-0 bg-gradient-to-b from-[#060A14] via-[#040810] to-[#02040C]" />
                <div className="absolute inset-0 cyber-grid opacity-100" />
                <div
                    className="absolute inset-0 scan-lines opacity-100"
                    style={{ animation: 'scan-move 10s linear infinite' }}
                />
                <div
                    className="absolute inset-0 bg-[url('/branding/icon.svg')] bg-no-repeat bg-center scale-110"
                    style={{ opacity: 0.035, filter: 'blur(1px) saturate(0)' }}
                />
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(2,4,8,0.7) 100%)',
                    }}
                />
            </div>

            {/* ── Parallax Car ── */}
            <div
                className="fixed top-[42vh] w-[800px] pointer-events-none z-50 transition-transform duration-75 ease-out"
                style={{ transform: `translate3d(calc(100vw - ${carOffset}px), 0, 0)` }}
            >
                <svg viewBox="0 0 500 150" className="w-[800px] h-auto" aria-hidden="true" focusable="false">
                    <path
                        d="M500,100 L440,100 M480,80 L420,80 M490,120 L455,120"
                        stroke="#00E5FF"
                        strokeWidth="3"
                        strokeLinecap="round"
                        opacity="0.75"
                        className="animate-pulse"
                    />
                    <path
                        d="M462,90 L385,90 M472,110 L405,110 M458,74 L398,74"
                        stroke="#00E5FF"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        opacity="0.4"
                    />
                    <path
                        d="M500,96 L475,96 M500,104 L480,104"
                        stroke="#4DE2FF"
                        strokeWidth="1"
                        strokeLinecap="round"
                        opacity="0.25"
                        strokeDasharray="3 4"
                    />
                    <circle cx="442" cy="100" r="2.5" fill="#00E5FF" opacity="0.9" className="animate-ping" />
                    <circle cx="422" cy="80" r="2" fill="#00E5FF" opacity="0.7" />
                    <circle cx="457" cy="120" r="1.5" fill="#4DE2FF" opacity="0.5" />
                    <ellipse cx="230" cy="132" rx="185" ry="9" fill="#000" opacity="0.65" />
                    <path d="M 400,65 C 420,50 430,45 440,45 L 435,70 Z" fill="#004b66" />
                    <path d="M 440,45 C 430,45 380,55 350,65 L 400,65 Z" fill="#007ACC" />
                    <path
                        d="M 60,110 C 50,110 40,105 35,95 C 45,85 70,80 120,75 C 150,65 180,50 220,45 C 260,40 280,45 310,55 C 330,60 380,60 410,65 C 430,68 440,75 440,85 C 440,100 430,110 420,110 Z"
                        fill="url(#blue-theme-car)"
                    />
                    <path
                        d="M 150,68 C 185,60 235,55 285,60 C 315,63 365,68 402,72"
                        fill="none"
                        stroke="rgba(0,229,255,0.45)"
                        strokeWidth="1.5"
                    />
                    <path
                        d="M 60,95 C 100,90 200,85 280,95 C 320,100 360,95 400,90"
                        fill="none"
                        stroke="#310000"
                        strokeWidth="3"
                    />
                    <path d="M 280,95 C 310,95 330,85 340,75 C 320,85 290,95 280,95 Z" fill="#111" />
                    <path
                        d="M 180,50 C 210,45 240,45 260,50 C 255,60 210,65 160,65 C 160,65 170,55 180,50 Z"
                        fill="#0a1520"
                        stroke="#00E5FF"
                        strokeWidth="0.6"
                        strokeOpacity="0.35"
                    />
                    <path d="M 265,52 C 275,55 290,60 300,65 L 250,65 C 255,60 260,55 265,52 Z" fill="#0a1520" />
                    <path d="M 35,95 C 45,85 60,85 65,90 C 60,95 45,100 35,95 Z" fill="#00E5FF" opacity="0.95" />
                    <path d="M 40,105 C 50,100 65,100 75,105 L 65,110 Z" fill="#111" />
                    <circle cx="435" cy="85" r="4" fill="#f00" stroke="#500" strokeWidth="1" />
                    <circle cx="435" cy="85" r="2" fill="#ffaaaa" />
                    <circle cx="120" cy="105" r="22" fill="#111" />
                    <circle cx="120" cy="105" r="16" fill="url(#wheel-silver)" />
                    <circle cx="120" cy="105" r="14" fill="none" stroke="#222" strokeWidth="2" strokeDasharray="4 2" />
                    <circle cx="120" cy="105" r="4" fill="#000" />
                    <circle cx="360" cy="103" r="24" fill="#111" />
                    <circle cx="360" cy="103" r="18" fill="url(#wheel-silver)" />
                    <circle cx="360" cy="103" r="16" fill="none" stroke="#222" strokeWidth="2" strokeDasharray="4 3" />
                    <circle cx="360" cy="103" r="5" fill="#000" />
                    <path d="M 30,95 L -200,55 L -200,145 L 30,105 Z" fill="url(#headlight-grad)" opacity="0.75" />
                    <ellipse cx="35" cy="98" rx="5" ry="12" fill="#00E5FF" className="animate-pulse" />
                    <defs>
                        <linearGradient id="blue-theme-car" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#00E5FF" />
                            <stop offset="40%" stopColor="#0099CC" />
                            <stop offset="100%" stopColor="#004b66" />
                        </linearGradient>
                        <radialGradient id="wheel-silver" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="70%" stopColor="#888888" />
                            <stop offset="100%" stopColor="#444444" />
                        </radialGradient>
                        <linearGradient id="headlight-grad" x1="100%" y1="50%" x2="0%" y2="50%">
                            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.75" />
                            <stop offset="35%" stopColor="#80F0FF" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>

            {/* ── Scrollable content ── */}
            <div className="relative z-20 w-full flex flex-col items-center">
                {/* ── Hero Section ── */}
                <div className="w-full min-h-screen flex flex-col items-center justify-center p-4">
                    <div className="flex flex-wrap gap-3 mb-8 justify-center">
                        {systemStatus.map((s) => (
                            <div
                                key={s.label}
                                className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase"
                                style={{ color: s.color }}
                            >
                                <span
                                    className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                                    style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}` }}
                                />
                                {s.label}
                            </div>
                        ))}
                    </div>

                    <h1
                        className="text-6xl md:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text mb-10 uppercase text-center px-4 leading-tight"
                        style={{
                            backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #00E5FF 45%, #007ACC 100%)',
                            filter: 'drop-shadow(0 0 30px rgba(0,229,255,0.35))',
                        }}
                    >
                        GT Racer Insanity
                    </h1>

                    <div
                        className="w-full max-w-md space-y-4 p-8 backdrop-blur-xl rounded relative"
                        style={{
                            background: 'rgba(2, 8, 20, 0.88)',
                            border: '1px solid rgba(0, 229, 255, 0.22)',
                            boxShadow:
                                '0 0 40px rgba(0,229,255,0.08), inset 0 0 30px rgba(0,229,255,0.03), 0 20px 60px rgba(0,0,0,0.7)',
                        }}
                    >
                        <span
                            className="absolute top-0 left-0 w-5 h-5 pointer-events-none"
                            style={{
                                borderTop: '2px solid #00E5FF',
                                borderLeft: '2px solid #00E5FF',
                                boxShadow: '-2px -2px 8px rgba(0,229,255,0.4)',
                            }}
                        />
                        <span
                            className="absolute bottom-0 right-0 w-5 h-5 pointer-events-none"
                            style={{
                                borderBottom: '2px solid #00E5FF',
                                borderRight: '2px solid #00E5FF',
                                boxShadow: '2px 2px 8px rgba(0,229,255,0.4)',
                            }}
                        />

                        <Button
                            disabled={isCheckingServer}
                            onClick={handleCreateNewGame}
                            type="button"
                            className="w-full h-16 text-xl font-black tracking-widest uppercase border-none rounded-none"
                            style={{
                                background: isCheckingServer
                                    ? 'rgba(0,229,255,0.08)'
                                    : 'linear-gradient(135deg, #00E5FF 0%, #0099CC 100%)',
                                color: isCheckingServer ? 'rgba(0,229,255,0.4)' : '#020810',
                                boxShadow: isCheckingServer ? 'none' : '0 0 30px rgba(0,229,255,0.45)',
                                letterSpacing: '0.18em',
                                fontFamily: 'monospace',
                            }}
                        >
                            {isCheckingServer ? '// CONNECTING...' : '▶  INITIALIZE RACE'}
                        </Button>

                        <Button
                            onClick={handleJoinExistingGame}
                            type="button"
                            variant="ghost"
                            className="w-full h-12 font-bold uppercase tracking-widest rounded-none"
                            style={{
                                border: '1px solid rgba(0,229,255,0.35)',
                                color: 'rgba(0,229,255,0.75)',
                                fontFamily: 'monospace',
                                letterSpacing: '0.15em',
                            }}
                        >
                            {'// JOIN EXISTING GRID'}
                        </Button>

                        {showJoinPrompt ? (
                            <form
                                className="space-y-4 pt-5 mt-2"
                                style={{ borderTop: '1px solid rgba(0,229,255,0.12)' }}
                                onSubmit={handleJoinSubmit}
                            >
                                <Input
                                    autoFocus
                                    onChange={(event) => setJoinRoomInput(event.target.value)}
                                    placeholder="ENTER GAME ID"
                                    value={joinRoomInput}
                                    className="h-14 text-center text-xl tracking-[0.25em] uppercase font-mono rounded-none"
                                    style={{
                                        background: 'rgba(0,8,20,0.8)',
                                        border: '1px solid rgba(0,229,255,0.28)',
                                        color: '#00E5FF',
                                    }}
                                />
                                <Button
                                    type="submit"
                                    className="w-full h-12 font-black uppercase tracking-widest rounded-none"
                                    style={{
                                        background: 'rgba(0,229,255,0.15)',
                                        border: '1px solid rgba(0,229,255,0.5)',
                                        color: '#00E5FF',
                                        fontFamily: 'monospace',
                                        letterSpacing: '0.15em',
                                        boxShadow: '0 0 15px rgba(0,229,255,0.15)',
                                    }}
                                >
                                    CONNECT
                                </Button>
                            </form>
                        ) : null}

                        {homeError ? (
                            <div
                                className="text-center font-mono text-sm animate-pulse px-4 py-3 mt-2"
                                style={{
                                    color: '#FF1744',
                                    background: 'rgba(255,23,68,0.08)',
                                    border: '1px solid rgba(255,23,68,0.35)',
                                    letterSpacing: '0.08em',
                                }}
                            >
                                ⚠ {homeError.toUpperCase()}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div
                    className="w-full min-h-screen flex flex-col items-center justify-center p-8 mt-20"
                    style={{
                        background: 'rgba(2,4,10,0.75)',
                        borderTop: '1px solid rgba(0,229,255,0.08)',
                        borderBottom: '1px solid rgba(0,229,255,0.08)',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <p className="font-mono text-[10px] tracking-[0.35em] uppercase text-[#00E5FF]/30 mb-2">
                        TECHNOLOGY MANIFEST
                    </p>
                    <h2
                        className="text-4xl md:text-6xl font-black italic tracking-[0.15em] text-transparent bg-clip-text mb-16 uppercase"
                        style={{ backgroundImage: 'linear-gradient(90deg, #00E5FF 0%, #4DE2FF 100%)' }}
                    >
                        {'// STACK'}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full">
                        {techStack.map((tech) => (
                            <div
                                key={tech.name}
                                className="group relative p-8 rounded overflow-hidden hover:-translate-y-2 transition-all duration-500 hover:[border:1px_solid_rgba(0,229,255,0.4)] hover:[box-shadow:0_0_30px_rgba(0,229,255,0.1),0_8px_30px_rgba(0,0,0,0.6)]"
                                style={{
                                    background: 'rgba(4,10,22,0.9)',
                                    border: '1px solid rgba(0,229,255,0.1)',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                }}
                            >
                                <div
                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(0,229,255,0.06) 0%, transparent 60%)',
                                    }}
                                />
                                <div
                                    className="mb-6 group-hover:scale-110 transition-transform duration-500 transform-gpu inline-block"
                                    style={{ color: '#00E5FF', filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.5))' }}
                                >
                                    {tech.icon}
                                </div>
                                <p className="font-mono text-[9px] tracking-[0.2em] text-[#00E5FF]/35 uppercase mb-1">
                                    MODULE
                                </p>
                                <h3 className="text-xl font-bold text-[#C8E8FF] mb-3 tracking-wide">{tech.name}</h3>
                                <p className="text-[#4A7A9B] text-sm leading-relaxed">{tech.description}</p>
                                <div
                                    className="absolute bottom-0 left-0 h-px w-0 group-hover:w-full transition-all duration-500"
                                    style={{ background: 'linear-gradient(90deg, #00E5FF, transparent)' }}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Footer ── */}
                <footer
                    className="w-full pt-16 pb-10 flex flex-col items-center justify-center"
                    style={{ background: '#040913', borderTop: '1px solid rgba(0,229,255,0.18)' }}
                >
                    <p className="font-mono text-[9px] tracking-[0.35em] text-[#66F2FF]/75 uppercase mb-3">SYSTEM</p>
                    <h2 className="text-2xl font-black italic tracking-[0.12em] text-[#E1F3FF]/90 mb-6 uppercase font-mono">
                        {'GT // RACER INSANITY'}
                    </h2>
                    <div className="flex gap-5 mb-10">
                        <a
                            aria-label="Open GT Racer Insanity repository on GitHub"
                            href="https://github.com/ragaeeb/gt-racer-insanity"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="transition-all duration-300"
                            style={{ color: 'rgba(102,242,255,0.82)' }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.color = '#00E5FF';
                                (e.currentTarget as HTMLElement).style.filter =
                                    'drop-shadow(0 0 8px rgba(0,229,255,0.6))';
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.color = 'rgba(102,242,255,0.82)';
                                (e.currentTarget as HTMLElement).style.filter = 'none';
                            }}
                        >
                            <GithubIcon />
                        </a>
                    </div>
                    <p
                        className="font-mono text-[10px] tracking-[0.2em] uppercase text-center"
                        style={{ color: 'rgba(163,206,236,0.9)' }}
                    >
                        <a
                            href={APP_HOMEPAGE}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-[#66F2FF]/60 hover:decoration-[#66F2FF] hover:text-[#E1F3FF]"
                        >
                            {APP_NAME} v{APP_VERSION}
                        </a>
                        &nbsp;·&nbsp;
                        <a
                            href={APP_AUTHOR_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-[#66F2FF]/60 hover:decoration-[#66F2FF] hover:text-[#E1F3FF]"
                        >
                            {APP_AUTHOR_NAME}
                        </a>
                    </p>
                </footer>
            </div>
        </div>
    );
};
