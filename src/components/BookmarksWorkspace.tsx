import { useState } from 'react';
import { Check, Copy, FileText, Trash2 } from 'lucide-react';
import type { SavedCitation } from '../types';
import { copyTextCrossPlatform } from '../utils/clipboard';
import { formatProseForDisplay } from '../utils/formatProse';

interface BookmarksWorkspaceProps {
  bookmarks: SavedCitation[];
  onRemoveBookmark: (entryId: number, subsectionLabel: string | null) => void;
  onClearAll: () => void;
  onOpenPdf: (args: {
    title: string;
    subtitle: string;
    pdfPath: string;
    pagePdf: number;
    pagePrinted: number;
  }) => void;
}

export function BookmarksWorkspace({
  bookmarks,
  onRemoveBookmark,
  onClearAll,
  onOpenPdf,
}: BookmarksWorkspaceProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const formatCitation = (b: SavedCitation) => {
    const parts = [
      b.documentName,
      b.regulation,
      b.section,
      `${b.articleLabel}${b.articleTitle && b.articleTitle !== b.articleLabel ? ` (${b.articleTitle})` : ''}`,
      b.subsectionLabel,
      `Pág. ${b.pagePrinted} (PDF pág. ${b.pagePdf})`,
    ].filter(Boolean);
    return `${parts.join(' · ')}\n${b.excerpt}`;
  };

  const handleCopyOne = async (b: SavedCitation, key: string) => {
    const ok = await copyTextCrossPlatform(formatCitation(b));
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1600);
    }
  };

  const handleCopyAll = async () => {
    const report = bookmarks.map((b, i) => `${i + 1}. ${formatCitation(b)}`).join('\n\n---\n\n');
    const ok = await copyTextCrossPlatform(report);
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }
  };

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900">
            Citas Guardadas
          </h1>
          <p className="mt-0.5 text-justify text-sm text-stone-600 hyphens-auto lg:text-left">
            Referencias normativas guardadas durante tu consulta, con ubicación exacta de artículo, sección, reglamento, subsección y página.
          </p>
        </div>

        {bookmarks.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-400"
            >
              {copiedAll ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedAll ? 'Listado copiado' : `Copiar todas (${bookmarks.length})`}</span>
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-red-300 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Vaciar</span>
            </button>
          </div>
        )}
      </div>

      {bookmarks.length === 0 ? (
        <div className="mt-6 rounded-lg border border-stone-200 bg-white p-10 text-center">
          <p className="font-serif text-lg font-medium text-stone-900">
            Aún no has guardado citas normativas
          </p>
          <p className="mt-1.5 text-justify text-sm text-stone-600 hyphens-auto lg:text-center">
            En el Buscador o en el Índice Normativo, selecciona cualquier artículo o cláusula y pulsa «Guardar cita» para conservar su referencia completa aquí.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {bookmarks.map((b) => {
            const key = `${b.entryId}-${b.subsectionLabel ?? ''}`;
            return (
              <article
                key={key}
                className="rounded-lg border border-stone-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-lg font-semibold text-stone-900">
                      {b.articleLabel}
                      {b.articleTitle && b.articleTitle !== b.articleLabel && (
                        <span className="font-normal text-stone-700"> — {b.articleTitle}</span>
                      )}
                    </h2>
                    <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
                      <span>
                        <strong className="font-medium text-stone-800">Documento:</strong> {b.documentName}
                      </span>
                      <span>
                        <strong className="font-medium text-stone-800">Reglamento:</strong> {b.regulation}
                      </span>
                      <span>
                        <strong className="font-medium text-stone-800">Sección:</strong> {b.section}
                      </span>
                      {b.subsectionLabel && (
                        <span className="font-medium text-emerald-900">
                          <strong>Subsección:</strong> {b.subsectionLabel}
                        </span>
                      )}
                      <span className="font-mono tabular-nums text-stone-800">
                        Pág. {b.pagePrinted} (PDF p. {b.pagePdf})
                      </span>
                    </dl>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyOne(b, key)}
                      className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-stone-400"
                    >
                      {copiedKey === key ? (
                        <Check className="h-3.5 w-3.5 text-emerald-700" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copiedKey === key ? 'Copiada' : 'Copiar'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPdf({
                          title: `${b.documentName} · ${b.articleLabel}`,
                          subtitle: `${b.regulation} · ${b.section}`,
                          pdfPath: b.pdfPath,
                          pagePdf: b.pagePdf,
                          pagePrinted: b.pagePrinted,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-900/30 bg-emerald-50/70 px-2.5 py-1 text-xs font-medium text-emerald-950 hover:bg-emerald-100/70"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Ver PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveBookmark(b.entryId, b.subsectionLabel)}
                      className="rounded-md border border-stone-200 p-1.5 text-stone-400 hover:border-red-200 hover:text-red-700"
                      aria-label="Eliminar cita"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <p className="mt-2.5 border-t border-stone-100 pt-2.5 whitespace-pre-line text-justify text-sm leading-relaxed text-stone-700 hyphens-auto lg:text-left">
                  {formatProseForDisplay(b.excerpt)}…
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
