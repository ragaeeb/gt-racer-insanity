import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = ({
    align = 'center',
    className,
    sideOffset = 4,
    ...props
}: PopoverPrimitive.PopoverContentProps) => {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
                align={align}
                className={cn(
                    'z-50 w-72 rounded-md border border-cyan-200/20 bg-slate-950/95 p-3 text-cyan-50 shadow-xl outline-none',
                    className,
                )}
                sideOffset={sideOffset}
                {...props}
            />
        </PopoverPrimitive.Portal>
    );
};

export { Popover, PopoverContent, PopoverTrigger };
