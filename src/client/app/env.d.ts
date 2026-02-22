declare const __APP_VERSION__: string;

interface ImportMetaEnv {
    readonly VITE_SERVER_URL?: string;
    readonly VITE_NETWORK_TICK_RATE_HZ?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
