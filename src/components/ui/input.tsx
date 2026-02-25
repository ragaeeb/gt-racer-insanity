import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
    return (
        <input
            ref={ref}
            className={cn(
                'flex h-11 w-full rounded-md border border-cyan-100/20 bg-slate-900/80 px-3 py-2 text-base text-cyan-50 shadow-sm outline-none placeholder:text-cyan-100/35 focus-visible:border-cyan-200/60 focus-visible:ring-2 focus-visible:ring-cyan-300/40',
                className
            )}
            {...props}
        />
    );
});

Input.displayName = 'Input';
