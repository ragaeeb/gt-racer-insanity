export class InputManager {
    public keys: Record<string, boolean> = {};

    constructor() {
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    private onKeyDown = (event: KeyboardEvent) => {
        this.keys[event.code] = true;
    };

    private onKeyUp = (event: KeyboardEvent) => {
        this.keys[event.code] = false;
    };

    public isKeyPressed = (code: string): boolean => {
        return !!this.keys[code];
    };

    public dispose = () => {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    };
}
