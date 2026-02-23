declare const __APP_VERSION__: string;

interface ImportMetaEnv {
    readonly VITE_INPUT_FRAME_RATE_HZ?: string;
    readonly VITE_INTERPOLATION_DELAY_MS?: string;
    readonly VITE_RECONCILE_POSITION_THRESHOLD?: string;
    readonly VITE_RECONCILE_YAW_THRESHOLD?: string;
    readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
