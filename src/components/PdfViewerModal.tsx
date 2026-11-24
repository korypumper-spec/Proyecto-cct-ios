import { Capacitor } from '@capacitor/core';
import { ChevronLeft, ChevronRight, ExternalLink, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { resolvePublicUrl } from '../utils/assetUrl';
import { getRecommendedPdfScale, prefersCanvasPdfViewer } from '../utils/platform';

pdfjs.GlobalWorkerOptions.workerSrc = resolvePublicUrl('pdf.worker.min.mjs');

interface PdfViewerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  pdfPath: string;
  pagePdf: number;
  pagePrinted?: number;
}

export function PdfViewerModal({
  open,
  onClose,
  title,
  subtitle,
  pdfPath,
  pagePdf,
  pagePrinted,
}: PdfViewerModalProps) {
  const isNative = Capacitor.isNativePlatform();
  const [useCanvasMode, setUseCanvasMode] = useState(() => prefersCanvasPdfViewer());
  const [currentPage, setCurrentPage] = useState(pagePdf);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(() => getRecommendedPdfScale());
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const resolvedPdfPath = pdfPath ? resolvePublicUrl(pdfPath) : '';

  useEffect(() => {
    setCurrentPage(pagePdf);
  }, [pagePdf, resolvedPdfPath, open]);

  useEffect(() => {
    if (!open || !useCanvasMode || !resolvedPdfPath) return;
    let cancelled = false;
    setRendering(true);
    setRenderError(null);

    const loadAndRender = async () => {
      try {
        renderTaskRef.current?.cancel();
        const doc = await pdfjs.getDocument({ url: resolvedPdfPath }).promise;
        if (cancelled) return;
        setNumPages(doc.numPages);
        const safePage = Math.min(Math.max(1, currentPage), doc.numPages);
        const page = await doc.getPage(safePage);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        // Cap DPR at 2 so 3x Retina iPhones stay comfortably under WebKit canvas limits
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
        const task = page.render({ canvas, canvasContext: context, viewport, transform });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (err) {
        if (cancelled || (err as { name?: string })?.name === 'RenderingCancelledException') return;
        setRenderError('No se pudo renderizar esta página del PDF.');
        setRendering(false);
      }
    };

    void loadAndRender();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [open, useCanvasMode, resolvedPdfPath, currentPage, scale]);

  if (!open) return null;

  const pdfUrl = `${resolvedPdfPath}#page=${currentPage}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
    >
      <div className="flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-stone-300 bg-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="pdf-modal-title" className="truncate font-serif text-base font-semibold text-stone-900">
              {title}
            </h2>
            <p className="truncate text-xs text-stone-600">
              {subtitle}
              {pagePrinted !== undefined && currentPage === pagePdf && (
                <span className="ml-2 font-mono tabular-nums text-stone-800">
                  · Pág. impresa {pagePrinted} (PDF pág. {currentPage})
                </span>
              )}
              {(pagePrinted === undefined || currentPage !== pagePdf) && (
                <span className="ml-2 font-mono tabular-nums text-stone-800">
                  · PDF pág. {currentPage}{numPages > 0 ? ` / ${numPages}` : ''}
                </span>
              )}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {useCanvasMode && (
              <>
                <div className="inline-flex items-center rounded-md border border-stone-300 bg-white">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-2 text-stone-700 hover:bg-stone-50 disabled:opacity-35"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-2 font-mono text-xs tabular-nums text-stone-800">
                    {currentPage}{numPages > 0 ? `/${numPages}` : ''}
                  </span>
                  <button
                    type="button"
                    disabled={numPages > 0 && currentPage >= numPages}
                    onClick={() => setCurrentPage((p) => (numPages > 0 ? Math.min(numPages, p + 1) : p + 1))}
                    className="p-2 text-stone-700 hover:bg-stone-50 disabled:opacity-35"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="inline-flex items-center rounded-md border border-stone-300 bg-white">
                  <button
                    type="button"
                    onClick={() => setScale((s) => Math.max(0.55, Number((s - 0.15).toFixed(2))))}
                    className="p-2 text-stone-700 hover:bg-stone-50"
                    aria-label="Alejar"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setScale((s) => Math.min(2.4, Number((s + 0.15).toFixed(2))))}
                    className="p-2 text-stone-700 hover:bg-stone-50"
                    aria-label="Acercar"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}

            {!isNative && (
              <button
                type="button"
                onClick={() => setUseCanvasMode((v) => !v)}
                className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 whitespace-nowrap hover:border-stone-400"
              >
                {useCanvasMode ? 'Visor nativo' : 'Visor integrado'}
              </button>
            )}

            {!isNative && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 whitespace-nowrap hover:border-stone-400 hover:text-stone-900"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Abrir aparte</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-stone-300 bg-white p-2 text-stone-600 hover:border-stone-400 hover:text-stone-900"
              aria-label="Cerrar visor PDF"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto overscroll-contain bg-stone-200">
          {useCanvasMode ? (
            <div className="flex min-h-full flex-col items-center justify-start p-3 sm:p-4">
              {rendering && (
                <p className="mb-2 text-xs text-stone-600">Renderizando página {currentPage}…</p>
              )}
              {renderError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-justify text-xs text-red-900 hyphens-auto lg:text-left">
                  {renderError}
                </p>
              )}
              <canvas ref={canvasRef} className="max-w-full rounded bg-white shadow-md" />
            </div>
          ) : (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              title={title}
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
