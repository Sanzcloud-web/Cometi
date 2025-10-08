import type { ChatSummary } from '../services/historyClient';
import { Button } from './ui/button';

type Props = {
  isOpen: boolean;
  chats: ChatSummary[];
  onSelect: (chatId: string) => void;
  onClose: () => void;
};

export function HistorySidebar({ isOpen, chats, onSelect, onClose }: Props): JSX.Element {
  return (
    <div className={`transition-all duration-200 ${isOpen ? 'w-64' : 'w-0'} overflow-hidden bg-[#FCFCF9] rounded-xl`}> 
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 ">
          <div className="text-sm font-medium opacity-80">Historique</div>
          <Button variant="ghost" onClick={onClose} className="h-7 px-2 text-xs">Fermer</Button>
        </div>
        <div className="flex-1 overflow-auto">
          {chats.length === 0 ? (
            <div className="px-3 py-3 text-xs opacity-60">Aucun chat enregistré.</div>
          ) : (
            <ul className="py-1">
              {chats.map((c) => (
                <li key={c.id}>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40"
                    onClick={() => onSelect(c.id)}
                    title={c.title ?? ''}
                  >
                    <div className="text-sm truncate">{c.title || 'Sans titre'}</div>
                    {(() => {
                      const p = (c.lastMessagePreview ?? '').trim();
                      const isSentinel = /^<\s*(NO_PAGE_CONTEXT|USE_PAGE_CONTEXT)\s*\/>$/i.test(p);
                      return !isSentinel && p.length > 0 ? (
                        <div className="text-[11px] opacity-60 truncate">{p}</div>
                      ) : null;
                    })()}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
