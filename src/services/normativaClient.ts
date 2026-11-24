import { Capacitor } from '@capacitor/core';
import { resolvePublicUrl } from '../utils/assetUrl';
import type {
  BrowseEntryItem,
  DocumentInfo,
  EntryDetailResponse,
  FacetCount,
  FilterOptionsResponse,
  SearchResponse,
  SearchResultItem,
  SubsectionHit,
  SubsectionRecord,
  TextSegment,
} from '../types';

interface OfflineEntry {
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
  pagePdfEnd: number;
  content: string;
  sortOrder: number;
}

interface OfflineBundle {
  version: number;
  generatedAt: string;
  documents: DocumentInfo[];
  filters: FilterOptionsResponse;
  entries: OfflineEntry[];
  subsections: SubsectionRecord[];
}

interface IndexedOfflineStore {
  bundle: OfflineBundle;
  docPdfMap: Map<string, string>;
  entryById: Map<number, OfflineEntry>;
  subsByEntryId: Map<number, Array<SubsectionRecord & { folded: string }>>;
  entryFolded: Map<number, { headerFolded: string; fullFolded: string }>;
}

let offlineStorePromise: Promise<IndexedOfflineStore> | null = null;
let forceOfflineMode = Capacitor.isNativePlatform();

function normalizeForSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildHighlightSegments(text: string, terms: string[], maxLen = 280): TextSegment[] {
  if (!text) return [];
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (terms.length === 0) {
    const sliced = cleanText.length > maxLen ? `${cleanText.slice(0, maxLen).trimEnd()}…` : cleanText;
    return [{ text: sliced, match: false }];
  }

  const foldedChars: string[] = [];
  const origIndices: number[] = [];
  for (let i = 0; i < cleanText.length; i++) {
    const norm = cleanText[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (let j = 0; j < norm.length; j++) {
      foldedChars.push(norm[j]);
      origIndices.push(i);
    }
  }
  const folded = foldedChars.join('');

  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    if (!term) continue;
    let idx = 0;
    while (idx < folded.length) {
      const found = folded.indexOf(term, idx);
      if (found === -1) break;
      const startOrig = origIndices[found];
      const endFoldedIdx = Math.min(found + term.length - 1, origIndices.length - 1);
      const endOrig = origIndices[endFoldedIdx] + 1;
      ranges.push([startOrig, endOrig]);
      idx = found + term.length;
    }
  }

  if (ranges.length === 0) {
    const sliced = cleanText.length > maxLen ? `${cleanText.slice(0, maxLen).trimEnd()}…` : cleanText;
    return [{ text: sliced, match: false }];
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    if (merged.length === 0 || r[0] > merged[merged.length - 1][1]) {
      merged.push([r[0], r[1]]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    }
  }

  const firstMatchStart = merged[0][0];
  let windowStart = Math.max(0, firstMatchStart - Math.floor(maxLen * 0.28));
  if (windowStart > 0) {
    const spaceAfter = cleanText.indexOf(' ', windowStart);
    if (spaceAfter !== -1 && spaceAfter - windowStart < 25) {
      windowStart = spaceAfter + 1;
    }
  }
  let windowEnd = Math.min(cleanText.length, windowStart + maxLen);
  if (windowEnd < cleanText.length) {
    const spaceBefore = cleanText.lastIndexOf(' ', windowEnd);
    if (spaceBefore > windowStart + maxLen * 0.6) {
      windowEnd = spaceBefore;
    }
  }

  const segments: TextSegment[] = [];
  if (windowStart > 0) segments.push({ text: '…', match: false });

  let cursor = windowStart;
  for (const [s, e] of merged) {
    if (e <= windowStart || s >= windowEnd) continue;
    const clampedStart = Math.max(s, windowStart);
    const clampedEnd = Math.min(e, windowEnd);
    if (clampedStart > cursor) {
      segments.push({ text: cleanText.slice(cursor, clampedStart), match: false });
    }
    if (clampedEnd > clampedStart) {
      segments.push({ text: cleanText.slice(clampedStart, clampedEnd), match: true });
    }
    cursor = clampedEnd;
  }

  if (cursor < windowEnd) {
    segments.push({ text: cleanText.slice(cursor, windowEnd), match: false });
  }
  if (windowEnd < cleanText.length) {
    segments.push({ text: '…', match: false });
  }
  return segments;
}

function parseQuery(rawQuery: string): { phrases: string[]; tokens: string[] } {
  const phrases: string[] = [];
  let remainder = rawQuery;
  const quoteRegex = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRegex.exec(rawQuery)) !== null) {
    const norm = normalizeForSearch(m[1]).replace(/[^a-z0-9\s]/g, ' ').trim();
    if (norm) phrases.push(norm);
  }
  remainder = remainder.replace(quoteRegex, ' ');

  const rawTokens = normalizeForSearch(remainder)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 || /^\d+$/.test(t));

  const stopWords = new Set([
    'de', 'la', 'el', 'en', 'y', 'o', 'los', 'las', 'del', 'al', 'un', 'una', 'por', 'para', 'con', 'se', 'su', 'que',
  ]);
  const meaningful = rawTokens.filter((t) => !stopWords.has(t));
  return { phrases, tokens: meaningful.length > 0 ? meaningful : rawTokens };
}

async function getOfflineStore(): Promise<IndexedOfflineStore> {
  if (!offlineStorePromise) {
    offlineStorePromise = fetch(resolvePublicUrl('data/normativa-offline.json'))
      .then((res) => {
        if (!res.ok) throw new Error('No se pudo cargar la base documental offline.');
        return res.json() as Promise<OfflineBundle>;
      })
      .then((bundle) => {
        const docPdfMap = new Map<string, string>();
        for (const d of bundle.documents) {
          d.pdfPath = resolvePublicUrl(d.pdfPath);
          docPdfMap.set(d.id, d.pdfPath);
        }

        const entryById = new Map<number, OfflineEntry>();
        const entryFolded = new Map<number, { headerFolded: string; fullFolded: string }>();
        for (const e of bundle.entries) {
          entryById.set(e.id, e);
          const headerFolded = normalizeForSearch(
            `${e.articleLabel} ${e.articleTitle} ${e.section} ${e.regulation}`,
          );
          const fullFolded = `${headerFolded} ${normalizeForSearch(e.content)}`;
          entryFolded.set(e.id, { headerFolded, fullFolded });
        }

        const subsByEntryId = new Map<number, Array<SubsectionRecord & { folded: string }>>();
        for (const s of bundle.subsections) {
          const list = subsByEntryId.get(s.entryId) ?? [];
          list.push({ ...s, folded: normalizeForSearch(`${s.subsectionLabel} ${s.content}`) });
          subsByEntryId.set(s.entryId, list);
        }

        return { bundle, docPdfMap, entryById, subsByEntryId, entryFolded };
      });
  }
  return offlineStorePromise;
}

export async function fetchDocuments(): Promise<DocumentInfo[]> {
  if (!forceOfflineMode) {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = (await res.json()) as { documents: DocumentInfo[] };
        return data.documents ?? [];
      }
    } catch {
      forceOfflineMode = true;
    }
  }
  const store = await getOfflineStore();
  return store.bundle.documents;
}

export async function fetchFilters(): Promise<FilterOptionsResponse> {
  if (!forceOfflineMode) {
    try {
      const res = await fetch('/api/filters');
      if (res.ok) {
        return (await res.json()) as FilterOptionsResponse;
      }
    } catch {
      forceOfflineMode = true;
    }
  }
  const store = await getOfflineStore();
  return store.bundle.filters;
}

export async function searchNormativaClient(
  params: {
    q?: string;
    doc?: string;
    regulation?: string;
    section?: string;
    article?: string;
    sort?: 'relevance' | 'order';
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal,
): Promise<SearchResponse> {
  if (!forceOfflineMode) {
    try {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.doc) qs.set('doc', params.doc);
      if (params.regulation) qs.set('regulation', params.regulation);
      if (params.section) qs.set('section', params.section);
      if (params.article) qs.set('article', params.article);
      qs.set('sort', params.sort ?? 'relevance');
      qs.set('limit', String(params.limit ?? 40));
      if (params.offset) qs.set('offset', String(params.offset));

      const res = await fetch(`/api/search?${qs.toString()}`, { signal });
      if (res.ok) {
        return (await res.json()) as SearchResponse;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      forceOfflineMode = true;
    }
  }

  const store = await getOfflineStore();
  const rawQuery = (params.q ?? '').trim();
  const docFilter = (params.doc ?? '').trim();
  const regFilter = (params.regulation ?? '').trim();
  const secFilter = (params.section ?? '').trim();
  const artFilter = normalizeForSearch(params.article ?? '');
  const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const parsed = parseQuery(rawQuery);
  const terms = [...parsed.phrases, ...parsed.tokens];
  const normQueryFull = normalizeForSearch(rawQuery);

  const matched: Array<{
    entry: OfflineEntry;
    score: number;
    matchedSubs: SubsectionHit[];
    totalSubs: number;
  }> = [];

  for (const entry of store.bundle.entries) {
    if (docFilter && entry.documentId !== docFilter) continue;
    if (regFilter && entry.regulation !== regFilter) continue;
    if (secFilter && entry.section !== secFilter) continue;

    const foldedInfo = store.entryFolded.get(entry.id)!;
    if (artFilter) {
      const artNorm = normalizeForSearch(`${entry.articleLabel} ${entry.articleTitle}`);
      if (!artNorm.includes(artFilter)) continue;
    }

    const subs = store.subsByEntryId.get(entry.id) ?? [];

    if (!rawQuery) {
      const firstSub = subs[0];
      const primary: SubsectionHit | null = firstSub
        ? {
            id: firstSub.id,
            subsectionLabel: firstSub.subsectionLabel,
            pagePrinted: firstSub.pagePrinted,
            pagePdf: firstSub.pagePdf,
            segments: buildHighlightSegments(firstSub.content, [], 220),
          }
        : null;
      matched.push({
        entry,
        score: 1,
        matchedSubs: primary ? [primary] : [],
        totalSubs: subs.length,
      });
      continue;
    }

    if (terms.length === 0) continue;
    const allMatch = terms.every((t) => foldedInfo.fullFolded.includes(t));
    if (!allMatch) continue;

    const artLabelNorm = normalizeForSearch(entry.articleLabel);
    const artTitleNorm = normalizeForSearch(entry.articleTitle);
    let score = 0;

    if (artLabelNorm === normQueryFull || artTitleNorm === normQueryFull) score += 60;
    else if (`${artLabelNorm} ${artTitleNorm}`.includes(normQueryFull)) score += 30;
    else if (terms.every((t) => foldedInfo.headerFolded.includes(t))) score += 16;

    for (const t of terms) {
      if (foldedInfo.headerFolded.includes(t)) score += 4;
      let idx = 0;
      let count = 0;
      while (count < 8) {
        const found = foldedInfo.fullFolded.indexOf(t, idx);
        if (found === -1) break;
        count++;
        idx = found + t.length;
      }
      score += count * 1.5;
    }

    const subMatches: Array<{ hit: SubsectionHit; sScore: number }> = [];
    for (const sub of subs) {
      const hitsCount = terms.filter((t) => sub.folded.includes(t)).length;
      if (hitsCount > 0) {
        subMatches.push({
          sScore: hitsCount * 10 + (terms.every((t) => sub.folded.includes(t)) ? 20 : 0),
          hit: {
            id: sub.id,
            subsectionLabel: sub.subsectionLabel,
            pagePrinted: sub.pagePrinted,
            pagePdf: sub.pagePdf,
            segments: buildHighlightSegments(sub.content, terms, 240),
          },
        });
      }
    }
    subMatches.sort((a, b) => b.sScore - a.sScore);

    matched.push({
      entry,
      score,
      matchedSubs: subMatches.slice(0, 5).map((m) => m.hit),
      totalSubs: subs.length,
    });
  }

  if (params.sort === 'order' || !rawQuery) {
    matched.sort((a, b) => {
      if (a.entry.documentId !== b.entry.documentId) {
        return a.entry.documentId.localeCompare(b.entry.documentId);
      }
      return a.entry.sortOrder - b.entry.sortOrder;
    });
  } else {
    matched.sort((a, b) => b.score - a.score);
  }

  const docFacetMap = new Map<string, { label: string; count: number }>();
  const regFacetMap = new Map<string, number>();
  for (const m of matched) {
    const df = docFacetMap.get(m.entry.documentId);
    if (df) df.count++;
    else docFacetMap.set(m.entry.documentId, { label: m.entry.documentName, count: 1 });
    regFacetMap.set(m.entry.regulation, (regFacetMap.get(m.entry.regulation) ?? 0) + 1);
  }

  const results: SearchResultItem[] = matched.slice(offset, offset + limit).map((m) => {
    const primarySub = m.matchedSubs[0] ?? null;
    return {
      entryId: m.entry.id,
      documentId: m.entry.documentId,
      documentName: m.entry.documentName,
      pdfPath: store.docPdfMap.get(m.entry.documentId) ?? '',
      parentDivision: m.entry.parentDivision,
      regulation: m.entry.regulation,
      section: m.entry.section,
      articleLabel: m.entry.articleLabel,
      articleTitle: m.entry.articleTitle,
      pagePrinted: m.entry.pagePrinted,
      pagePrintedEnd: m.entry.pagePrintedEnd,
      pagePdf: m.entry.pagePdf,
      pagePdfEnd: m.entry.pagePdfEnd,
      primarySubsection: primarySub,
      matchedSubsections: m.matchedSubs,
      excerptSegments: primarySub ? primarySub.segments : buildHighlightSegments(m.entry.content, terms, 280),
      totalSubsections: m.totalSubs,
      score: Number(m.score.toFixed(2)),
    };
  });

  const docFacets: FacetCount[] = Array.from(docFacetMap.entries()).map(([value, info]) => ({
    value,
    label: info.label,
    count: info.count,
  }));
  const regFacets: FacetCount[] = Array.from(regFacetMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([value, count]) => ({ value, count }));

  return {
    query: rawQuery,
    total: matched.length,
    results,
    facets: { documents: docFacets, regulations: regFacets },
  };
}

export async function browseEntriesClient(params: {
  doc?: string;
  regulation?: string;
  section?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; items: BrowseEntryItem[] }> {
  if (!forceOfflineMode) {
    try {
      const qs = new URLSearchParams();
      if (params.doc) qs.set('doc', params.doc);
      if (params.regulation) qs.set('regulation', params.regulation);
      if (params.section) qs.set('section', params.section);
      qs.set('limit', String(params.limit ?? 200));
      if (params.offset) qs.set('offset', String(params.offset));
      const res = await fetch(`/api/browse?${qs.toString()}`);
      if (res.ok) {
        return (await res.json()) as { total: number; items: BrowseEntryItem[] };
      }
    } catch {
      forceOfflineMode = true;
    }
  }

  const store = await getOfflineStore();
  const limit = Math.min(Math.max(params.limit ?? 80, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const filtered = store.bundle.entries.filter(
    (e) =>
      (!params.doc || e.documentId === params.doc) &&
      (!params.regulation || e.regulation === params.regulation) &&
      (!params.section || e.section === params.section),
  );

  const items: BrowseEntryItem[] = filtered.slice(offset, offset + limit).map((e) => ({
    id: e.id,
    documentId: e.documentId,
    documentName: e.documentName,
    parentDivision: e.parentDivision,
    regulation: e.regulation,
    section: e.section,
    articleLabel: e.articleLabel,
    articleTitle: e.articleTitle,
    pagePrinted: e.pagePrinted,
    pagePrintedEnd: e.pagePrintedEnd,
    pagePdf: e.pagePdf,
    subsectionCount: (store.subsByEntryId.get(e.id) ?? []).length,
    preview: e.content.replace(/\n+/g, ' ').slice(0, 200),
  }));

  return { total: filtered.length, items };
}

export async function fetchEntryDetailClient(id: number): Promise<EntryDetailResponse | null> {
  if (!forceOfflineMode) {
    try {
      const res = await fetch(`/api/entries/${id}`);
      if (res.ok) {
        return (await res.json()) as EntryDetailResponse;
      }
    } catch {
      forceOfflineMode = true;
    }
  }

  const store = await getOfflineStore();
  const entry = store.entryById.get(id);
  if (!entry) return null;

  const sameDoc = store.bundle.entries.filter((e) => e.documentId === entry.documentId);
  const idx = sameDoc.findIndex((e) => e.id === id);
  const prev = idx > 0 ? sameDoc[idx - 1] : null;
  const next = idx >= 0 && idx < sameDoc.length - 1 ? sameDoc[idx + 1] : null;

  const subs = (store.subsByEntryId.get(id) ?? []).map(({ folded: _folded, ...rest }) => rest);

  return {
    entry: {
      id: entry.id,
      documentId: entry.documentId,
      documentName: entry.documentName,
      pdfPath: store.docPdfMap.get(entry.documentId) ?? '',
      parentDivision: entry.parentDivision,
      regulation: entry.regulation,
      section: entry.section,
      articleLabel: entry.articleLabel,
      articleTitle: entry.articleTitle,
      pagePrinted: entry.pagePrinted,
      pagePrintedEnd: entry.pagePrintedEnd,
      pagePdf: entry.pagePdf,
      pagePdfEnd: entry.pagePdfEnd,
      content: entry.content,
    },
    subsections: subs,
    neighbors: {
      prev: prev ? { id: prev.id, articleLabel: prev.articleLabel, articleTitle: prev.articleTitle } : null,
      next: next ? { id: next.id, articleLabel: next.articleLabel, articleTitle: next.articleTitle } : null,
    },
  };
}

const VISIT_SESSION_KEY = 'normativa_visit_session_v1';
const VISIT_LOCAL_COUNT_KEY = 'normativa_local_visits_v1';

let visitPromise: Promise<{ totalVisits: number; scope: 'global' | 'local' }> | null = null;

export function recordVisitClient(): Promise<{ totalVisits: number; scope: 'global' | 'local' }> {
  if (visitPromise) return visitPromise;

  visitPromise = (async () => {
    let alreadyCountedInSession = false;
    try {
      alreadyCountedInSession = sessionStorage.getItem(VISIT_SESSION_KEY) === '1';
      if (!alreadyCountedInSession) {
        sessionStorage.setItem(VISIT_SESSION_KEY, '1');
      }
    } catch {
      // Ignore restricted storage
    }

    if (!forceOfflineMode) {
      try {
        const res = await fetch('/api/visits', {
          method: alreadyCountedInSession ? 'GET' : 'POST',
        });
        if (res.ok) {
          const data = (await res.json()) as { totalVisits: number };
          if (typeof data.totalVisits === 'number' && Number.isFinite(data.totalVisits)) {
            return { totalVisits: data.totalVisits, scope: 'global' as const };
          }
        }
      } catch {
        // Fall through to local offline counter
      }
    }

    let localCount = 1;
    try {
      const stored = Number.parseInt(localStorage.getItem(VISIT_LOCAL_COUNT_KEY) ?? '0', 10);
      const safeStored = Number.isFinite(stored) && stored >= 0 ? stored : 0;
      localCount = alreadyCountedInSession ? Math.max(1, safeStored) : safeStored + 1;
      localStorage.setItem(VISIT_LOCAL_COUNT_KEY, String(localCount));
    } catch {
      localCount = 1;
    }

    return { totalVisits: localCount, scope: 'local' as const };
  })();

  return visitPromise;
}
