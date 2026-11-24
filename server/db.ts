import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  BrowseEntryItem,
  DocumentInfo,
  EntryDetailResponse,
  FacetCount,
  FilterOptionsResponse,
  SearchResponse,
  SearchResultItem,
  SubsectionHit,
  TextSegment,
} from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'normativa.db');

let dbInstance: Database.Database | null = null;

export function normalizeForSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  dbInstance = db;
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      short_name TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      pdf_path TEXT NOT NULL,
      total_pdf_pages INTEGER NOT NULL,
      total_entries INTEGER NOT NULL DEFAULT 0,
      total_subsections INTEGER NOT NULL DEFAULT 0,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      document_name TEXT NOT NULL,
      parent_division TEXT NOT NULL,
      regulation TEXT NOT NULL,
      section TEXT NOT NULL,
      article_label TEXT NOT NULL,
      article_title TEXT NOT NULL,
      page_printed INTEGER NOT NULL,
      page_printed_end INTEGER NOT NULL,
      page_pdf INTEGER NOT NULL,
      page_pdf_end INTEGER NOT NULL,
      content TEXT NOT NULL,
      search_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entries_doc ON entries(document_id);
    CREATE INDEX IF NOT EXISTS idx_entries_reg ON entries(document_id, regulation);
    CREATE INDEX IF NOT EXISTS idx_entries_sec ON entries(document_id, regulation, section);
    CREATE INDEX IF NOT EXISTS idx_entries_sort ON entries(document_id, sort_order);

    CREATE TABLE IF NOT EXISTS subsections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL,
      subsection_label TEXT NOT NULL,
      page_printed INTEGER NOT NULL,
      page_pdf INTEGER NOT NULL,
      content TEXT NOT NULL,
      search_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_subsections_entry ON subsections(entry_id, sort_order);

    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      entry_id UNINDEXED,
      subsection_id UNINDEXED,
      document_id UNINDEXED,
      article_label,
      article_title,
      section,
      regulation,
      subsection_label,
      content_folded,
      tokenize='unicode61'
    );

    CREATE TABLE IF NOT EXISTS site_metrics (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO site_metrics (key, value, updated_at)
    VALUES ('total_visits', 0, datetime('now'));
  `);
}

interface ParsedQuery {
  phrases: string[];
  tokens: string[];
  ftsExpr: string;
}

function parseSearchQuery(rawQuery: string): ParsedQuery {
  const phrases: string[] = [];
  let remainder = rawQuery;
  const quoteRegex = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRegex.exec(rawQuery)) !== null) {
    const norm = normalizeForSearch(m[1]).replace(/[^a-z0-9\s]/g, ' ').trim();
    if (norm) phrases.push(norm);
  }
  remainder = remainder.replace(quoteRegex, ' ');

  const normalized = normalizeForSearch(remainder);
  const rawTokens = normalized
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 || /^\d+$/.test(t));

  const stopWords = new Set(['de', 'la', 'el', 'en', 'y', 'o', 'los', 'las', 'del', 'al', 'un', 'una', 'por', 'para', 'con', 'se', 'su', 'que']);
  const meaningful = rawTokens.filter((t) => !stopWords.has(t));
  const tokens = meaningful.length > 0 ? meaningful : rawTokens;

  const ftsParts: string[] = [];
  for (const p of phrases) {
    const words = p.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      ftsParts.push(`"${words.join(' ')}"`);
    }
  }
  for (const t of tokens) {
    // Use prefix matching for words >= 4 chars so plural/singular Spanish stems match smoothly
    if (t.length >= 4 && !/^\d+$/.test(t)) {
      ftsParts.push(`${t}*`);
    } else {
      ftsParts.push(`"${t}"`);
    }
  }

  return {
    phrases,
    tokens,
    ftsExpr: ftsParts.join(' AND '),
  };
}

function buildHighlightSegments(text: string, terms: string[], maxLen = 280): TextSegment[] {
  if (!text) return [];
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (terms.length === 0) {
    const sliced = cleanText.length > maxLen ? `${cleanText.slice(0, maxLen).trimEnd()}…` : cleanText;
    return [{ text: sliced, match: false }];
  }

  // Build accent-folded index map back to original string indices
  const foldedChars: string[] = [];
  const origIndices: number[] = [];
  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const norm = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

  // Center excerpt window around the first match
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
  if (windowStart > 0) {
    segments.push({ text: '…', match: false });
  }

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

export interface SearchParams {
  q?: string;
  doc?: string;
  regulation?: string;
  section?: string;
  article?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export function searchNormativa(params: SearchParams): SearchResponse {
  const db = getDb();
  const rawQuery = (params.q ?? '').trim();
  const docFilter = (params.doc ?? '').trim();
  const regFilter = (params.regulation ?? '').trim();
  const secFilter = (params.section ?? '').trim();
  const artFilter = (params.article ?? '').trim();
  const sortMode = params.sort === 'order' ? 'order' : 'relevance';
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const docsMap = new Map<string, string>();
  const docRows = db.prepare('SELECT id, pdf_path FROM documents').all() as Array<{ id: string; pdf_path: string }>;
  for (const d of docRows) docsMap.set(d.id, d.pdf_path);

  // If no free-text query, filter directly on entries
  if (!rawQuery) {
    const where: string[] = [];
    const args: Array<string | number> = [];
    if (docFilter) {
      where.push('e.document_id = ?');
      args.push(docFilter);
    }
    if (regFilter) {
      where.push('e.regulation = ?');
      args.push(regFilter);
    }
    if (secFilter) {
      where.push('e.section = ?');
      args.push(secFilter);
    }
    if (artFilter) {
      where.push('(LOWER(e.article_label) LIKE ? OR LOWER(e.article_title) LIKE ?)');
      const pat = `%${normalizeForSearch(artFilter)}%`;
      args.push(pat, pat);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalRow = db.prepare(`SELECT COUNT(*) AS cnt FROM entries e ${whereSql}`).get(...args) as { cnt: number };
    const rows = db
      .prepare(
        `
        SELECT e.*,
          (SELECT COUNT(*) FROM subsections s WHERE s.entry_id = e.id) AS total_subsections
        FROM entries e
        ${whereSql}
        ORDER BY e.document_id ASC, e.sort_order ASC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...args, limit, offset) as Array<Record<string, unknown>>;

    const firstSubStmt = db.prepare(
      'SELECT id, subsection_label, page_printed, page_pdf, content FROM subsections WHERE entry_id = ? ORDER BY sort_order ASC LIMIT 1',
    );

    const results: SearchResultItem[] = rows.map((r) => {
      const entryId = Number(r.id);
      const firstSub = firstSubStmt.get(entryId) as
        | { id: number; subsection_label: string; page_printed: number; page_pdf: number; content: string }
        | undefined;
      const primarySub: SubsectionHit | null = firstSub
        ? {
            id: firstSub.id,
            subsectionLabel: firstSub.subsection_label,
            pagePrinted: firstSub.page_printed,
            pagePdf: firstSub.page_pdf,
            segments: buildHighlightSegments(firstSub.content, [], 220),
          }
        : null;

      return {
        entryId,
        documentId: String(r.document_id),
        documentName: String(r.document_name),
        pdfPath: docsMap.get(String(r.document_id)) ?? '',
        parentDivision: String(r.parent_division),
        regulation: String(r.regulation),
        section: String(r.section),
        articleLabel: String(r.article_label),
        articleTitle: String(r.article_title),
        pagePrinted: Number(r.page_printed),
        pagePrintedEnd: Number(r.page_printed_end),
        pagePdf: Number(r.page_pdf),
        pagePdfEnd: Number(r.page_pdf_end),
        primarySubsection: primarySub,
        matchedSubsections: primarySub ? [primarySub] : [],
        excerptSegments: buildHighlightSegments(String(r.content), [], 280),
        totalSubsections: Number(r.total_subsections),
        score: 1,
      };
    });

    const docFacets = db
      .prepare(
        `SELECT document_id AS value, document_name AS label, COUNT(*) AS count FROM entries e ${whereSql} GROUP BY document_id ORDER BY count DESC`,
      )
      .all(...args) as FacetCount[];
    const regFacets = db
      .prepare(
        `SELECT regulation AS value, COUNT(*) AS count FROM entries e ${whereSql} GROUP BY regulation ORDER BY count DESC LIMIT 12`,
      )
      .all(...args) as FacetCount[];

    return {
      query: '',
      total: totalRow.cnt,
      results,
      facets: { documents: docFacets, regulations: regFacets },
    };
  }

  // Full-text search via FTS5
  const parsed = parseSearchQuery(rawQuery);
  const highlightTerms = [...parsed.phrases, ...parsed.tokens];
  const whereExtra: string[] = [];
  const extraArgs: Array<string | number> = [];

  if (docFilter) {
    whereExtra.push('e.document_id = ?');
    extraArgs.push(docFilter);
  }
  if (regFilter) {
    whereExtra.push('e.regulation = ?');
    extraArgs.push(regFilter);
  }
  if (secFilter) {
    whereExtra.push('e.section = ?');
    extraArgs.push(secFilter);
  }
  if (artFilter) {
    whereExtra.push('(e.search_text LIKE ? OR LOWER(e.article_label) LIKE ?)');
    const pat = `%${normalizeForSearch(artFilter)}%`;
    extraArgs.push(pat, pat);
  }

  const filterSql = whereExtra.length > 0 ? `AND ${whereExtra.join(' AND ')}` : '';

  interface FtsRow {
    entry_id: number;
    subsection_id: number | null;
    rank: number;
    document_id: string;
    document_name: string;
    parent_division: string;
    regulation: string;
    section: string;
    article_label: string;
    article_title: string;
    page_printed: number;
    page_printed_end: number;
    page_pdf: number;
    page_pdf_end: number;
    entry_content: string;
    sort_order: number;
    sub_label: string | null;
    sub_page_printed: number | null;
    sub_page_pdf: number | null;
    sub_content: string | null;
  }

  let matchedRows: FtsRow[] = [];
  if (parsed.ftsExpr) {
    try {
      matchedRows = db
        .prepare(
          `
          SELECT
            f.entry_id,
            f.subsection_id,
            bm25(entries_fts, 8.0, 6.0, 2.5, 3.0, 2.0, 1.0) AS rank,
            e.document_id,
            e.document_name,
            e.parent_division,
            e.regulation,
            e.section,
            e.article_label,
            e.article_title,
            e.page_printed,
            e.page_printed_end,
            e.page_pdf,
            e.page_pdf_end,
            e.content AS entry_content,
            e.sort_order,
            s.subsection_label AS sub_label,
            s.page_printed AS sub_page_printed,
            s.page_pdf AS sub_page_pdf,
            s.content AS sub_content
          FROM entries_fts f
          JOIN entries e ON e.id = f.entry_id
          LEFT JOIN subsections s ON s.id = f.subsection_id
          WHERE entries_fts MATCH ?
          ${filterSql}
          ORDER BY rank ASC
          LIMIT 1500
        `,
        )
        .all(parsed.ftsExpr, ...extraArgs) as FtsRow[];
    } catch {
      matchedRows = [];
    }
  }

  // Fallback LIKE search if FTS returned 0 (e.g., query with punctuation or short words)
  if (matchedRows.length === 0 && highlightTerms.length > 0) {
    const likeConds = highlightTerms.map(() => 'e.search_text LIKE ?').join(' AND ');
    const likeArgs = highlightTerms.map((t) => `%${t}%`);
    const fallbackEntries = db
      .prepare(
        `
        SELECT
          e.id AS entry_id,
          NULL AS subsection_id,
          0.0 AS rank,
          e.document_id,
          e.document_name,
          e.parent_division,
          e.regulation,
          e.section,
          e.article_label,
          e.article_title,
          e.page_printed,
          e.page_printed_end,
          e.page_pdf,
          e.page_pdf_end,
          e.content AS entry_content,
          e.sort_order,
          NULL AS sub_label,
          NULL AS sub_page_printed,
          NULL AS sub_page_pdf,
          NULL AS sub_content
        FROM entries e
        WHERE ${likeConds}
        ${filterSql}
        ORDER BY e.sort_order ASC
        LIMIT 300
      `,
      )
      .all(...likeArgs, ...extraArgs) as FtsRow[];
    matchedRows = fallbackEntries;
  }

  // Group hits by entry_id and aggregate exact matched subsections
  const grouped = new Map<
    number,
    {
      base: FtsRow;
      bestScore: number;
      subsections: Array<{ hit: SubsectionHit; score: number }>;
    }
  >();

  const normQueryFull = normalizeForSearch(rawQuery);
  for (const row of matchedRows) {
    const artLabelNorm = normalizeForSearch(row.article_label);
    const artTitleNorm = normalizeForSearch(row.article_title);
    const labelNorm = `${artLabelNorm} ${artTitleNorm}`;
    let itemScore = -row.rank; // bm25 is negative; lower = better, so -rank = higher is better
    if (artLabelNorm === normQueryFull || artTitleNorm === normQueryFull) {
      itemScore += 50;
    } else if (labelNorm.includes(normQueryFull)) {
      itemScore += 25;
    } else if (parsed.tokens.every((t) => labelNorm.includes(t))) {
      itemScore += 12;
    }

    let entryGroup = grouped.get(row.entry_id);
    if (!entryGroup) {
      entryGroup = {
        base: row,
        bestScore: itemScore,
        subsections: [],
      };
      grouped.set(row.entry_id, entryGroup);
    } else if (itemScore > entryGroup.bestScore) {
      entryGroup.bestScore = itemScore;
    }

    if (row.subsection_id !== null && row.sub_label && row.sub_content) {
      const exists = entryGroup.subsections.some((s) => s.hit.id === row.subsection_id);
      if (!exists) {
        entryGroup.subsections.push({
          score: -row.rank,
          hit: {
            id: row.subsection_id,
            subsectionLabel: row.sub_label,
            pagePrinted: row.sub_page_printed ?? row.page_printed,
            pagePdf: row.sub_page_pdf ?? row.page_pdf,
            segments: buildHighlightSegments(row.sub_content, highlightTerms, 240),
          },
        });
      }
    }
  }

  // Also check subsections directly for entries that matched at entry-level without subsection FTS hits
  const subQueryStmt = db.prepare(
    'SELECT id, subsection_label, page_printed, page_pdf, content, search_text FROM subsections WHERE entry_id = ? ORDER BY sort_order ASC',
  );
  const subCountStmt = db.prepare('SELECT COUNT(*) AS cnt FROM subsections WHERE entry_id = ?');

  const allGrouped = Array.from(grouped.values());
  if (sortMode === 'order') {
    allGrouped.sort((a, b) => {
      if (a.base.document_id !== b.base.document_id) {
        return a.base.document_id.localeCompare(b.base.document_id);
      }
      return a.base.sort_order - b.base.sort_order;
    });
  } else {
    allGrouped.sort((a, b) => b.bestScore - a.bestScore);
  }

  // Compute facets across all grouped results before pagination
  const docFacetMap = new Map<string, { label: string; count: number }>();
  const regFacetMap = new Map<string, number>();
  for (const g of allGrouped) {
    const df = docFacetMap.get(g.base.document_id);
    if (df) df.count++;
    else docFacetMap.set(g.base.document_id, { label: g.base.document_name, count: 1 });

    regFacetMap.set(g.base.regulation, (regFacetMap.get(g.base.regulation) ?? 0) + 1);
  }

  const paged = allGrouped.slice(offset, offset + limit);
  const results: SearchResultItem[] = paged.map((g) => {
    const b = g.base;
    let subs = g.subsections.sort((x, y) => y.score - x.score).map((x) => x.hit);
    const totalSubRow = subCountStmt.get(b.entry_id) as { cnt: number };

    if (subs.length === 0 && totalSubRow.cnt > 0 && highlightTerms.length > 0) {
      const candidateSubs = subQueryStmt.all(b.entry_id) as Array<{
        id: number;
        subsection_label: string;
        page_printed: number;
        page_pdf: number;
        content: string;
        search_text: string;
      }>;
      const scoredSubs = candidateSubs
        .map((cs) => {
          const hits = highlightTerms.filter((t) => cs.search_text.includes(t)).length;
          return { cs, hits };
        })
        .filter((x) => x.hits > 0)
        .sort((x, y) => y.hits - x.hits)
        .slice(0, 4);

      subs = scoredSubs.map(({ cs }) => ({
        id: cs.id,
        subsectionLabel: cs.subsection_label,
        pagePrinted: cs.page_printed,
        pagePdf: cs.page_pdf,
        segments: buildHighlightSegments(cs.content, highlightTerms, 240),
      }));
    }

    const primarySub = subs.length > 0 ? subs[0] : null;
    const excerptSource = primarySub
      ? null
      : buildHighlightSegments(b.entry_content, highlightTerms, 280);

    return {
      entryId: b.entry_id,
      documentId: b.document_id,
      documentName: b.document_name,
      pdfPath: docsMap.get(b.document_id) ?? '',
      parentDivision: b.parent_division,
      regulation: b.regulation,
      section: b.section,
      articleLabel: b.article_label,
      articleTitle: b.article_title,
      pagePrinted: b.page_printed,
      pagePrintedEnd: b.page_printed_end,
      pagePdf: b.page_pdf,
      pagePdfEnd: b.page_pdf_end,
      primarySubsection: primarySub,
      matchedSubsections: subs.slice(0, 5),
      excerptSegments: primarySub ? primarySub.segments : (excerptSource ?? []),
      totalSubsections: totalSubRow.cnt,
      score: Number(g.bestScore.toFixed(2)),
    };
  });

  return {
    query: rawQuery,
    total: allGrouped.length,
    results,
    facets: {
      documents: Array.from(docFacetMap.entries()).map(([value, info]) => ({
        value,
        label: info.label,
        count: info.count,
      })),
      regulations: Array.from(regFacetMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([value, count]) => ({ value, count })),
    },
  };
}

export function getFilterOptions(): FilterOptionsResponse {
  const db = getDb();
  const documents = db
    .prepare(
      `
      SELECT d.id, d.short_name AS shortName, d.title, COUNT(e.id) AS count
      FROM documents d
      LEFT JOIN entries e ON e.document_id = d.id
      GROUP BY d.id
      ORDER BY d.id ASC
    `,
    )
    .all() as FilterOptionsResponse['documents'];

  const regulations = db
    .prepare(
      `
      SELECT document_id AS documentId, regulation, parent_division AS parentDivision, COUNT(*) AS count
      FROM entries
      GROUP BY document_id, regulation
      ORDER BY document_id ASC, MIN(sort_order) ASC
    `,
    )
    .all() as FilterOptionsResponse['regulations'];

  const sections = db
    .prepare(
      `
      SELECT document_id AS documentId, regulation, section, COUNT(*) AS count
      FROM entries
      GROUP BY document_id, regulation, section
      ORDER BY document_id ASC, MIN(sort_order) ASC
    `,
    )
    .all() as FilterOptionsResponse['sections'];

  return { documents, regulations, sections };
}

export function getEntryDetail(id: number): EntryDetailResponse | null {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT e.*, d.pdf_path AS pdfPath
      FROM entries e
      JOIN documents d ON d.id = e.document_id
      WHERE e.id = ?
    `,
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  const subsections = db
    .prepare(
      `
      SELECT id, entry_id AS entryId, subsection_label AS subsectionLabel,
             page_printed AS pagePrinted, page_pdf AS pagePdf, content, sort_order AS sortOrder
      FROM subsections
      WHERE entry_id = ?
      ORDER BY sort_order ASC
    `,
    )
    .all(id) as EntryDetailResponse['subsections'];

  const docId = String(row.document_id);
  const sortOrder = Number(row.sort_order);

  const prev = db
    .prepare(
      `SELECT id, article_label AS articleLabel, article_title AS articleTitle
       FROM entries WHERE document_id = ? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1`,
    )
    .get(docId, sortOrder) as { id: number; articleLabel: string; articleTitle: string } | undefined;

  const next = db
    .prepare(
      `SELECT id, article_label AS articleLabel, article_title AS articleTitle
       FROM entries WHERE document_id = ? AND sort_order > ? ORDER BY sort_order ASC LIMIT 1`,
    )
    .get(docId, sortOrder) as { id: number; articleLabel: string; articleTitle: string } | undefined;

  return {
    entry: {
      id: Number(row.id),
      documentId: docId,
      documentName: String(row.document_name),
      pdfPath: String(row.pdfPath),
      parentDivision: String(row.parent_division),
      regulation: String(row.regulation),
      section: String(row.section),
      articleLabel: String(row.article_label),
      articleTitle: String(row.article_title),
      pagePrinted: Number(row.page_printed),
      pagePrintedEnd: Number(row.page_printed_end),
      pagePdf: Number(row.page_pdf),
      pagePdfEnd: Number(row.page_pdf_end),
      content: String(row.content),
    },
    subsections,
    neighbors: {
      prev: prev ?? null,
      next: next ?? null,
    },
  };
}

export function browseEntries(params: {
  doc?: string;
  regulation?: string;
  section?: string;
  limit?: number;
  offset?: number;
}): { total: number; items: BrowseEntryItem[] } {
  const db = getDb();
  const where: string[] = [];
  const args: Array<string | number> = [];

  if (params.doc) {
    where.push('e.document_id = ?');
    args.push(params.doc);
  }
  if (params.regulation) {
    where.push('e.regulation = ?');
    args.push(params.regulation);
  }
  if (params.section) {
    where.push('e.section = ?');
    args.push(params.section);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(params.limit ?? 60, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const totalRow = db.prepare(`SELECT COUNT(*) AS cnt FROM entries e ${whereSql}`).get(...args) as { cnt: number };

  const items = db
    .prepare(
      `
      SELECT
        e.id,
        e.document_id AS documentId,
        e.document_name AS documentName,
        e.parent_division AS parentDivision,
        e.regulation,
        e.section,
        e.article_label AS articleLabel,
        e.article_title AS articleTitle,
        e.page_printed AS pagePrinted,
        e.page_printed_end AS pagePrintedEnd,
        e.page_pdf AS pagePdf,
        (SELECT COUNT(*) FROM subsections s WHERE s.entry_id = e.id) AS subsectionCount,
        SUBSTR(REPLACE(e.content, CHAR(10), ' '), 1, 200) AS preview
      FROM entries e
      ${whereSql}
      ORDER BY e.document_id ASC, e.sort_order ASC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...args, limit, offset) as BrowseEntryItem[];

  return { total: totalRow.cnt, items };
}

export function getDocumentsSummary(): DocumentInfo[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        id,
        short_name AS shortName,
        title,
        subtitle,
        pdf_path AS pdfPath,
        total_pdf_pages AS totalPdfPages,
        total_entries AS totalEntries,
        total_subsections AS totalSubsections,
        indexed_at AS indexedAt
      FROM documents
      ORDER BY id ASC
    `,
    )
    .all() as DocumentInfo[];
}

export function getVisitCount(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM site_metrics WHERE key = 'total_visits'")
    .get() as { value: number } | undefined;
  return row ? Number(row.value) : 0;
}

export function incrementVisitCount(): number {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO site_metrics (key, value, updated_at)
      VALUES ('total_visits', 1, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = value + 1,
        updated_at = datetime('now')
    `,
    ).run();
    const row = db
      .prepare("SELECT value FROM site_metrics WHERE key = 'total_visits'")
      .get() as { value: number };
    return Number(row.value);
  });
  return tx();
}
