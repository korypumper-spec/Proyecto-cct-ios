import { useEffect, useMemo, useState } from 'react';
import { Filter, RotateCcw, Search, Sparkles } from 'lucide-react';
import type {
  FilterOptionsResponse,
  SavedCitation,
  SearchResponse,
  SearchResultItem,
} from '../types';
import { searchNormativaClient } from '../services/normativaClient';
import { EntryReaderPane } from './EntryReaderPane';

interface SearchWorkspaceProps {
  filters: FilterOptionsResponse | null;
  isBookmarked: (entryId: number, subsectionLabel: string | null) => boolean;
  onToggleBookmark: (citation: SavedCitation) => void;
  onOpenPdf: (args: {
    title: string;
    subtitle: string;
    pdfPath: string;
    pagePdf: number;
    pagePrinted: number;
  }) => void;
}

const SUGGESTED_QUERIES = [
  'Vacaciones',
  'Guarderías',
  'Fondo de retiro',
  'Comisión de Honor y Justicia',
  'Permutas',
  'Cambio de rama',
  'Tiempo extraordinario',
  'Cláusula 47',
];

export function SearchWorkspace({
  filters,
  isBookmarked,
  onToggleBookmark,
  onOpenPdf,
}: SearchWorkspaceProps) {
  const [queryInput, setQueryInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [docFilter, setDocFilter] = useState('');
  const [regFilter, setRegFilter] = useState('');
  const [secFilter, setSecFilter] = useState('');
  const [artFilter, setArtFilter] = useState('');
  const [sortMode, setSortMode] = useState<'relevance' | 'order'>('relevance');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const availableRegulations = useMemo(() => {
    if (!filters) return [];
    return filters.regulations.filter((r) => !docFilter || r.documentId === docFilter);
  }, [filters, docFilter]);

  const availableSections = useMemo(() => {
    if (!filters) return [];
    return filters.sections.filter(
      (s) =>
        (!docFilter || s.documentId === docFilter) &&
        (!regFilter || s.regulation === regFilter),
    );
  }, [filters, docFilter, regFilter]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    searchNormativaClient(
      {
        q: submittedQuery.trim() || undefined,
        doc: docFilter || undefined,
        regulation: regFilter || undefined,
        section: secFilter || undefined,
        article: artFilter.trim() || undefined,
        sort: sortMode,
        limit: 40,
      },
      controller.signal,
    )
      .then((json: SearchResponse) => {
        setData(json);
        setLoading(false);
        if (json.results.length > 0) {
          setSelectedEntryId(json.results[0].entryId);
          setSelectedSubId(json.results[0].primarySubsection?.id ?? null);
        } else {
          setSelectedEntryId(null);
          setSelectedSubId(null);
        }
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setError('No se pudo completar la consulta.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [submittedQuery, docFilter, regFilter, secFilter, artFilter, sortMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(queryInput);
  };

  const handleQuickQuery = (term: string) => {
    setQueryInput(term);
    setSubmittedQuery(term);
  };

  const handleReset = () => {
    setQueryInput('');
    setSubmittedQuery('');
    setDocFilter('');
    setRegFilter('');
    setSecFilter('');
    setArtFilter('');
    setSortMode('relevance');
  };

  const handleSelectResult = (item: SearchResultItem) => {
    setSelectedEntryId(item.entryId);
    setSelectedSubId(item.primarySubsection?.id ?? null);
    setMobileDetailOpen(true);
  };

  const highlightTerms = useMemo(() => {
    const clean = submittedQuery
      .replace(/"([^"]+)"/g, '$1')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2);
    return clean;
  }, [submittedQuery]);

  const hasActiveFilters = Boolean(
    submittedQuery || docFilter || regFilter || secFilter || artFilter,
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      {/* Search Header & Query Form */}
      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-stone-900">
              Buscador Normativo por Artículo, Sección, Página y Subsección
            </h1>
            <p className="mt-1 text-justify text-sm text-stone-600 hyphens-auto lg:text-left">
              Consulta el Contrato Colectivo de Trabajo 2025–2027 (incluidos sus 27 reglamentos, tabulador y profesiogramas) y los Estatutos del SNTSS.
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder='Ej. vacaciones, "fondo de retiro", Comisión de Honor y Justicia, Cláusula 47, guarderías...'
              className="h-11 w-full rounded-md border border-stone-300 bg-white pr-4 pl-10 text-base text-stone-900 placeholder:text-stone-400 focus:border-emerald-900 focus:ring-1 focus:ring-emerald-900 focus:outline-none lg:text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="h-11 rounded-md bg-emerald-900 px-5 text-sm font-medium text-white whitespace-nowrap transition-colors hover:bg-emerald-950"
            >
              Buscar citas
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className={`inline-flex h-11 items-center gap-1.5 rounded-md border px-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
                showAdvanced || docFilter || regFilter || secFilter || artFilter
                  ? 'border-emerald-900 bg-emerald-50/50 text-emerald-950'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filtros</span>
            </button>
          </div>
        </form>

        {/* Quick Topic Links (Zero-Pill inline text style) */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1 font-medium text-stone-700">
            <Sparkles className="h-3 w-3 text-emerald-800" />
            Consultas frecuentes:
          </span>
          {SUGGESTED_QUERIES.map((term, idx) => (
            <span key={term} className="inline-flex items-center gap-3">
              {idx > 0 && <span className="text-stone-300">·</span>}
              <button
                type="button"
                onClick={() => handleQuickQuery(term)}
                className="underline decoration-stone-300 underline-offset-4 transition-colors hover:text-emerald-900 hover:decoration-emerald-900"
              >
                {term}
              </button>
            </span>
          ))}
        </div>

        {/* Structured Filters */}
        {(showAdvanced || docFilter || regFilter || secFilter || artFilter) && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Documento
              </label>
              <select
                value={docFilter}
                onChange={(e) => {
                  setDocFilter(e.target.value);
                  setRegFilter('');
                  setSecFilter('');
                }}
                className="h-10 w-full rounded-md border border-stone-300 bg-white px-2.5 text-base text-stone-800 focus:border-emerald-900 focus:outline-none lg:h-9 lg:text-xs"
              >
                <option value="">Todos los documentos</option>
                {filters?.documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.shortName} ({d.count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Reglamento / Instrumento
              </label>
              <select
                value={regFilter}
                onChange={(e) => {
                  setRegFilter(e.target.value);
                  setSecFilter('');
                }}
                className="h-10 w-full rounded-md border border-stone-300 bg-white px-2.5 text-base text-stone-800 focus:border-emerald-900 focus:outline-none lg:h-9 lg:text-xs"
              >
                <option value="">Todos los reglamentos</option>
                {availableRegulations.map((r) => (
                  <option key={`${r.documentId}-${r.regulation}`} value={r.regulation}>
                    {r.regulation} ({r.count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Sección / Capítulo
              </label>
              <select
                value={secFilter}
                onChange={(e) => setSecFilter(e.target.value)}
                className="h-10 w-full rounded-md border border-stone-300 bg-white px-2.5 text-base text-stone-800 focus:border-emerald-900 focus:outline-none lg:h-9 lg:text-xs"
              >
                <option value="">Todas las secciones</option>
                {availableSections.map((s) => (
                  <option
                    key={`${s.documentId}-${s.regulation}-${s.section}`}
                    value={s.section}
                  >
                    {s.section} ({s.count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Artículo / Cláusula
              </label>
              <input
                type="text"
                value={artFilter}
                onChange={(e) => setArtFilter(e.target.value)}
                placeholder="Ej. 47, 141 Bis, Transitoria"
                className="h-10 w-full rounded-md border border-stone-300 bg-white px-2.5 text-base text-stone-800 placeholder:text-stone-400 focus:border-emerald-900 focus:outline-none lg:h-9 lg:text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Ordenar por
              </label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value === 'order' ? 'order' : 'relevance')}
                className="h-10 w-full rounded-md border border-stone-300 bg-white px-2.5 text-base text-stone-800 focus:border-emerald-900 focus:outline-none lg:h-9 lg:text-xs"
              >
                <option value="relevance">Relevancia de coincidencia</option>
                <option value="order">Orden del documento</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Results Summary Strip */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-stone-600">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {loading ? (
            <span>Consultando base de datos documental…</span>
          ) : data ? (
            <>
              <span className="font-semibold text-stone-900 tabular-nums">
                {data.total} {data.total === 1 ? 'disposición encontrada' : 'disposiciones encontradas'}
              </span>
              {submittedQuery && (
                <span>
                  para <strong className="font-medium text-stone-900">“{submittedQuery}”</strong>
                </span>
              )}
              {data.facets.documents.length > 0 && (
                <span className="text-stone-400">
                  ·{' '}
                  {data.facets.documents
                    .map((df) => `${df.label ?? df.value} (${df.count})`)
                    .join(' · ')}
                </span>
              )}
            </>
          ) : null}
        </div>
        {data && data.total > data.results.length && (
          <span className="font-mono tabular-nums text-stone-500">
            Mostrando primeros {data.results.length} de {data.total}
          </span>
        )}
      </div>

      {/* Main Split Workspace */}
      <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        {/* Left Results Column */}
        <div className="space-y-2.5 lg:col-span-7">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-justify text-sm text-red-900 hyphens-auto lg:text-left">
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="rounded-lg border border-stone-200 bg-white p-4 animate-pulse space-y-2">
                  <div className="h-4 w-1/3 rounded bg-stone-200" />
                  <div className="h-3 w-2/3 rounded bg-stone-100" />
                  <div className="h-10 w-full rounded bg-stone-100" />
                </div>
              ))}
            </div>
          )}

          {!loading && data && data.results.length === 0 && (
            <div className="rounded-lg border border-stone-200 bg-white p-8 text-center">
              <p className="font-serif text-lg font-medium text-stone-900">
                No se encontraron disposiciones para esta consulta
              </p>
              <p className="mt-1.5 text-justify text-sm text-stone-600 hyphens-auto lg:text-center">
                Prueba con sinónimos, términos sin comillas o elimina alguno de los filtros de reglamento o capítulo.
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-4 rounded-md border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-400"
              >
                Restablecer búsqueda
              </button>
            </div>
          )}

          {data?.results.map((item) => {
            const isSelected = selectedEntryId === item.entryId;
            const pageStr =
              item.pagePrinted === item.pagePrintedEnd
                ? `Pág. ${item.pagePrinted}`
                : `Págs. ${item.pagePrinted}–${item.pagePrintedEnd}`;
            const subLabel = item.primarySubsection?.subsectionLabel;
            const subPage = item.primarySubsection?.pagePrinted ?? item.pagePrinted;

            return (
              <article
                key={item.entryId}
                onClick={() => handleSelectResult(item)}
                className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                  isSelected
                    ? 'border-emerald-900 bg-white ring-1 ring-emerald-900/20'
                    : 'border-stone-200 bg-white hover:border-stone-400'
                }`}
              >
                {/* Header Line */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-serif text-lg font-semibold leading-snug text-stone-900">
                      {item.articleLabel}
                      {item.articleTitle && item.articleTitle !== item.articleLabel && (
                        <span className="font-normal text-stone-700"> — {item.articleTitle}</span>
                      )}
                    </h2>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-mono text-xs font-semibold tabular-nums text-emerald-950">
                      {pageStr}
                    </span>
                    <span className="block font-mono text-[10px] tabular-nums text-stone-400">
                      PDF p. {item.pagePdf}
                    </span>
                  </div>
                </div>

                {/* Explicit 5-Field Citation Location Matrix */}
                <dl className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1 border-y border-stone-100 py-2 text-xs sm:grid-cols-2">
                  <div className="truncate">
                    <dt className="inline text-stone-400">Documento: </dt>
                    <dd className="inline font-medium text-stone-800">{item.documentName}</dd>
                  </div>
                  <div className="truncate">
                    <dt className="inline text-stone-400">Reglamento: </dt>
                    <dd className="inline font-medium text-stone-800">{item.regulation}</dd>
                  </div>
                  <div className="truncate">
                    <dt className="inline text-stone-400">Sección: </dt>
                    <dd className="inline font-medium text-stone-800">{item.section}</dd>
                  </div>
                  <div className="truncate">
                    <dt className="inline text-stone-400">Subsección: </dt>
                    <dd className="inline font-medium text-emerald-900">
                      {subLabel ?? 'Texto principal'}{' '}
                      <span className="font-mono text-[11px] tabular-nums text-stone-500">
                        (Pág. {subPage})
                      </span>
                    </dd>
                  </div>
                </dl>

                {/* Highlighted Snippet */}
                <p className="mt-2.5 text-justify text-sm leading-relaxed text-stone-700 hyphens-auto lg:text-left">
                  {item.excerptSegments.map((seg, idx) =>
                    seg.match ? (
                      <mark key={idx}>{seg.text}</mark>
                    ) : (
                      <span key={idx}>{seg.text}</span>
                    ),
                  )}
                </p>

                {/* Additional matching subsections if more than 1 */}
                {item.matchedSubsections.length > 1 && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-500">
                    <span className="font-medium text-stone-600">Otras subsecciones coincidentes:</span>
                    {item.matchedSubsections.slice(1).map((sub, i) => (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEntryId(item.entryId);
                          setSelectedSubId(sub.id);
                          setMobileDetailOpen(true);
                        }}
                        className="font-medium text-emerald-900 underline decoration-emerald-900/30 underline-offset-2 hover:decoration-emerald-900"
                      >
                        {sub.subsectionLabel} (Pág. {sub.pagePrinted})
                        {i < item.matchedSubsections.slice(1).length - 1 ? '' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* Right Sticky Citation Reader (Desktop) */}
        <aside className="hidden lg:sticky lg:top-20 lg:col-span-5 lg:block">
          <EntryReaderPane
            entryId={selectedEntryId}
            highlightSubsectionId={selectedSubId}
            highlightTerms={highlightTerms}
            isBookmarked={isBookmarked}
            onToggleBookmark={onToggleBookmark}
            onSelectEntry={(id) => {
              setSelectedEntryId(id);
              setSelectedSubId(null);
            }}
            onOpenPdf={onOpenPdf}
          />
        </aside>
      </div>

      {/* Mobile Drawer for Reader Pane */}
      {mobileDetailOpen && selectedEntryId && (
        <div className="fixed inset-0 z-40 flex items-end bg-stone-950/50 lg:hidden">
          <div className="max-h-[88dvh] w-full overflow-y-auto overscroll-contain rounded-t-xl bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <EntryReaderPane
              entryId={selectedEntryId}
              highlightSubsectionId={selectedSubId}
              highlightTerms={highlightTerms}
              isBookmarked={isBookmarked}
              onToggleBookmark={onToggleBookmark}
              onSelectEntry={(id) => {
                setSelectedEntryId(id);
                setSelectedSubId(null);
              }}
              onOpenPdf={onOpenPdf}
              onCloseMobile={() => setMobileDetailOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
