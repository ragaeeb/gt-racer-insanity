export class InputManager {
    public keys: Record<string, boolean> = {};
    private cruiseControlEnabled = true;

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

    public setCruiseControlEnabled = (enabled: boolean) => {
        this.cruiseControlEnabled = enabled;
    };

    public isCruiseControlEnabled = () => {
        return this.cruiseControlEnabled;
    };

    public isPrecisionOverrideActive = () => {
        return this.isKeyPressed('ShiftLeft') || this.isKeyPressed('ShiftRight');
    };

    public dispose = () => {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    };
}
