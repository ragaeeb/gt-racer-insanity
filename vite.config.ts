import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import packageJson from './package.json';

const packageAuthor =
    typeof packageJson.author === 'string'
        ? { name: packageJson.author, url: packageJson.homepage ?? '' }
        : (packageJson.author ?? { name: '', url: '' });

export default defineConfig({
    build: {
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (id.includes('node_modules/react')) {
                        return 'react-vendor';
                    }
                    if (id.includes('node_modules/socket.io-client')) {
                        return 'socket-vendor';
                    }
                    if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) {
                        return 'three-vendor';
                    }
                },
            },
        },
    },
    define: {
        __APP_AUTHOR_NAME__: JSON.stringify(packageAuthor.name ?? ''),
        __APP_AUTHOR_URL__: JSON.stringify(packageAuthor.url ?? ''),
        __APP_HOMEPAGE__: JSON.stringify(packageJson.homepage ?? ''),
        __APP_NAME__: JSON.stringify(packageJson.name ?? ''),
        __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    plugins: [
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        host: true, // Listen on all local IPs (useful for testing on other devices on WiFi)
        port: 3000,
    },
});
