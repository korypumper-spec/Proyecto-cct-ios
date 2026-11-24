export interface DocumentInfo {
  id: string;
  shortName: string;
  title: string;
  subtitle: string;
  pdfPath: string;
  totalPdfPages: number;
  totalEntries: number;
  totalSubsections: number;
  indexedAt: string;
}

export interface TextSegment {
  text: string;
  match: boolean;
}

export interface SubsectionHit {
  id: number;
  subsectionLabel: string;
  pagePrinted: number;
  pagePdf: number;
  segments: TextSegment[];
}

export interface SearchResultItem {
  entryId: number;
  documentId: string;
  documentName: string;
  pdfPath: string;
  parentDivision: string;
  regulation: string;
  section: string;
  articleLabel: string;
  articleTitle: string;
  pagePrinted: number;
  pagePrintedEnd: number;
  pagePdf: number;
  pagePdfEnd: number;
  primarySubsection: SubsectionHit | null;
  matchedSubsections: SubsectionHit[];
  excerptSegments: TextSegment[];
  totalSubsections: number;
  score: number;
}

export interface FacetCount {
  value: string;
  label?: string;
  count: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  results: SearchResultItem[];
  facets: {
    documents: FacetCount[];
    regulations: FacetCount[];
  };
}

export interface FilterOptionsResponse {
  documents: Array<{ id: string; shortName: string; title: string; count: number }>;
  regulations: Array<{ documentId: string; regulation: string; parentDivision: string; count: number }>;
  sections: Array<{ documentId: string; regulation: string; section: string; count: number }>;
}

export interface SubsectionRecord {
  id: number;
  entryId: number;
  subsectionLabel: string;
  pagePrinted: number;
  pagePdf: number;
  content: string;
  sortOrder: number;
}

export interface EntryDetailResponse {
  entry: {
    id: number;
    documentId: string;
    documentName: string;
    pdfPath: string;
    parentDivision: string;
    regulation: string;
    section: string;
    articleLabel: string;
    articleTitle: string;
    pagePrinted: number;
    pagePrintedEnd: number;
    pagePdf: number;
    pagePdfEnd: number;
    content: string;
  };
  subsections: SubsectionRecord[];
  neighbors: {
    prev: { id: number; articleLabel: string; articleTitle: string } | null;
    next: { id: number; articleLabel: string; articleTitle: string } | null;
  };
}

export interface BrowseEntryItem {
  id: number;
  documentId: string;
  documentName: string;
  parentDivision: string;
  regulation: string;
  section: string;
  articleLabel: string;
  articleTitle: string;
  pagePrinted: number;
  pagePrintedEnd: number;
  pagePdf: number;
  subsectionCount: number;
  preview: string;
}

export interface SavedCitation {
  savedAt: string;
  entryId: number;
  documentId: string;
  documentName: string;
  pdfPath: string;
  regulation: string;
  section: string;
  articleLabel: string;
  articleTitle: string;
  subsectionLabel: string | null;
  pagePrinted: number;
  pagePdf: number;
  excerpt: string;
}
