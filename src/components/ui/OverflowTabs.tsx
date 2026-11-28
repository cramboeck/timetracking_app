import { useEffect, useLayoutEffect, useRef, useState, type ElementType } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Reiterleiste ohne Scrollen: Es werden so viele Reiter gezeigt, wie in die
 * Zeile passen — der Rest liegt im Menü „Mehr“. Ein aktiver Reiter aus dem
 * Menü rückt sichtbar in die Leiste (ersetzt den letzten sichtbaren).
 */
export interface OverflowTab<T extends string> {
  id: T;
  label: string;
  icon?: ElementType;
  count?: number;
}

interface Props<T extends string> {
  tabs: OverflowTab<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}

const GAP = 4;
const MORE_WIDTH = 96;

export function OverflowTabs<T extends string>({ tabs, active, onChange, className = '' }: Props<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const [fitCount, setFitCount] = useState(tabs.length);
  const [menuOpen, setMenuOpen] = useState(false);

  // Wie viele Reiter passen in die verfügbare Breite?
  const recompute = () => {
    const el = containerRef.current;
    if (!el) return;
    const available = el.clientWidth;
    const widths = tabs.map((_, i) => measureRefs.current[i]?.offsetWidth ?? 0);
    const total = widths.reduce((s, w) => s + w, 0) + GAP * Math.max(0, widths.length - 1);
    if (total <= available) { setFitCount(tabs.length); return; }
    let used = MORE_WIDTH;
    let n = 0;
    for (const w of widths) {
      if (used + w + GAP > available) break;
      used += w + GAP;
      n++;
    }
    setFitCount(Math.max(1, n));
  };

  useLayoutEffect(recompute);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const overflowing = fitCount < tabs.length;
  let visible = tabs.slice(0, fitCount);
  const activeIdx = tabs.findIndex(t => t.id === active);
  if (overflowing && activeIdx >= fitCount) visible = [...tabs.slice(0, fitCount - 1), tabs[activeIdx]];
  const hidden = tabs.filter(t => !visible.includes(t));

  const renderTab = (tab: OverflowTab<T>, isActive: boolean, opts?: { measure?: boolean; index?: number }) => {
    const Icon = tab.icon;
    return (
      <button
        key={tab.id}
        type="button"
        ref={opts?.measure ? el => { measureRefs.current[opts.index ?? 0] = el; } : undefined}
        tabIndex={opts?.measure ? -1 : undefined}
        onClick={opts?.measure ? undefined : () => onChange(tab.id)}
        aria-current={!opts?.measure && isActive ? 'page' : undefined}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
          isActive
            ? 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary'
            : 'text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200'
        }`}
      >
        {Icon && <Icon size={16} />}
        {tab.label}
        {tab.count !== undefined && tab.count > 0 && (
          <span className={`px-1.5 py-0.5 rounded-full text-xs ${
            isActive
              ? 'bg-accent-light dark:bg-accent-primary/40 text-accent-dark dark:text-accent-primary'
              : 'bg-gray-200 dark:bg-dark-300 text-gray-600 dark:text-dark-500'
          }`}>{tab.count}</span>
        )}
      </button>
    );
  };

  return (
    <div className={`relative ${className}`}>
      {/* Unsichtbare Messzeile (alle Reiter in voller Breite) */}
      <div aria-hidden className="absolute left-0 top-0 flex gap-1 invisible pointer-events-none h-0 overflow-hidden">
        {tabs.map((t, i) => renderTab(t, t.id === active, { measure: true, index: i }))}
      </div>

      <div ref={containerRef} className="flex items-center gap-1 min-w-0" role="tablist">
        {visible.map(t => renderTab(t, t.id === active))}
        {overflowing && (
          <div ref={menuRef} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200 whitespace-nowrap"
              data-testid="tabs-more"
            >
              Mehr
              <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-dark-300 text-gray-600 dark:text-dark-500">{hidden.length}</span>
              <ChevronDown size={14} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 mt-1 z-30 min-w-[13rem] rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100 shadow-lg py-1">
                {hidden.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="menuitem"
                      onClick={() => { onChange(t.id); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 dark:text-dark-500 hover:bg-gray-50 dark:hover:bg-dark-200"
                    >
                      {Icon && <Icon size={16} className="text-gray-400" />}
                      <span className="flex-1">{t.label}</span>
                      {t.count !== undefined && t.count > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-dark-300 text-gray-600 dark:text-dark-500">{t.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default OverflowTabs;
