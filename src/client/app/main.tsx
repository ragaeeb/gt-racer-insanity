import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const appRoot = document.getElementById('app');

if (!appRoot) {
    throw new Error('Missing #app root element');
}

createRoot(appRoot).render(<App />);
