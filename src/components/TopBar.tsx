import { useEffect, useState } from 'react';
import { Bookmark, BookOpen, Database, FileText, Menu, Search, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export type WorkspaceTab = 'search' | 'browse' | 'bookmarks' | 'sources';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  bookmarkCount: number;
  onOpenSourcesPdf: () => void;
}

export function TopBar({ activeTab, onTabChange, bookmarkCount, onOpenSourcesPdf }: TopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: typeof Search; count?: number }> = [
    { id: 'search', label: 'Buscador', icon: Search },
    { id: 'browse', label: 'Índice Normativo', icon: BookOpen },
    { id: 'bookmarks', label: 'Citas Guardadas', icon: Bookmark, count: bookmarkCount },
    { id: 'sources', label: 'Acervo Documental', icon: Database },
  ];

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const handleSelectMobileTab = (tab: WorkspaceTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
          {/* Left Zone: Mobile & Tablet Lateral Menu Button + Brand Wordmark */}
          <div className="flex min-w-0 items-center gap-1.5 lg:gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="-ml-2 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:outline-none lg:hidden"
              aria-label="Abrir menú lateral"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-sidebar-menu"
            >
              <Menu className="h-5 w-5" strokeWidth={1.9} />
            </button>

            <button
              type="button"
              onClick={() => onTabChange('search')}
              className="flex min-w-0 items-baseline gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 rounded"
            >
              <span className="truncate font-serif text-base font-semibold tracking-tight text-stone-900 sm:text-lg whitespace-nowrap">
                Normativa IMSS–SNTSS
              </span>
              <span className="hidden text-xs font-medium tracking-wide text-stone-400 xl:inline whitespace-nowrap">
                CCT 2025–2027 · Estatutos
              </span>
            </button>
          </div>

          {/* Center Zone: Desktop Navigation */}
          <nav aria-label="Navegación principal" className="hidden h-full items-center gap-5 xl:gap-6 lg:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`relative flex h-full items-center gap-1.5 px-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'text-emerald-900'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {typeof item.count === 'number' && item.count > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-emerald-900">
                      ({item.count})
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-emerald-900" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Zone: Primary Contextual PDF Action */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={onOpenSourcesPdf}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 whitespace-nowrap shrink-0 transition-colors hover:border-stone-400 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:outline-none"
            >
              <FileText className="h-3.5 w-3.5 text-emerald-900" strokeWidth={1.8} />
              <span>Visor PDF</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Slide-Over Lateral Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú de navegación">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-stone-950/50 backdrop-blur-[1px]"
              aria-hidden="true"
            />

            <motion.aside
              id="mobile-sidebar-menu"
              initial={{ x: shouldReduceMotion ? 0 : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: shouldReduceMotion ? 0 : '-100%' }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
              }
              className="fixed inset-y-0 left-0 flex w-[288px] max-w-[84vw] flex-col border-r border-stone-200 bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-serif text-base font-semibold tracking-tight text-stone-900">
                    Normativa IMSS–SNTSS
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    CCT 2025–2027 · Estatutos
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="-mr-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:outline-none"
                  aria-label="Cerrar menú lateral"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav aria-label="Secciones de la aplicación" className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
                <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Secciones
                </p>
                <div className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectMobileTab(item.id)}
                        className={`flex min-h-[48px] w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'border border-emerald-900/15 bg-emerald-50/80 text-emerald-950 font-semibold'
                            : 'border border-transparent text-stone-700 hover:bg-stone-100 hover:text-stone-900'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              isActive ? 'text-emerald-900' : 'text-stone-400'
                            }`}
                            strokeWidth={1.8}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {typeof item.count === 'number' && item.count > 0 && (
                          <span className="shrink-0 font-mono text-xs tabular-nums text-emerald-900">
                            {item.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </nav>

              <div className="border-t border-stone-200 p-4">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenSourcesPdf();
                  }}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-emerald-900 px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap transition-colors hover:bg-emerald-950 focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:outline-none"
                >
                  <FileText className="h-4 w-4" strokeWidth={1.8} />
                  <span>Abrir Visor PDF</span>
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

