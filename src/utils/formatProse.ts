const TABULAR_ROW_RE = /\d[\d,]*\.\d{2}\b.*\d[\d,]*\.\d{2}\b/;
const TRAILING_CONNECTOR_RE =
  /\b(?:de|del|la|las|el|los|en|y|o|u|a|e|por|para|con|sin|al|que|su|sus|un|una|unos|unas|entre|sobre|hacia|desde|hasta|según|mediante)$/i;
const HEADING_START_RE =
  /^(?:Cláusula|Artículo|Declaración|CAPÍTULO|SECCIÓN|REGLAMENTO|TÍTULO|TRANSITORI|ANEXO)/i;
const LIST_ITEM_START_RE = /^(?:[IVXLC]+\.-|[a-z]\)|[0-9]+[.)]|•|- |– )/i;

function isTabularLine(line: string): boolean {
  return TABULAR_ROW_RE.test(line);
}

/**
 * Reflows hard PDF column line-wraps into continuous paragraphs so mobile
 * `text-align: justify` aligns lines edge-to-edge while preserving intentional
 * headings, colons, list markers, and salary/tabulador rows.
 */
export function formatProseForDisplay(text: string): string {
  if (!text) return '';
  const rawLines = text.split(/\r?\n/);
  const out: string[] = [];

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) {
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      continue;
    }

    if (out.length === 0 || out[out.length - 1] === '') {
      out.push(line);
      continue;
    }

    const prev = out[out.length - 1];
    const prevEndsSentenceOrColon = /[.:;!?»”"]$/.test(prev);
    const prevLooksLikeHeading =
      ((HEADING_START_RE.test(prev) && prev.length < 85) ||
        (prev.length < 44 && !TRAILING_CONNECTOR_RE.test(prev) && !/[,;]$/.test(prev))) &&
      /^[A-ZÁÉÍÓÚÑ0-9]/.test(line);
    const currStartsListOrHeading =
      LIST_ITEM_START_RE.test(line) || HEADING_START_RE.test(line);

    if (
      isTabularLine(prev) ||
      isTabularLine(line) ||
      prevEndsSentenceOrColon ||
      prevLooksLikeHeading ||
      currStartsListOrHeading
    ) {
      out.push(line);
    } else if (prev.endsWith('-') && !prev.endsWith('.-') && /^[a-záéíóúñ]/.test(line)) {
      out[out.length - 1] = prev.slice(0, -1) + line;
    } else {
      out[out.length - 1] = `${prev} ${line}`;
    }
  }

  return out.join('\n').trim();
}
