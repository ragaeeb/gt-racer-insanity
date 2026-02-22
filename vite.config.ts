import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import packageJson from './package.json';

export default defineConfig({
    build: {
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (id.includes('node_modules/react')) return 'react-vendor';
                    if (id.includes('node_modules/socket.io-client')) return 'socket-vendor';
                    if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) {
                        return 'three-vendor';
                    }
                },
            },
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    plugins: [react()],
    server: {
        host: true, // Listen on all local IPs (useful for testing on other devices on WiFi)
        port: 3000,
    },
});
