import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { browseEntriesClient } from '../services/normativaClient';
import type { BrowseEntryItem, FilterOptionsResponse, SavedCitation } from '../types';
import { EntryReaderPane } from './EntryReaderPane';

interface BrowseWorkspaceProps {
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

export function BrowseWorkspace({
  filters,
  isBookmarked,
  onToggleBookmark,
  onOpenPdf,
}: BrowseWorkspaceProps) {
  const [selectedDoc, setSelectedDoc] = useState('cct-2025-2027');
  const [selectedReg, setSelectedReg] = useState('Clausulado General CCT');
  const [selectedSec, setSelectedSec] = useState('');
  const [items, setItems] = useState<BrowseEntryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);

  const docRegulations = useMemo(() => {
    if (!filters) return [];
    return filters.regulations.filter((r) => r.documentId === selectedDoc);
  }, [filters, selectedDoc]);

  const regSections = useMemo(() => {
    if (!filters) return [];
    return filters.sections.filter(
      (s) => s.documentId === selectedDoc && s.regulation === selectedReg,
    );
  }, [filters, selectedDoc, selectedReg]);

  useEffect(() => {
    if (!docRegulations.some((r) => r.regulation === selectedReg) && docRegulations.length > 0) {
      setSelectedReg(docRegulations[0].regulation);
      setSelectedSec('');
    }
  }, [docRegulations, selectedReg]);

  useEffect(() => {
    setLoading(true);
    browseEntriesClient({
      doc: selectedDoc || undefined,
      regulation: selectedReg || undefined,
      section: selectedSec || undefined,
      limit: 200,
    })
      .then((json: { total: number; items: BrowseEntryItem[] }) => {
        setItems(json.items);
        setTotal(json.total);
        setLoading(false);
        if (json.items.length > 0) {
          setSelectedEntryId(json.items[0].id);
        } else {
          setSelectedEntryId(null);
        }
      })
      .catch(() => setLoading(false));
  }, [selectedDoc, selectedReg, selectedSec]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900">
            Índice Normativo y Reglamentos
          </h1>
          <p className="mt-0.5 text-justify text-sm text-stone-600 hyphens-auto lg:text-left">
            Navegación jerárquica por instrumento normativo, reglamento, capítulo y artículo o cláusula.
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-stone-500">
          {total} disposiciones en esta vista
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        {/* Left Navigation Tree */}
        <aside className="rounded-lg border border-stone-200 bg-white lg:col-span-3">
          <div className="border-b border-stone-200 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-500">
              Documento
            </p>
            <div className="space-y-1">
              {filters?.documents.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    setSelectedDoc(doc.id);
                    setSelectedSec('');
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                    selectedDoc === doc.id
                      ? 'bg-emerald-900 text-white'
                      : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span className="truncate">{doc.shortName}</span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      selectedDoc === doc.id ? 'text-emerald-100' : 'text-stone-400'
                    }`}
                  >
                    {doc.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-500">
              Reglamento / Apartado
            </p>
            <div className="space-y-0.5">
              {docRegulations.map((reg) => {
                const active = selectedReg === reg.regulation;
                return (
                  <button
                    key={reg.regulation}
                    type="button"
                    onClick={() => {
                      setSelectedReg(reg.regulation);
                      setSelectedSec('');
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                      active
                        ? 'bg-stone-100 font-semibold text-emerald-950'
                        : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                    }`}
                  >
                    <span className="line-clamp-2">{reg.regulation}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-stone-400">
                      {reg.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Middle Article Index Table */}
        <div className="rounded-lg border border-stone-200 bg-white lg:col-span-4">
          <div className="border-b border-stone-200 px-4 py-3">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
              Filtrar por capítulo / sección
            </label>
            <select
              value={selectedSec}
              onChange={(e) => setSelectedSec(e.target.value)}
              className="h-10 w-full rounded-md border border-stone-300 bg-white px-2.5 text-base text-stone-800 focus:border-emerald-900 focus:outline-none lg:h-9 lg:text-xs"
            >
              <option value="">Todos los capítulos ({total})</option>
              {regSections.map((s) => (
                <option key={s.section} value={s.section}>
                  {s.section} ({s.count})
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[68vh] divide-y divide-stone-100 overflow-y-auto">
            {loading && (
              <div className="p-4 text-xs text-stone-500">Cargando disposiciones…</div>
            )}
            {!loading &&
              items.map((item) => {
                const active = selectedEntryId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedEntryId(item.id)}
                    className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
                      active ? 'bg-emerald-50/60' : 'hover:bg-stone-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-stone-400 truncate">
                        {item.section}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-stone-900">
                        {item.articleLabel}
                        {item.articleTitle && item.articleTitle !== item.articleLabel && (
                          <span className="font-normal text-stone-600"> · {item.articleTitle}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                      <span className="font-mono text-xs tabular-nums text-stone-500">
                        p.{item.pagePrinted}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Right Reader Pane */}
        <div className="lg:sticky lg:top-20 lg:col-span-5">
          <EntryReaderPane
            entryId={selectedEntryId}
            isBookmarked={isBookmarked}
            onToggleBookmark={onToggleBookmark}
            onSelectEntry={(id) => setSelectedEntryId(id)}
            onOpenPdf={onOpenPdf}
          />
        </div>
      </div>
    </div>
  );
}
