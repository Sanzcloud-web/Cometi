import * as React from 'react';
import { cx } from '../../utils/cx';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, variant = 'default', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60';
    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      default: 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900',
      ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-200',
    };

    return (
      <button ref={ref} className={cx(base, variants[variant], className)} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
