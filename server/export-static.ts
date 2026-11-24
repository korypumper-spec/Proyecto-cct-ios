import fs from 'node:fs';
import path from 'node:path';
import { getDb, getDocumentsSummary, getFilterOptions } from './db.ts';
import { ensureDatabaseSeeded } from './ingest.ts';

interface ExportEntry {
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

interface ExportSubsection {
  id: number;
  entryId: number;
  subsectionLabel: string;
  pagePrinted: number;
  pagePdf: number;
  content: string;
  sortOrder: number;
}

export async function exportOfflineBundle(): Promise<{ outFile: string; bytes: number; entries: number; subsections: number }> {
  await ensureDatabaseSeeded();
  const db = getDb();

  const documents = getDocumentsSummary();
  const filters = getFilterOptions();

  const entries = db
    .prepare(
      `
      SELECT
        id,
        document_id AS documentId,
        document_name AS documentName,
        parent_division AS parentDivision,
        regulation,
        section,
        article_label AS articleLabel,
        article_title AS articleTitle,
        page_printed AS pagePrinted,
        page_printed_end AS pagePrintedEnd,
        page_pdf AS pagePdf,
        page_pdf_end AS pagePdfEnd,
        content,
        sort_order AS sortOrder
      FROM entries
      ORDER BY document_id ASC, sort_order ASC
    `,
    )
    .all() as ExportEntry[];

  const subsections = db
    .prepare(
      `
      SELECT
        id,
        entry_id AS entryId,
        subsection_label AS subsectionLabel,
        page_printed AS pagePrinted,
        page_pdf AS pagePdf,
        content,
        sort_order AS sortOrder
      FROM subsections
      ORDER BY entry_id ASC, sort_order ASC
    `,
    )
    .all() as ExportSubsection[];

  const outDir = path.resolve(process.cwd(), 'public/data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outFile = path.join(outDir, 'normativa-offline.json');
  const payload = JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    documents,
    filters,
    entries,
    subsections,
  });

  fs.writeFileSync(outFile, payload, 'utf8');

  // Copy local pdf.js worker into public/ so offline Android WebView needs no CDN
  const workerSrc = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
  const workerDst = path.resolve(process.cwd(), 'public/pdf.worker.min.mjs');
  if (fs.existsSync(workerSrc)) {
    fs.copyFileSync(workerSrc, workerDst);
  }

  return {
    outFile,
    bytes: Buffer.byteLength(payload, 'utf8'),
    entries: entries.length,
    subsections: subsections.length,
  };
}

const result = await exportOfflineBundle();
console.log(
  `[offline-export] Wrote ${result.outFile} (${(result.bytes / (1024 * 1024)).toFixed(2)} MB): ${result.entries} entries, ${result.subsections} subsections.`,
);
