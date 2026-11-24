import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  X,
} from 'lucide-react';
import { fetchEntryDetailClient } from '../services/normativaClient';
import type { EntryDetailResponse, SavedCitation } from '../types';
import { copyTextCrossPlatform } from '../utils/clipboard';
import { formatProseForDisplay } from '../utils/formatProse';

interface EntryReaderPaneProps {
  entryId: number | null;
  highlightSubsectionId?: number | null;
  highlightTerms?: string[];
  isBookmarked: (entryId: number, subsectionLabel: string | null) => boolean;
  onToggleBookmark: (citation: SavedCitation) => void;
  onSelectEntry: (entryId: number) => void;
  onOpenPdf: (args: {
    title: string;
    subtitle: string;
    pdfPath: string;
    pagePdf: number;
    pagePrinted: number;
  }) => void;
  onCloseMobile?: () => void;
}

function renderHighlightedText(text: string, terms: string[]) {
  if (!terms || terms.length === 0) return text;
  const cleanTerms = terms.filter((t) => t.length >= 2);
  if (cleanTerms.length === 0) return text;

  const foldedChars: string[] = [];
  const origIndices: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const norm = text[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (let j = 0; j < norm.length; j++) {
      foldedChars.push(norm[j]);
      origIndices.push(i);
    }
  }
  const folded = foldedChars.join('');

  const ranges: Array<[number, number]> = [];
  for (const term of cleanTerms) {
    let idx = 0;
    while (idx < folded.length) {
      const found = folded.indexOf(term, idx);
      if (found === -1) break;
      const start = origIndices[found];
      const endIdx = Math.min(found + term.length - 1, origIndices.length - 1);
      const end = origIndices[endIdx] + 1;
      ranges.push([start, end]);
      idx = found + term.length;
    }
  }
  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    if (merged.length === 0 || r[0] > merged[merged.length - 1][1]) {
      merged.push([r[0], r[1]]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    }
  }

  const nodes: Array<string | { key: number; val: string }> = [];
  let cursor = 0;
  merged.forEach(([s, e], i) => {
    if (s > cursor) nodes.push(text.slice(cursor, s));
    nodes.push({ key: i, val: text.slice(s, e) });
    cursor = e;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return nodes.map((n, idx) =>
    typeof n === 'string' ? <span key={idx}>{n}</span> : <mark key={`m-${n.key}-${idx}`}>{n.val}</mark>,
  );
}

export function EntryReaderPane({
  entryId,
  highlightSubsectionId,
  highlightTerms = [],
  isBookmarked,
  onToggleBookmark,
  onSelectEntry,
  onOpenPdf,
  onCloseMobile,
}: EntryReaderPaneProps) {
  const [detail, setDetail] = useState<EntryDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const subRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!entryId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEntryDetailClient(entryId)
      .then((data: EntryDetailResponse | null) => {
        if (!cancelled) {
          setDetail(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  useEffect(() => {
    if (detail && highlightSubsectionId && subRefs.current[highlightSubsectionId]) {
      subRefs.current[highlightSubsectionId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [detail, highlightSubsectionId]);

  if (!entryId) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-center">
        <p className="font-serif text-base font-medium text-stone-800">
          Visor de Cita Completa
        </p>
        <p className="mt-1.5 text-justify text-xs leading-relaxed text-stone-500 hyphens-auto lg:text-center">
          Selecciona cualquier resultado de la izquierda para inspeccionar el texto íntegro del artículo o cláusula, verificar su fracción o inciso exacto y abrir la página original en el PDF.
        </p>
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 space-y-3 animate-pulse">
        <div className="h-3 w-2/3 rounded bg-stone-200" />
        <div className="h-6 w-1/2 rounded bg-stone-200" />
        <div className="h-20 w-full rounded bg-stone-100" />
        <div className="h-28 w-full rounded bg-stone-100" />
      </div>
    );
  }

  const { entry, subsections, neighbors } = detail;
  const activeSub =
    subsections.find((s) => s.id === highlightSubsectionId) ??
    (subsections.length === 1 ? subsections[0] : null);

  const pageLabel =
    entry.pagePrinted === entry.pagePrintedEnd
      ? `Pág. ${entry.pagePrinted}`
      : `Págs. ${entry.pagePrinted}–${entry.pagePrintedEnd}`;

  const activeSubLabel =
    activeSub && activeSub.subsectionLabel !== 'Texto íntegro' ? activeSub.subsectionLabel : null;

  const bookmarked = isBookmarked(entry.id, activeSubLabel);

  const handleCopyCitation = async () => {
    const locationParts = [
      entry.documentName,
      entry.regulation,
      entry.section,
      entry.articleLabel,
      activeSubLabel,
      `${pageLabel} (PDF pág. ${activeSub?.pagePdf ?? entry.pagePdf})`,
    ].filter(Boolean);
    const fullText = `${locationParts.join(' · ')}\n\n${activeSub ? activeSub.content : entry.content}`;
    const ok = await copyTextCrossPlatform(fullText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleBookmark = () => {
    onToggleBookmark({
      savedAt: new Date().toISOString(),
      entryId: entry.id,
      documentId: entry.documentId,
      documentName: entry.documentName,
      pdfPath: entry.pdfPath,
      regulation: entry.regulation,
      section: entry.section,
      articleLabel: entry.articleLabel,
      articleTitle: entry.articleTitle,
      subsectionLabel: activeSubLabel,
      pagePrinted: activeSub?.pagePrinted ?? entry.pagePrinted,
      pagePdf: activeSub?.pagePdf ?? entry.pagePdf,
      excerpt: (activeSub?.content ?? entry.content).slice(0, 260),
    });
  };

  return (
    <div className="flex flex-col rounded-lg border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
              {entry.documentName} · {entry.regulation}
            </p>
            <h2 className="mt-1 font-serif text-xl font-semibold leading-snug text-stone-900">
              {entry.articleLabel}
              {entry.articleTitle && entry.articleTitle !== entry.articleLabel && (
                <span className="font-normal text-stone-700"> — {entry.articleTitle}</span>
              )}
            </h2>
          </div>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="rounded-md border border-stone-200 p-1 text-stone-500 hover:text-stone-900 lg:hidden"
              aria-label="Cerrar detalle"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-stone-100 pt-3 text-xs">
          <div>
            <dt className="text-[11px] text-stone-400">Sección / Capítulo</dt>
            <dd className="font-medium text-stone-800">{entry.section}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-stone-400">Reglamento / Instrumento</dt>
            <dd className="font-medium text-stone-800">{entry.regulation}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-stone-400">Ubicación de Página</dt>
            <dd className="font-mono font-medium tabular-nums text-stone-900">
              {pageLabel} (PDF {entry.pagePdf})
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-stone-400">Subsección localizada</dt>
            <dd className="font-medium text-emerald-900">
              {activeSubLabel ?? `${subsections.length} ${subsections.length === 1 ? 'disposición' : 'fracciones/incisos'}`}
            </dd>
          </div>
        </dl>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyCitation}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 whitespace-nowrap hover:border-stone-400 hover:text-stone-900"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Cita copiada' : 'Copiar cita'}</span>
          </button>

          <button
            type="button"
            onClick={handleBookmark}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              bookmarked
                ? 'border-emerald-900 bg-emerald-900 text-white'
                : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:text-stone-900'
            }`}
          >
            {bookmarked ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
            <span>{bookmarked ? 'Guardada' : 'Guardar cita'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onOpenPdf({
                title: `${entry.documentName} · ${entry.articleLabel}`,
                subtitle: `${entry.regulation} · ${entry.section}`,
                pdfPath: entry.pdfPath,
                pagePdf: activeSub?.pagePdf ?? entry.pagePdf,
                pagePrinted: activeSub?.pagePrinted ?? entry.pagePrinted,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-900/30 bg-emerald-50/70 px-2.5 py-1.5 text-xs font-medium text-emerald-950 whitespace-nowrap hover:bg-emerald-100/70"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Ver en PDF (Pág. {activeSub?.pagePrinted ?? entry.pagePrinted})</span>
          </button>
        </div>
      </div>

      <div className="max-h-[58dvh] overflow-y-auto overscroll-contain px-5 py-4 space-y-3">
        {subsections.length > 0 ? (
          subsections.map((sub) => {
            const isTarget = highlightSubsectionId === sub.id;
            return (
              <div
                key={sub.id}
                ref={(el) => {
                  subRefs.current[sub.id] = el;
                }}
                className={`rounded-md border px-3.5 py-2.5 transition-colors ${
                  isTarget
                    ? 'border-amber-300 bg-amber-50/70'
                    : 'border-stone-100 bg-stone-50/40'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className={`font-semibold ${isTarget ? 'text-amber-950' : 'text-stone-700'}`}>
                    {sub.subsectionLabel}
                  </span>
                  <span className="font-mono tabular-nums text-stone-500">
                    Pág. {sub.pagePrinted}
                  </span>
                </div>
                <p className="whitespace-pre-line text-justify text-sm leading-relaxed text-stone-800 hyphens-auto lg:text-left">
                  {renderHighlightedText(formatProseForDisplay(sub.content), highlightTerms)}
                </p>
              </div>
            );
          })
        ) : (
          <p className="whitespace-pre-line text-justify text-sm leading-relaxed text-stone-800 hyphens-auto lg:text-left">
            {renderHighlightedText(formatProseForDisplay(entry.content), highlightTerms)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-stone-200 bg-stone-50/60 px-4 py-2.5 text-xs">
        <button
          type="button"
          disabled={!neighbors.prev}
          onClick={() => neighbors.prev && onSelectEntry(neighbors.prev.id)}
          className="inline-flex min-w-0 items-center gap-1 text-stone-600 hover:text-stone-900 disabled:opacity-35"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{neighbors.prev ? neighbors.prev.articleLabel : 'Inicio'}</span>
        </button>
        <button
          type="button"
          disabled={!neighbors.next}
          onClick={() => neighbors.next && onSelectEntry(neighbors.next.id)}
          className="inline-flex min-w-0 items-center gap-1 text-stone-600 hover:text-stone-900 disabled:opacity-35"
        >
          <span className="truncate">{neighbors.next ? neighbors.next.articleLabel : 'Fin'}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </button>
      </div>
    </div>
  );
}
