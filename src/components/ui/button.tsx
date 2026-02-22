import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-50',
    {
        defaultVariants: {
            size: 'default',
            variant: 'default',
        },
        variants: {
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 px-3',
            },
            variant: {
                default: 'bg-cyan-400 text-slate-950 hover:bg-cyan-300',
                ghost: 'bg-transparent text-cyan-100 hover:bg-white/10',
            },
        },
    }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = ({ className, size, variant, ...props }: ButtonProps) => {
    return <button className={cn(buttonVariants({ className, size, variant }))} {...props} />;
};
