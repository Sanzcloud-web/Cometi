import * as React from 'react';
import { cx } from '../../utils/cx';

type BaseProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
type Variant = 'default' | 'plain';

type TextareaProps = BaseProps & {
  variant?: Variant;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const baseDefault =
      'min-h-[3rem] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60';
    const basePlain =
      'min-h-[2.75rem] w-full resize-none bg-transparent text-[0.95rem] text-slate-900 placeholder:text-slate-400 outline-none focus-visible:outline-none focus-visible:ring-0 border-none shadow-none px-0 py-0 disabled:cursor-not-allowed disabled:opacity-60';

    return (
      <textarea ref={ref} className={cx(variant === 'plain' ? basePlain : baseDefault, className)} {...props} />
    );
  }
);

Textarea.displayName = 'Textarea';
