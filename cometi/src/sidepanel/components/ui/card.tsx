import type { PropsWithChildren, HTMLAttributes } from 'react';
import { cx } from '../../utils/cx';

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, children, ...props }: PropsWithChildren<CardProps>): JSX.Element {
  return (
    <div
      className={cx('rounded-xl border border-slate-200 p-4 shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  );
}
