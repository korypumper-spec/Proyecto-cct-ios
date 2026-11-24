import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { BookmarksWorkspace } from './components/BookmarksWorkspace';
import { BrowseWorkspace } from './components/BrowseWorkspace';
import { PdfViewerModal } from './components/PdfViewerModal';
import { SearchWorkspace } from './components/SearchWorkspace';
import { SourcesWorkspace } from './components/SourcesWorkspace';
import { TopBar, type WorkspaceTab } from './components/TopBar';
import { fetchDocuments, fetchFilters, recordVisitClient } from './services/normativaClient';
import type { DocumentInfo, FilterOptionsResponse, SavedCitation } from './types';

const BOOKMARKS_STORAGE_KEY = 'normativa_imss_sntss_bookmarks_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('search');
  const [filters, setFilters] = useState<FilterOptionsResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [visitInfo, setVisitInfo] = useState<{ totalVisits: number; scope: 'global' | 'local' } | null>(null);
  const [bookmarks, setBookmarks] = useState<SavedCitation[]>(() => {
    try {
      const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedCitation[]) : [];
    } catch {
      return [];
    }
  });

  const [pdfModal, setPdfModal] = useState<{
    open: boolean;
    title: string;
    subtitle: string;
    pdfPath: string;
    pagePdf: number;
    pagePrinted?: number;
  }>({
    open: false,
    title: '',
    subtitle: '',
    pdfPath: '',
    pagePdf: 1,
  });

  useEffect(() => {
    fetchFilters()
      .then((d) => setFilters(d))
      .catch(() => undefined);

    fetchDocuments()
      .then((docs) => setDocuments(docs))
      .catch(() => undefined);

    recordVisitClient()
      .then((info) => setVisitInfo(info))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
    } catch {
      // Ignore storage quota issues
    }
  }, [bookmarks]);

  const isBookmarked = (entryId: number, subsectionLabel: string | null) => {
    return bookmarks.some(
      (b) => b.entryId === entryId && (b.subsectionLabel ?? null) === (subsectionLabel ?? null),
    );
  };

  const handleToggleBookmark = (citation: SavedCitation) => {
    setBookmarks((prev) => {
      const exists = prev.some(
        (b) =>
          b.entryId === citation.entryId &&
          (b.subsectionLabel ?? null) === (citation.subsectionLabel ?? null),
      );
      if (exists) {
        return prev.filter(
          (b) =>
            !(
              b.entryId === citation.entryId &&
              (b.subsectionLabel ?? null) === (citation.subsectionLabel ?? null)
            ),
        );
      }
      return [citation, ...prev];
    });
  };

  const handleRemoveBookmark = (entryId: number, subsectionLabel: string | null) => {
    setBookmarks((prev) =>
      prev.filter(
        (b) => !(b.entryId === entryId && (b.subsectionLabel ?? null) === (subsectionLabel ?? null)),
      ),
    );
  };

  const handleOpenPdf = (args: {
    title: string;
    subtitle: string;
    pdfPath: string;
    pagePdf: number;
    pagePrinted?: number;
  }) => {
    setPdfModal({ open: true, ...args });
  };

  return (
    <div className="flex min-h-screen min-h-dvh flex-col bg-[#FBF9F5] text-stone-900">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        bookmarkCount={bookmarks.length}
        onOpenSourcesPdf={() => {
          const primaryDoc = documents[0];
          if (primaryDoc) {
            handleOpenPdf({
              title: primaryDoc.title,
              subtitle: primaryDoc.shortName,
              pdfPath: primaryDoc.pdfPath,
              pagePdf: 1,
              pagePrinted: 1,
            });
          } else {
            setActiveTab('sources');
          }
        }}
      />

      <main className="flex-1">
        {activeTab === 'search' && (
          <SearchWorkspace
            filters={filters}
            isBookmarked={isBookmarked}
            onToggleBookmark={handleToggleBookmark}
            onOpenPdf={handleOpenPdf}
          />
        )}

        {activeTab === 'browse' && (
          <BrowseWorkspace
            filters={filters}
            isBookmarked={isBookmarked}
            onToggleBookmark={handleToggleBookmark}
            onOpenPdf={handleOpenPdf}
          />
        )}

        {activeTab === 'bookmarks' && (
          <BookmarksWorkspace
            bookmarks={bookmarks}
            onRemoveBookmark={handleRemoveBookmark}
            onClearAll={() => setBookmarks([])}
            onOpenPdf={handleOpenPdf}
          />
        )}

        {activeTab === 'sources' && (
          <SourcesWorkspace
            documents={documents}
            filters={filters}
            onBrowseDocument={() => setActiveTab('browse')}
            onOpenPdf={handleOpenPdf}
          />
        )}
      </main>

      <footer className="mt-8 border-t border-stone-200 bg-white/80">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-stone-500 sm:flex-row sm:px-6">
          <p className="text-center sm:text-left">
            Normativa IMSS–SNTSS · CCT 2025–2027 y Estatutos del SNTSS
          </p>
          <div className="inline-flex items-center gap-1.5 text-stone-600">
            <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-900" strokeWidth={1.8} />
            <span>
              {visitInfo?.scope === 'local' ? 'Visitas en este dispositivo:' : 'Contador de visitas:'}
            </span>
            <span className="font-mono font-semibold tabular-nums text-stone-900">
              {visitInfo ? visitInfo.totalVisits.toLocaleString('es-MX') : '—'}
            </span>
          </div>
        </div>
      </footer>

      <PdfViewerModal
        open={pdfModal.open}
        onClose={() => setPdfModal((p) => ({ ...p, open: false }))}
        title={pdfModal.title}
        subtitle={pdfModal.subtitle}
        pdfPath={pdfModal.pdfPath}
        pagePdf={pdfModal.pagePdf}
        pagePrinted={pdfModal.pagePrinted}
      />
    </div>
  );
}
