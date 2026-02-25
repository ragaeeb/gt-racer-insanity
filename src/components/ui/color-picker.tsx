import { forwardRef, useEffect, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { cn } from '@/lib/utils';
import type { ButtonProps } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isHexColorString } from '@/client/game/vehicleSelections';

type ColorPickerProps = {
    onBlur?: () => void;
    onChange: (value: string) => void;
    value: string;
};

export const ColorPicker = forwardRef<
    HTMLInputElement,
    Omit<ButtonProps, 'onBlur' | 'onChange' | 'value'> & ColorPickerProps
>(({ className, disabled, onBlur, onChange, size, value, ...props }, ref) => {
    const [open, setOpen] = useState(false);
    const parsedValue = value || '#ffffff';
    const [draftValue, setDraftValue] = useState(() => value || '#ffffff');

    useEffect(() => {
        setDraftValue(parsedValue);
    }, [parsedValue]);

    return (
        <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild disabled={disabled} onBlur={onBlur}>
                <Button
                    {...props}
                    className={cn('w-full justify-start border border-cyan-200/30 text-cyan-50', className)}
                    onClick={() => setOpen(true)}
                    size={size}
                    style={{ backgroundColor: parsedValue }}
                    type="button"
                    variant="ghost"
                >
                    <span className="font-mono text-xs uppercase tracking-wider text-white drop-shadow-[0_0_4px_rgba(0,0,0,0.75)]">
                        {parsedValue}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px]">
                <HexColorPicker
                    color={parsedValue}
                    onChange={(next) => {
                        setDraftValue(next);
                        onChange(next.toUpperCase());
                    }}
                />
                <Input
                    className="mt-3 font-mono uppercase"
                    maxLength={7}
                    onChange={(event) => {
                        const next = event.currentTarget.value.toUpperCase();
                        setDraftValue(next);
                        if (isHexColorString(next)) {
                            onChange(next);
                        }
                    }}
                    ref={ref}
                    value={draftValue}
                />
            </PopoverContent>
        </Popover>
    );
});

ColorPicker.displayName = 'ColorPicker';
