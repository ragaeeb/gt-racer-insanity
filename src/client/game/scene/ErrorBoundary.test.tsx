import { describe, expect, it } from 'bun:test';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
    it('should set hasError to true from getDerivedStateFromError', () => {
        const state = ErrorBoundary.getDerivedStateFromError(new Error('Test error'));
        expect(state.hasError).toBeTrue();
    });

    it('should initialize with hasError = false', () => {
        // Test the constructor logic by instantiating directly
        const boundary = new ErrorBoundary({ children: null });
        expect((boundary as any).state.hasError).toBeFalse();
    });

    it('should render null when hasError is true', () => {
        const boundary = new ErrorBoundary({ children: 'child content' });
        (boundary as any).state = { hasError: true };
        const rendered = boundary.render();
        expect(rendered).toBeNull();
    });

    it('should render children when hasError is false', () => {
        const boundary = new ErrorBoundary({ children: 'child content' });
        (boundary as any).state = { hasError: false };
        const rendered = boundary.render();
        expect(rendered).toBe('child content');
    });

    it('should log error in componentDidCatch without throwing', () => {
        const boundary = new ErrorBoundary({ children: null });
        const errors: unknown[] = [];
        const origError = console.error;
        console.error = (...args: unknown[]) => {
            errors.push(args[0]);
        };

        expect(() => {
            boundary.componentDidCatch(new Error('Render error'), { componentStack: '' } as any);
        }).not.toThrow();

        expect(errors.length).toBeGreaterThan(0);
        console.error = origError;
    });
});
