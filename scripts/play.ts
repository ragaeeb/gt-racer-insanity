import { networkInterfaces } from 'node:os';

type SpawnedProcess = ReturnType<typeof Bun.spawn>;

const DEFAULT_CLIENT_PORT = 3000;
const DEFAULT_SERVER_PORT = 3001;

const toPort = (value: string | undefined, fallback: number) => {
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.floor(parsed);
};

const getLanIpv4Addresses = (): string[] => {
    const nets = networkInterfaces();
    const addresses = new Set<string>();

    for (const entries of Object.values(nets)) {
        for (const entry of entries ?? []) {
            const isIPv4 = entry.family === 'IPv4' || entry.family === 4;
            if (!isIPv4 || entry.internal) {
                continue;
            }
            addresses.add(entry.address);
        }
    }

    return [...addresses].sort();
};

const exitWithError = (message: string, code = 1) => {
    console.error(`[play] ${message}`);
    process.exit(code);
};

const runBuild = () => {
    console.log('[play] Building production client...');
    const result = Bun.spawnSync({
        cmd: ['bun', 'run', 'build'],
        cwd: process.cwd(),
        env: Bun.env,
        stderr: 'inherit',
        stdout: 'inherit',
        stdin: 'inherit',
    });
    if (result.exitCode !== 0) {
        exitWithError(`Build failed (exit ${result.exitCode}).`, result.exitCode ?? 1);
    }
};

const startProcess = (cmd: string[], env: Record<string, string>): SpawnedProcess => {
    return Bun.spawn({
        cmd,
        cwd: process.cwd(),
        env,
        stderr: 'inherit',
        stdout: 'inherit',
        stdin: 'inherit',
    });
};

const main = async () => {
    if (Bun.argv.includes('--help') || Bun.argv.includes('-h')) {
        console.log(`Usage: bun run play

Env options:
  PLAY_CLIENT_PORT   Preview web port (default: ${DEFAULT_CLIENT_PORT})
  PLAY_SERVER_PORT   Game server port (default: ${DEFAULT_SERVER_PORT})
`);
        process.exit(0);
    }

    const clientPort = toPort(Bun.env.PLAY_CLIENT_PORT, DEFAULT_CLIENT_PORT);
    const serverPort = toPort(Bun.env.PLAY_SERVER_PORT, DEFAULT_SERVER_PORT);
    const lanIps = getLanIpv4Addresses();
    const shareTargets = lanIps.length > 0 ? lanIps : ['127.0.0.1'];
    const allowedOrigins = new Set<string>([
        `http://localhost:${clientPort}`,
        `http://127.0.0.1:${clientPort}`,
    ]);
    for (const ip of shareTargets) {
        allowedOrigins.add(`http://${ip}:${clientPort}`);
    }
    const env = {
        ...Bun.env,
        ALLOWED_ORIGINS: [...allowedOrigins].join(','),
        NODE_ENV: 'production',
        SERVER_PORT: String(serverPort),
    };

    runBuild();

    console.log(`[play] Starting server on :${serverPort} and preview on :${clientPort}...`);
    const server = startProcess(['bun', 'src/server/index.ts'], env);
    const preview = startProcess(
        ['bunx', 'vite', 'preview', '--host', '0.0.0.0', '--port', String(clientPort), '--strictPort'],
        env,
    );

    const children: SpawnedProcess[] = [server, preview];
    let shuttingDown = false;
    const shutdown = (reason: string) => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        console.log(`[play] Shutting down (${reason})...`);
        for (const child of children) {
            child.kill();
        }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    console.log('\n[play] Share this URL on your Wi-Fi network:');
    for (const ip of shareTargets) {
        console.log(`  http://${ip}:${clientPort}`);
    }
    console.log(`[play] Server health: http://${shareTargets[0]}:${serverPort}/health\n`);

    const [serverExitCode, previewExitCode] = await Promise.all([server.exited, preview.exited]);
    shutdown('child-exit');

    if ((serverExitCode ?? 0) !== 0) {
        exitWithError(`Server exited with code ${serverExitCode}.`, serverExitCode ?? 1);
    }
    if ((previewExitCode ?? 0) !== 0) {
        exitWithError(`Preview exited with code ${previewExitCode}.`, previewExitCode ?? 1);
    }
};

await main();
