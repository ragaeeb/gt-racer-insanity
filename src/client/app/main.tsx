import { createRoot } from 'react-dom/client';
import { App } from '@/client/app/App';
import '@/client/app/style.css';

const appRoot = document.getElementById('app');

if (!appRoot) {
    throw new Error('Missing #app root element');
}

createRoot(appRoot).render(<App />);
