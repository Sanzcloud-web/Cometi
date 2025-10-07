import { useEffect, useRef } from 'react';
import { cx } from '../utils/cx';

export type SlashCommand = {
  id: string;
  label: string;
  value: string; // the text that will be inserted in the composer
  description?: string;
};

type SlashCommandMenuProps = {
  open: boolean;
  items: SlashCommand[];
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  anchor?: HTMLElement | null;
  onClose: () => void;
  onSelect: (cmd: SlashCommand) => void;
};

export function SlashCommandMenu({ open, items, activeIndex, onActiveIndexChange, anchor, onClose, onSelect }: SlashCommandMenuProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onActiveIndexChange(0);
  }, [open, onActiveIndexChange]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (index: number) => {
    const item = items[index];
    if (item) onSelect(item);
  };

  // Basic positioning: default to above-left of anchor or parent
  const style: React.CSSProperties | undefined = (() => {
    if (!anchor) return undefined;
    const rect = anchor.getBoundingClientRect();
    // The menu will be absolutely positioned via fixed to align with the anchor's left
    return {
      position: 'fixed',
      left: rect.left,
      top: rect.top,
      transform: 'translateY(calc(-100% - 8px))',
      zIndex: 50,
      width: Math.min(360, Math.max(260, rect.width))
    } as React.CSSProperties;
  })();

  return (
    <div
      ref={containerRef}
      style={style}
      className={cx(
        'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl',
        'focus:outline-none'
      )}
      role="menu"
      aria-label="Commandes"
    >
      <div className="max-h-64 overflow-auto p-1">
        {items.length === 0 ? (
          <div className="px-3 py-2 text-sm text-slate-500">Aucune commande</div>
        ) : (
          items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => onActiveIndexChange(index)}
              onClick={() => handleSelect(index)}
              className={cx(
                'w-full cursor-default rounded-md px-3 py-2 text-left',
                index === activeIndex ? 'bg-slate-100' : 'bg-transparent',
                'focus:outline-none'
              )}
              role="menuitem"
              aria-selected={index === activeIndex}
            >
              <div className="text-sm font-medium text-slate-900">{item.label}</div>
              {item.description ? (
                <div className="mt-0.5 text-xs text-slate-500">{item.description}</div>
              ) : null}
            </button>
          ))
        )}
      </div>
      {/* Keyboard navigation handler area - invisible but focusable if needed */}
      <div className="sr-only" aria-hidden>
        Navigation: ↑ ↓ pour sélectionner, Entrée pour valider, Échap pour fermer
      </div>
      {/* Expose simple API to control navigation via custom key handling on the input */}
      <input
        // hidden helper to enable scrolling into view on active change when needed in future
        className="hidden"
        aria-hidden
        tabIndex={-1}
        value=""
        readOnly
      />
    </div>
  );
}

export function useSlashMenuKeyboard(
  opts: {
    open: boolean;
    itemCount: number;
    activeIndex: number;
    setActiveIndex: (i: number) => void;
    onSelectIndex: (i: number) => void;
    onClose: () => void;
  }
) {
  const { open, itemCount, activeIndex, setActiveIndex, onSelectIndex, onClose } = opts;
  return function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return false;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((activeIndex + 1) % Math.max(1, itemCount));
        return true;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((activeIndex - 1 + Math.max(1, itemCount)) % Math.max(1, itemCount));
        return true;
      case 'Tab':
        e.preventDefault();
        onSelectIndex(activeIndex);
        return true;
      case 'Enter':
        e.preventDefault();
        onSelectIndex(activeIndex);
        return true;
      case 'Escape':
        e.preventDefault();
        onClose();
        return true;
    }
    return false;
  };
}
