import { BookOpen, FileText } from 'lucide-react';
import type { DocumentInfo, FilterOptionsResponse } from '../types';

interface SourcesWorkspaceProps {
  documents: DocumentInfo[];
  filters: FilterOptionsResponse | null;
  onBrowseDocument: () => void;
  onOpenPdf: (args: {
    title: string;
    subtitle: string;
    pdfPath: string;
    pagePdf: number;
    pagePrinted: number;
  }) => void;
}

export function SourcesWorkspace({
  documents,
  filters,
  onBrowseDocument,
  onOpenPdf,
}: SourcesWorkspaceProps) {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6">
      <div className="border-b border-stone-200 pb-4">
        <h1 className="font-serif text-2xl font-semibold text-stone-900">
          Acervo Documental en Base de Datos
        </h1>
        <p className="mt-1 text-justify text-sm text-stone-600 hyphens-auto lg:text-left">
          Documentos normativos indexados en SQLite con trazabilidad directa a página impresa, página PDF, reglamento, sección, artículo y subsección.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {documents.map((doc) => {
          const docRegs = filters?.regulations.filter((r) => r.documentId === doc.id) ?? [];
          return (
            <section
              key={doc.id}
              className="rounded-lg border border-stone-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
                    {doc.shortName}
                  </p>
                  <h2 className="mt-0.5 font-serif text-xl font-semibold text-stone-900">
                    {doc.title}
                  </h2>
                  <p className="mt-1 text-justify text-sm text-stone-600 hyphens-auto lg:text-left">{doc.subtitle}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={onBrowseDocument}
                    className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-400"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Explorar índice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenPdf({
                        title: doc.title,
                        subtitle: doc.shortName,
                        pdfPath: doc.pdfPath,
                        pagePdf: 1,
                        pagePrinted: 1,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-950"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Abrir PDF completo</span>
                  </button>
                </div>
              </div>

              {/* Clean Tabular Metrics */}
              <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-stone-100 py-3 sm:grid-cols-4">
                <div>
                  <dt className="text-[11px] text-stone-400">Páginas PDF</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums text-stone-900">
                    {doc.totalPdfPages}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-stone-400">Artículos / Cláusulas</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums text-stone-900">
                    {doc.totalEntries}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-stone-400">Subsecciones / Fracciones</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums text-stone-900">
                    {doc.totalSubsections}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-stone-400">Instrumentos / Apartados</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums text-stone-900">
                    {docRegs.length}
                  </dd>
                </div>
              </dl>

              {docRegs.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-stone-700">
                    Desglose de instrumentos indexados:
                  </p>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {docRegs.map((reg) => (
                      <div
                        key={reg.regulation}
                        className="flex items-baseline justify-between gap-2 border-b border-stone-100 py-1"
                      >
                        <span className="truncate text-stone-700" title={reg.regulation}>
                          {reg.regulation}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-stone-500">
                          {reg.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
