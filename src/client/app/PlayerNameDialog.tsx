import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type PlayerNameDialogProps = {
    isOpen: boolean;
    initialValue: string;
    onConfirm: (playerName: string) => void;
};

const sanitizePlayerName = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return 'Player';
    }
    return trimmed.slice(0, 24);
};

export const PlayerNameDialog = ({ isOpen, initialValue, onConfirm }: PlayerNameDialogProps) => {
    const [playerName, setPlayerName] = useState(initialValue);

    useEffect(() => {
        setPlayerName(initialValue);
    }, [initialValue]);

    if (!isOpen) {
        return null;
    }

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onConfirm(sanitizePlayerName(playerName));
    };

    return (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
            <form
                aria-label="Player name prompt"
                className="w-full max-w-md rounded-xl border border-cyan-200/20 bg-slate-900/95 p-6 text-cyan-50 shadow-2xl shadow-cyan-900/40 backdrop-blur"
                onSubmit={onSubmit}
            >
                <h2 className="text-2xl font-bold tracking-wide text-cyan-100">Choose Your Name</h2>
                <p className="mt-2 text-sm text-cyan-100/70">This name appears above your car in multiplayer.</p>
                <div className="mt-5">
                    <Input
                        autoFocus
                        id="player-name-input"
                        maxLength={24}
                        onChange={(event) => setPlayerName(event.target.value)}
                        placeholder="Player"
                        value={playerName}
                    />
                </div>
                <div className="mt-5 flex justify-end">
                    <Button id="player-name-confirm" type="submit">
                        Join Race
                    </Button>
                </div>
            </form>
        </div>
    );
};
