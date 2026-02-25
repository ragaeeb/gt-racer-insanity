import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

import { forwardRef } from 'react';

const PopoverContent = forwardRef<
    React.ElementRef<typeof PopoverPrimitive.Content>,
    PopoverPrimitive.PopoverContentProps
>(({ align = 'center', className, sideOffset = 4, ...props }, ref) => (
    <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
            ref={ref}
            align={align}
            className={cn(
                'z-50 w-72 rounded-md border border-cyan-200/20 bg-slate-950/95 p-3 text-cyan-50 shadow-xl outline-none',
                className,
            )}
            sideOffset={sideOffset}
            {...props}
        />
    </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverContent, PopoverTrigger };
