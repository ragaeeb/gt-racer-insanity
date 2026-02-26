import type React from 'react';
import { LobbyCarPreview } from '@/components/LobbyCarPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VEHICLE_CLASS_MANIFESTS, type VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';

export type LobbyScreenProps = {
    allowTrackSelection: boolean;
    nameInput: string;
    onNameChange: (value: string) => void;
    onSelectColor: (id: string) => void;
    onSelectTrack: (id: string) => void;
    onSelectVehicle: (id: VehicleClassId) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    roomCode: string;
    selectedColorId: string;
    selectedTrackId: string;
    selectedVehicleId: VehicleClassId;
};

export const LobbyScreen = ({
    allowTrackSelection,
    nameInput,
    onNameChange,
    onSelectColor,
    onSelectTrack,
    onSelectVehicle,
    onSubmit,
    roomCode,
    selectedColorId,
    selectedTrackId,
    selectedVehicleId,
}: LobbyScreenProps) => (
    <div className="flex min-h-screen items-center justify-center px-4 relative" style={{ background: '#020408' }}>
        <div className="absolute inset-0 cyber-grid opacity-100 pointer-events-none" />
        <div
            className="absolute inset-0 pointer-events-none"
            style={{
                background: 'radial-gradient(ellipse 70% 70% at 50% 50%, transparent 30%, rgba(2,4,8,0.85) 100%)',
            }}
        />

        <form
            className="w-full max-w-xl space-y-6 p-8 pb-8 backdrop-blur-md rounded relative z-10"
            style={{
                background: 'rgba(2, 8, 20, 0.9)',
                border: '1px solid rgba(0, 229, 255, 0.2)',
                boxShadow:
                    '0 0 40px rgba(0,229,255,0.06), inset 0 0 30px rgba(0,229,255,0.02), 0 20px 60px rgba(0,0,0,0.8)',
            }}
            onSubmit={onSubmit}
        >
            <span
                className="absolute top-0 left-0 w-4 h-4 pointer-events-none"
                style={{ borderTop: '2px solid #00E5FF', borderLeft: '2px solid #00E5FF' }}
            />
            <span
                className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none"
                style={{ borderBottom: '2px solid #00E5FF', borderRight: '2px solid #00E5FF' }}
            />

            <div className="text-center space-y-1">
                <p className="font-mono text-[9px] tracking-[0.3em] text-[#00E5FF]/30 uppercase">
                    ROOM {roomCode || '------'}
                </p>
                <h2
                    className="text-2xl font-black italic tracking-[0.12em] text-transparent bg-clip-text uppercase"
                    style={{ backgroundImage: 'linear-gradient(90deg, #00E5FF 0%, #4DE2FF 100%)' }}
                >
                    {'// PILOT CONFIG'}
                </h2>
            </div>

            <div className="space-y-1.5">
                <label
                    htmlFor="player-name-input"
                    className="font-mono text-[9px] tracking-[0.2em] text-[#00E5FF]/40 uppercase block"
                >
                    CALLSIGN
                </label>
                <Input
                    autoFocus
                    id="player-name-input"
                    maxLength={24}
                    onChange={(event) => onNameChange(event.target.value)}
                    placeholder="ENTER CALLSIGN"
                    value={nameInput}
                    className="h-12 text-base font-mono tracking-widest text-center uppercase rounded-none"
                    style={{
                        background: 'rgba(0,8,20,0.8)',
                        border: '1px solid rgba(0,229,255,0.25)',
                        color: '#00E5FF',
                    }}
                />
            </div>

            <fieldset className="space-y-2 border-none p-0 m-0">
                <legend className="font-mono text-[9px] tracking-[0.2em] text-[#00E5FF]/40 uppercase mb-2 block">
                    VEHICLE CLASS
                </legend>
                <div className="grid grid-cols-2 gap-2">
                    {VEHICLE_CLASS_MANIFESTS.map((vehicle) => {
                        const isSelected = selectedVehicleId === vehicle.id;
                        return (
                            <button
                                key={vehicle.id}
                                type="button"
                                onClick={() => onSelectVehicle(vehicle.id)}
                                className="py-3 px-2 font-mono text-xs uppercase tracking-wider transition-all"
                                style={{
                                    background: isSelected ? 'rgba(0,229,255,0.12)' : 'rgba(0,0,0,0.3)',
                                    border: isSelected
                                        ? '1px solid rgba(0,229,255,0.6)'
                                        : '1px solid rgba(0,229,255,0.12)',
                                    color: isSelected ? '#00E5FF' : 'rgba(0,229,255,0.4)',
                                    boxShadow: isSelected ? '0 0 12px rgba(0,229,255,0.15)' : 'none',
                                }}
                            >
                                <div className="flex flex-col items-center gap-0.5">
                                    <span className="font-bold">{vehicle.label}</span>
                                    <span className="text-[9px] tracking-wide opacity-70">
                                        {Math.round(vehicle.physics.maxForwardSpeed * 3.6)} KM/H
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <div className="mt-10">
                <LobbyCarPreview
                    onSelectColor={onSelectColor}
                    allowTrackSelection={allowTrackSelection}
                    selectedVehicleId={selectedVehicleId}
                    selectedColorId={selectedColorId}
                    selectedTrackId={selectedTrackId}
                    onSelectTrack={onSelectTrack}
                />
            </div>

            <Button
                id="player-name-confirm"
                type="submit"
                className="w-full h-14 font-black uppercase tracking-[0.2em] rounded-none"
                style={{
                    background: 'linear-gradient(135deg, #00E5FF 0%, #0099CC 100%)',
                    color: '#020810',
                    boxShadow: '0 0 25px rgba(0,229,255,0.4)',
                    fontFamily: 'monospace',
                    fontSize: '1rem',
                }}
            >
                ENGAGE
            </Button>
        </form>
    </div>
);
