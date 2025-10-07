import type { PropsWithChildren, HTMLAttributes } from 'react';
import { cx } from '../../utils/cx';

type ScrollAreaProps = HTMLAttributes<HTMLDivElement>;

export function ScrollArea({ className, children, ...props }: PropsWithChildren<ScrollAreaProps>): JSX.Element {
  return (
    <div className={cx('relative overflow-hidden', className)} {...props}>
      <div className="h-full w-full overflow-y-auto pr-2">
        {children}
      </div>
    </div>
  );
}
