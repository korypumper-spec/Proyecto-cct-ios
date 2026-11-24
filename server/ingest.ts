import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getDb, normalizeForSearch } from './db.ts';

interface PageLine {
  text: string;
  pagePrinted: number;
  pagePdf: number;
}

interface ParsedSubsection {
  subsectionLabel: string;
  pagePrinted: number;
  pagePdf: number;
  content: string;
}

interface ParsedEntry {
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
  lines: PageLine[];
}

interface RegulationRange {
  start: number;
  end: number;
  name: string;
}

const CCT_REGULATIONS: RegulationRange[] = [
  { start: 275, end: 277, name: 'Reglamento de Actividades Deportivas' },
  { start: 278, end: 286, name: 'Reglamento de Becas para la Capacitación de los Trabajadores del Seguro Social' },
  { start: 287, end: 297, name: 'Reglamento de Bolsa de Trabajo' },
  { start: 298, end: 310, name: 'Reglamento de Bolsa de Trabajo para los Trabajadores del Programa IMSS-Bienestar' },
  { start: 311, end: 317, name: 'Reglamento para la Calificación y Selección de Puestos de Confianza "B"' },
  { start: 318, end: 332, name: 'Reglamento de Capacitación y Adiestramiento' },
  { start: 333, end: 338, name: 'Reglamento de Conductores de Vehículos al Servicio del IMSS' },
  { start: 339, end: 356, name: 'Reglamento de Escalafón' },
  { start: 357, end: 363, name: 'Reglamento del Fondo de Retiro para Trabajadores del IMSS' },
  { start: 364, end: 372, name: 'Reglamento de Guarderías para Hijos de Trabajadores del IMSS' },
  { start: 373, end: 388, name: 'Reglamento de Infectocontagiosidad y Emanaciones Radiactivas' },
  { start: 389, end: 414, name: 'Reglamento Interior de Trabajo' },
  { start: 415, end: 425, name: 'Régimen de Jubilaciones y Pensiones' },
  { start: 426, end: 433, name: 'Reglamento de Médicos Residentes en Período de Adiestramiento en una Especialidad' },
  { start: 434, end: 439, name: 'Reglamento para el Pago de Pasajes' },
  { start: 440, end: 445, name: 'Reglamento de la Comisión Nacional Paritaria de Protección al Salario' },
  { start: 446, end: 455, name: 'Reglamento de Préstamos para el Fomento de la Habitación de los Trabajadores' },
  { start: 456, end: 460, name: 'Reglamento para los Trabajadores del Programa IMSS-Bienestar' },
  { start: 461, end: 474, name: 'Reglamento de Resguardo Patrimonial' },
  { start: 475, end: 481, name: 'Reglamento de la Comisión Nacional Mixta de Revisión de Plantillas' },
  { start: 482, end: 508, name: 'Reglamento de Ropa de Trabajo y Uniformes' },
  { start: 509, end: 511, name: 'Reglamento de Creación y Transformación de Plazas N34 a Médico General Autónomo' },
  { start: 512, end: 522, name: 'Reglamento de la Comisión Nacional Mixta de Seguridad e Higiene' },
  { start: 523, end: 529, name: 'Reglamento de Selección de Recursos Humanos para Cambio de Rama' },
  { start: 530, end: 532, name: 'Reglamento para el Suministro de Alimentos a Personal de Unidades Médico-Hospitalarias' },
  { start: 533, end: 537, name: 'Reglamento de Tiendas para Empleados del IMSS' },
  { start: 538, end: 542, name: 'Reglamento de Viáticos para Chóferes' },
];

async function extractAllPdfLines(filePath: string): Promise<Array<{ pagePdf: number; lines: string[] }>> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const result: Array<{ pagePdf: number; lines: string[] }> = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows: Array<{ y: number; items: Array<{ x: number; w: number; str: string }> }> = [];

    for (const rawItem of tc.items) {
      if (!('str' in rawItem) || !rawItem.str) continue;
      const x = rawItem.transform[4];
      const y = Math.round(rawItem.transform[5] / 2) * 2;
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, w: rawItem.width || 0, str: rawItem.str });
    }

    rows.sort((a, b) => b.y - a.y);
    const lines = rows
      .map((r) => {
        r.items.sort((a, b) => a.x - b.x);
        let text = '';
        let prevEnd: number | null = null;
        for (const it of r.items) {
          if (prevEnd !== null && it.x - prevEnd > 2 && !text.endsWith(' ') && !it.str.startsWith(' ')) {
            text += ' ';
          }
          text += it.str;
          prevEnd = it.x + it.w;
        }
        return text.replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean);

    result.push({ pagePdf: p, lines });
  }

  return result;
}

function cleanCctPageLines(pagePdf: number, rawLines: string[]): string[] {
  const cleaned: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    // Standalone page number at top or bottom
    if (/^\d{1,3}$/.test(line) && Number(line) === pagePdf) continue;
    if (i <= 2 || i >= rawLines.length - 2) {
      if (/^(CONTRATO COLECTIVO DE TRABAJO|REGLAMENTOS|PROFESIOGRAMAS|CAT[ÁA]LOGOS|TABULADOR DE SUELDOS BASE)$/i.test(line)) {
        continue;
      }
    }
    // Strip repeated ALL CAPS regulation/convenio running header at top of page (first 3 lines)
    if (pagePdf >= 275 && pagePdf <= 550 && i <= 3) {
      const upper = line.toUpperCase();
      if (
        line === upper &&
        line.length >= 6 &&
        /^(REGLAMENTO|R[ÉE]GIMEN|CONVENIO|DEL SEGURO|DEL PROGRAMA|BIENESTAR|TRABAJADORES|SEGURO SOCIAL|DE LOS|PARA LOS|PARA EL|EN PER[IÍ]ODO|ADICIONAL|COMISI[ÓO]N NACIONAL|N34|MEDICO|M[ÉE]DICO|INGRESO|BASE DE NUEVO|PENSIONES DE LOS|SUSTITUTO|CH[ÓO]FERES|HABITACI[ÓO]N|UNIFORMES|ALIMENTOS|PLANTILLAS|SALARIO|PASAJES|ADIESTRAMIENTO|INFECTOCONTAGIOSIDAD|ESCALAF[ÓO]N|RESGUARDO|SEGURIDAD E HIGIENE|CAMBIO DE RAMA|TIENDAS|GUARDER[IÍ]AS|BOLSA DE TRABAJO|FONDO DE RETIRO|ACTIVIDADES DEPORTIVAS|CAPACITACI[ÓO]N|CONDUCTORES|CONFIANZA)/.test(
          upper,
        ) &&
        !/^(ART[IÍ]CULO|CAP[IÍ]TULO|TRANSITORIO|DECLARACIONES|PRIMERA|SEGUNDA|CL[ÁA]USULA|TABLA)/.test(upper)
      ) {
        continue;
      }
    }
    cleaned.push(line);
  }
  return cleaned;
}

function cleanEstatutosPageLines(pagePdf: number, rawLines: string[]): { pagePrinted: number; lines: string[] } {
  const pagePrinted = pagePdf - 3;
  const cleaned: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/^SINDICATO NACIONAL DE TRABAJADORES DEL SEGURO SOCIAL$/i.test(line)) continue;
    if (/^[“"]?SEGURIDAD SOCIAL Y BIENESTAR ECON[ÓO]MICO DE LOS TRABAJADORES[”"]?$/i.test(line)) continue;
    if (/^\d{1,2}$/.test(line) && Number(line) === pagePrinted) continue;
    cleaned.push(line);
  }
  return { pagePrinted, lines: cleaned };
}

function splitSubsections(lines: PageLine[]): ParsedSubsection[] {
  if (lines.length === 0) return [];

  const chunks: ParsedSubsection[] = [];
  let currentFraction = '';
  let currentLabel = 'Disposición general';
  let currentLines: PageLine[] = [];

  const flush = () => {
    const text = currentLines.map((l) => l.text).join('\n').trim();
    if (!text) return;
    chunks.push({
      subsectionLabel: currentLabel,
      pagePrinted: currentLines[0].pagePrinted,
      pagePdf: currentLines[0].pagePdf,
      content: text,
    });
    currentLines = [];
  };

  for (const line of lines) {
    const t = line.text;
    // Detect Apartado A / B / C
    const apartadoMatch = t.match(/^(Apartado\s+[A-Z0-9]+|[A-Z]\.\s+Apartado\b)/i);
    // Detect Roman numeral Fraccion: I., II., III., IV., ... XL.
    const romanMatch = t.match(/^((?:X{0,3})(?:IX|IV|V?I{1,3}|X{1,3}))\.\s+(.+)/);
    // Detect Letter inciso: a), b), a.-, b.-
    const incisoParenMatch = t.match(/^([a-zñ])\)\s+(.+)/i);
    const incisoDotMatch = t.match(/^([a-z])\.\s+([A-ZÁÉÍÓÚÑ].+)/);
    // Detect Numeral: 1., 2., 6A., 1.-
    const numMatch = t.match(/^(\d{1,2}[A-Z]?)\.(?:-|\s)\s*(.+)/);

    if (apartadoMatch) {
      flush();
      currentFraction = apartadoMatch[1].trim();
      currentLabel = currentFraction;
      currentLines.push(line);
    } else if (romanMatch && romanMatch[1] !== 'I' || (romanMatch && romanMatch[1] === 'I' && !/^[I]\.\s+(Grupo|Catálogo)/i.test(t))) {
      flush();
      currentFraction = `Fracción ${romanMatch[1]}`;
      currentLabel = currentFraction;
      currentLines.push(line);
    } else if (incisoParenMatch) {
      flush();
      const inc = `Inciso ${incisoParenMatch[1].toLowerCase()})`;
      currentLabel = currentFraction ? `${currentFraction} · ${inc}` : inc;
      currentLines.push(line);
    } else if (incisoDotMatch && !/^[A-Z]\.\s*$/.test(t)) {
      flush();
      const inc = `Inciso ${incisoDotMatch[1].toLowerCase()})`;
      currentLabel = currentFraction ? `${currentFraction} · ${inc}` : inc;
      currentLines.push(line);
    } else if (numMatch) {
      flush();
      const numLabel = `Numeral ${numMatch[1]}`;
      currentLabel = currentFraction ? `${currentFraction} · ${numLabel}` : numLabel;
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  // If there's only 1 chunk labeled "Disposición general", keep it clean
  if (chunks.length === 1 && chunks[0].subsectionLabel === 'Disposición general') {
    chunks[0].subsectionLabel = 'Texto íntegro';
  }

  return chunks;
}

function parseCctDocument(pages: Array<{ pagePdf: number; lines: string[] }>): ParsedEntry[] {
  const entries: ParsedEntry[] = [];

  const getRegName = (p: number): string => {
    const found = CCT_REGULATIONS.find((r) => p >= r.start && p <= r.end);
    return found ? found.name : 'Reglamento';
  };

  // 1. Declaración & Presentación (pages 3-6)
  for (const [pNum, label, title] of [
    [3, 'Declaración', 'Declaración Conjunta IMSS–SNTSS'],
    [5, 'Presentación', 'Presentación del Contrato Colectivo de Trabajo 2025–2027'],
  ] as Array<[number, string, string]>) {
    const raw = pages[pNum - 1]?.lines ?? [];
    const lines = cleanCctPageLines(pNum, raw).map((text) => ({ text, pagePrinted: pNum, pagePdf: pNum }));
    if (lines.length > 0) {
      entries.push({
        documentId: 'cct-2025-2027',
        documentName: 'CCT 2025–2027',
        parentDivision: '1. Contrato Colectivo de Trabajo',
        regulation: 'Clausulado General CCT',
        section: 'Preliminares',
        articleLabel: label,
        articleTitle: title,
        pagePrinted: pNum,
        pagePrintedEnd: pNum,
        pagePdf: pNum,
        pagePdfEnd: pNum,
        lines,
      });
    }
  }

  // 2. Clausulado General CCT + Transitorias (pages 11-87)
  let currentChapter = 'Capítulo I.- Definiciones';
  let currentEntry: ParsedEntry | null = null;
  let inTransitorias = false;

  const flushEntry = () => {
    if (currentEntry && currentEntry.lines.length > 0) {
      entries.push(currentEntry);
    }
    currentEntry = null;
  };

  for (let p = 11; p <= 87; p++) {
    const lines = cleanCctPageLines(p, pages[p - 1]?.lines ?? []);
    for (const line of lines) {
      // Chapter header
      const capMatch = line.match(/^(Cap[íi]tulo\s+[IVXLC]+(?:\s*\.-|\.-|\s*-|\s*:)?\s*.*)$/i);
      if (capMatch && line.length < 110 && !/^Cap[íi]tulo\s+[IVXLC]+\s+(de|del|y|o)\b/i.test(line)) {
        currentChapter = capMatch[1].trim();
        inTransitorias = false;
        continue;
      }

      if (/^Transitorias$/i.test(line)) {
        flushEntry();
        inTransitorias = true;
        currentChapter = 'Cláusulas Transitorias';
        continue;
      }

      // Cláusula header: e.g. "Cláusula 47.- Vacaciones" or "Cláusula 55 Bis.-" or "Cláusula 153Bis.-"
      const clausulaMatch = !inTransitorias ? line.match(/^(Cl[áa]usula\s+\d+\s*(?:Bis)?)\s*\.-?\s*(.*)$/i) : null;
      // Avoid inline sentence references like "Cláusula 47 del presente contrato"
      if (clausulaMatch && (line.includes('.-') || line.length < 95) && !/^(Cl[áa]usula\s+\d+\s*(?:Bis)?)\s+(de|del|y|o|establece|señala|a que|se|no)\b/i.test(line)) {
        flushEntry();
        const label = clausulaMatch[1].replace(/\s+/g, ' ').replace(/(\d)(Bis)/i, '$1 Bis').trim();
        const title = clausulaMatch[2].replace(/^\.-?\s*/, '').trim() || label;
        currentEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '1. Contrato Colectivo de Trabajo',
          regulation: 'Clausulado General CCT',
          section: currentChapter,
          articleLabel: label,
          articleTitle: title,
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted: p, pagePdf: p }],
        };
        continue;
      }

      // Transitoria header: e.g. "1a. El presente Contrato..."
      const transMatch = inTransitorias ? line.match(/^(\d{1,2}a\.)\s+(.+)$/) : null;
      if (transMatch) {
        flushEntry();
        const num = transMatch[1];
        const snippetTitle = transMatch[2].slice(0, 72).trim() + (transMatch[2].length > 72 ? '…' : '');
        currentEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '1. Contrato Colectivo de Trabajo',
          regulation: 'Clausulado General CCT',
          section: 'Cláusulas Transitorias',
          articleLabel: `Transitoria ${num}`,
          articleTitle: snippetTitle,
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted: p, pagePdf: p }],
        };
        continue;
      }

      if (currentEntry) {
        currentEntry.lines.push({ text: line, pagePrinted: p, pagePdf: p });
        currentEntry.pagePrintedEnd = p;
        currentEntry.pagePdfEnd = p;
      }
    }
  }
  flushEntry();

  // 3. Tabulador de Sueldos Base (pages 90-103) — group by job group / section
  let currentTabSection = 'Tabulador General de Sueldos Base';
  let tabEntry: ParsedEntry | null = null;
  const flushTab = () => {
    if (tabEntry && tabEntry.lines.length > 0) entries.push(tabEntry);
    tabEntry = null;
  };
  for (let p = 90; p <= 103; p++) {
    const lines = cleanCctPageLines(p, pages[p - 1]?.lines ?? []);
    for (const line of lines) {
      if (/^(Jor-\s*Sueldo|CATEGOR[IÍ]A\s+nada)/i.test(line)) continue;
      const isSectionHeading =
        (line === line.toUpperCase() && line.length >= 4 && !/\d{3}/.test(line) && !/^AUT\.?$/i.test(line)) ||
        /^(M[ÉE]DICOS RESIDENTES|PROGRAMA IMSS)/i.test(line);

      if (isSectionHeading) {
        flushTab();
        currentTabSection = line.trim();
        tabEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '2. Tabulador de Sueldos Base',
          regulation: 'Tabulador de Sueldos Base',
          section: currentTabSection,
          articleLabel: `Tabulador · ${currentTabSection}`,
          articleTitle: `Categorías y sueldos: ${currentTabSection}`,
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [],
        };
        continue;
      }

      if (!tabEntry) {
        tabEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '2. Tabulador de Sueldos Base',
          regulation: 'Tabulador de Sueldos Base',
          section: currentTabSection,
          articleLabel: `Tabulador · ${currentTabSection}`,
          articleTitle: currentTabSection,
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [],
        };
      }
      tabEntry.lines.push({ text: line, pagePrinted: p, pagePdf: p });
      tabEntry.pagePrintedEnd = p;
      tabEntry.pagePdfEnd = p;
    }
  }
  flushTab();

  // 4. Profesiogramas (pages 106-261) — each category as an entry
  let profGroup = 'I. Grupo de profesionales';
  let profEntry: ParsedEntry | null = null;
  const flushProf = () => {
    if (profEntry && profEntry.lines.length > 0) entries.push(profEntry);
    profEntry = null;
  };
  for (let p = 106; p <= 261; p++) {
    const lines = cleanCctPageLines(p, pages[p - 1]?.lines ?? []);
    for (const line of lines) {
      const grpMatch = line.match(/^([IVX]+\.\s+(?:Grupo|Centros|Categor[íi]as|Unidades|Trabajadores).+)$/i);
      if (grpMatch) {
        flushProf();
        profGroup = grpMatch[1].trim();
        continue;
      }
      // Category heading like "Pasante de Abogado.- Categoría Autónoma" or "Enfermera General.- ..."
      const catMatch = line.match(/^([A-ZÁÉÍÓÚÑ][^.:]{2,85})\.-\s*(Categor[íi]a\s+Aut[óo]noma|Pie\s+de\s+Rama|Rama\s+.+|Nivel\s+.+|.+)$/i);
      if (
        catMatch &&
        !/^(Requisitos|Relaciones de mando|Movimientos escalafonarios|Actividades)\s*:/i.test(line) &&
        (line.includes('Categoría') || line.includes('Pie de Rama') || line.includes('Rama ') || line.includes('.- '))
      ) {
        // Avoid splitting on sentences that happen to contain ".- "
        if (catMatch[1].split(' ').length <= 12) {
          flushProf();
          const catName = catMatch[1].trim();
          const catType = catMatch[2].trim();
          profEntry = {
            documentId: 'cct-2025-2027',
            documentName: 'CCT 2025–2027',
            parentDivision: '3. Profesiogramas',
            regulation: 'Profesiogramas',
            section: profGroup,
            articleLabel: catName,
            articleTitle: catType ? `${catName} (${catType})` : catName,
            pagePrinted: p,
            pagePrintedEnd: p,
            pagePdf: p,
            pagePdfEnd: p,
            lines: [{ text: line, pagePrinted: p, pagePdf: p }],
          };
          continue;
        }
      }
      if (profEntry) {
        profEntry.lines.push({ text: line, pagePrinted: p, pagePdf: p });
        profEntry.pagePrintedEnd = p;
        profEntry.pagePdfEnd = p;
      }
    }
  }
  flushProf();

  // 5. Catálogos (pages 265-271)
  let catEntry: ParsedEntry | null = null;
  const flushCat = () => {
    if (catEntry && catEntry.lines.length > 0) entries.push(catEntry);
    catEntry = null;
  };
  for (let p = 265; p <= 271; p++) {
    const lines = cleanCctPageLines(p, pages[p - 1]?.lines ?? []);
    for (const line of lines) {
      const catHead = line.match(/^([IVX]+\.\s+Cat[áa]logo\s+Abierto.+)$/i);
      if (catHead) {
        flushCat();
        const title = catHead[1].trim();
        catEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '4. Catálogos',
          regulation: 'Catálogos Abiertos',
          section: title,
          articleLabel: title.split(' ')[0] + ' ' + title.split(' ').slice(1, 4).join(' '),
          articleTitle: title,
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted: p, pagePdf: p }],
        };
        continue;
      }
      if (catEntry) {
        catEntry.lines.push({ text: line, pagePrinted: p, pagePdf: p });
        catEntry.pagePrintedEnd = p;
        catEntry.pagePdfEnd = p;
      }
    }
  }
  flushCat();

  // 6. Reglamentos (pages 275-542)
  let currentReg = '';
  let currentRegCap = 'Disposiciones Generales';
  let regEntry: ParsedEntry | null = null;
  let inRegTrans = false;

  const flushReg = () => {
    if (regEntry && regEntry.lines.length > 0) entries.push(regEntry);
    regEntry = null;
  };

  for (let p = 275; p <= 542; p++) {
    const regName = getRegName(p);
    if (regName !== currentReg) {
      flushReg();
      currentReg = regName;
      currentRegCap = 'Disposiciones Generales';
      inRegTrans = false;
    }

    const lines = cleanCctPageLines(p, pages[p - 1]?.lines ?? []);
    for (const line of lines) {
      const capMatch = line.match(/^(Cap[íi]tulo\s+[IVXLC]+(?:\s*\.-|\.-|\s*-|\s*:|\s+).*)$/i);
      if (capMatch && line.length < 115 && !/^Cap[íi]tulo\s+[IVXLC]+\s+(de|del|y|o|de este)\b/i.test(line)) {
        currentRegCap = capMatch[1].trim();
        inRegTrans = false;
        continue;
      }

      if (/^(TRANSITORIOS?|ART[IÍ]CULOS TRANSITORIOS?)$/i.test(line)) {
        flushReg();
        inRegTrans = true;
        currentRegCap = 'Transitorios';
        continue;
      }

      // Artículo header: "Artículo 1.", "Artículo 30 Bis.", "Artículo 1.-"
      const artMatch = line.match(/^(Art[íi]culo\s+\d+\s*(?:Bis|Ter)?)\s*[.\-:]+\s*(.*)$/i);
      if (
        artMatch &&
        !/^(Art[íi]culo\s+\d+\s*(?:Bis|Ter)?)\s+(de|del|y|o|establece|señala|a que|se)\b/i.test(line)
      ) {
        flushReg();
        const label = artMatch[1].replace(/\s+/g, ' ').trim();
        const rest = artMatch[2].trim();
        const title = rest ? (rest.length > 85 ? `${rest.slice(0, 82).trim()}…` : rest) : label;
        regEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '5. Reglamentos',
          regulation: currentReg,
          section: currentRegCap,
          articleLabel: label,
          articleTitle: title,
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted: p, pagePdf: p }],
        };
        continue;
      }

      // Transitorio article inside regulation (PRIMERO., SEGUNDO., 1o., Único.)
      const transArtMatch = inRegTrans
        ? line.match(/^((?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|[ÚU]NICO|\d+o?)\.?)\s*(?:-|\s)\s*(.+)$/i)
        : null;
      if (transArtMatch) {
        flushReg();
        const label = `Transitorio ${transArtMatch[1].replace(/\.$/, '')}`;
        const rest = transArtMatch[2].trim();
        regEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '5. Reglamentos',
          regulation: currentReg,
          section: 'Transitorios',
          articleLabel: label,
          articleTitle: rest.slice(0, 82) + (rest.length > 82 ? '…' : ''),
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted: p, pagePdf: p }],
        };
        continue;
      }

      // Fallback: if a regulation page (e.g. Ropa de Trabajo tables or RJP tables) has content before/outside articles
      if (!regEntry && line.length > 10 && !/^(REGLAMENTO|R[ÉE]GIMEN)/i.test(line)) {
        regEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '5. Reglamentos',
          regulation: currentReg,
          section: currentRegCap,
          articleLabel: 'Texto Introductorio / Anexos',
          articleTitle: currentReg,
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [],
        };
      }

      if (regEntry) {
        regEntry.lines.push({ text: line, pagePrinted: p, pagePdf: p });
        regEntry.pagePrintedEnd = p;
        regEntry.pagePdfEnd = p;
      }
    }
  }
  flushReg();

  // 7. Convenio Adicional para las Jubilaciones y Pensiones (pages 545-550)
  let convSec = 'Declaraciones';
  let convEntry: ParsedEntry | null = null;
  const flushConv = () => {
    if (convEntry && convEntry.lines.length > 0) entries.push(convEntry);
    convEntry = null;
  };
  for (let p = 545; p <= 550; p++) {
    const lines = cleanCctPageLines(p, pages[p - 1]?.lines ?? []);
    for (const line of lines) {
      if (/^DECLARACIONES$/i.test(line)) {
        convSec = 'Declaraciones';
        continue;
      }
      if (/^CL[ÁA]USULAS$/i.test(line)) {
        convSec = 'Cláusulas';
        continue;
      }
      const declMatch = line.match(/^((?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA)\.-)\s*(.+)$/i);
      if (declMatch) {
        flushConv();
        convEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '6. Convenio Adicional de Jubilaciones y Pensiones',
          regulation: 'Convenio Adicional de Jubilaciones y Pensiones (Nuevo Ingreso)',
          section: convSec,
          articleLabel: `Declaración ${declMatch[1].replace('.-', '')}`,
          articleTitle: declMatch[2].slice(0, 82) + (declMatch[2].length > 82 ? '…' : ''),
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted: p, pagePdf: p }],
        };
        continue;
      }
      const clMatch = line.match(/^(\d{1,2})\.\s+(.+)$/);
      if (clMatch && convSec === 'Cláusulas') {
        flushConv();
        convEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '6. Convenio Adicional de Jubilaciones y Pensiones',
          regulation: 'Convenio Adicional de Jubilaciones y Pensiones (Nuevo Ingreso)',
          section: 'Cláusulas del Convenio',
          articleLabel: `Cláusula ${clMatch[1]}`,
          articleTitle: clMatch[2].slice(0, 82) + (clMatch[2].length > 82 ? '…' : ''),
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted: p, pagePdf: p }],
        };
        continue;
      }
      const tablaMatch = line.match(/^(TABLA\s+[A-C]\b.*)$/i);
      if (tablaMatch) {
        flushConv();
        convSec = 'Tablas Actuariales';
        convEntry = {
          documentId: 'cct-2025-2027',
          documentName: 'CCT 2025–2027',
          parentDivision: '6. Convenio Adicional de Jubilaciones y Pensiones',
          regulation: 'Convenio Adicional de Jubilaciones y Pensiones (Nuevo Ingreso)',
          section: 'Tablas Actuariales',
          articleLabel: tablaMatch[1].trim(),
          articleTitle: tablaMatch[1].trim(),
          pagePrinted: p,
          pagePrintedEnd: p,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted: p, pagePdf: p }],
        };
        continue;
      }

      if (convEntry) {
        convEntry.lines.push({ text: line, pagePrinted: p, pagePdf: p });
        convEntry.pagePrintedEnd = p;
        convEntry.pagePdfEnd = p;
      }
    }
  }
  flushConv();

  return entries;
}

function parseEstatutosDocument(pages: Array<{ pagePdf: number; lines: string[] }>): ParsedEntry[] {
  const entries: ParsedEntry[] = [];

  // Pages 4-6: Declaración de Principios
  const declLines: PageLine[] = [];
  for (let p = 4; p <= 6; p++) {
    const { pagePrinted, lines } = cleanEstatutosPageLines(p, pages[p - 1]?.lines ?? []);
    for (const line of lines) {
      if (/^DECLARACI[ÓO]N DE PRINCIPIOS$/i.test(line)) continue;
      if (/^CAP[IÍ]TULO PRIMERO/i.test(line)) break;
      declLines.push({ text: line, pagePrinted, pagePdf: p });
    }
  }
  if (declLines.length > 0) {
    entries.push({
      documentId: 'estatutos-sntss-2022',
      documentName: 'Estatutos SNTSS 2022',
      parentDivision: 'Declaración de Principios',
      regulation: 'Estatutos SNTSS (Octubre 2022)',
      section: 'Declaración de Principios',
      articleLabel: 'Declaración de Principios',
      articleTitle: 'Principios rectores e independencia sindical del SNTSS',
      pagePrinted: 1,
      pagePrintedEnd: 3,
      pagePdf: 4,
      pagePdfEnd: 6,
      lines: declLines,
    });
  }

  // Pages 7-71: Capítulos Primero..Décimo Tercero & Artículos Transitorios
  let currentChapter = 'CAPÍTULO PRIMERO';
  let currentChapterTitle = 'Constitución, Denominación, Domicilio, Objeto y Lema';
  let currentSubSection = '';
  let currentEntry: ParsedEntry | null = null;
  let expectingChapterTitle = false;
  let inTransitorios = false;

  const flushEntry = () => {
    if (currentEntry && currentEntry.lines.length > 0) entries.push(currentEntry);
    currentEntry = null;
  };

  for (let p = 7; p <= 71; p++) {
    const { pagePrinted, lines } = cleanEstatutosPageLines(p, pages[p - 1]?.lines ?? []);
    for (const line of lines) {
      if (
        p === 71 &&
        (/^(Ciudad de M[ée]xico|POR EL COMIT[ÉE]|EL SECRETARIO GENERAL|DR\. ARTURO)/i.test(line))
      ) {
        continue;
      }

      const capMatch = line.match(/^(CAP[IÍ]TULO\s+(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO(?:\s+PRIMERO|\s+SEGUNDO|\s+TERCERO)?))$/i);
      if (capMatch) {
        currentChapter = capMatch[1].toUpperCase();
        currentChapterTitle = '';
        currentSubSection = '';
        expectingChapterTitle = true;
        inTransitorios = false;
        continue;
      }

      if (expectingChapterTitle) {
        if (!/^ART[IÍ]CULO\s+/i.test(line)) {
          currentChapterTitle = line.replace(/\s+\.$/, '').trim();
          expectingChapterTitle = false;
          continue;
        }
        expectingChapterTitle = false;
      }

      if (/^ART[IÍ]CULOS TRANSITORIOS$/i.test(line)) {
        flushEntry();
        inTransitorios = true;
        currentChapter = 'ARTÍCULOS TRANSITORIOS';
        currentChapterTitle = 'Disposiciones Transitorias (LXI Congreso Nacional Ordinario)';
        currentSubSection = '';
        continue;
      }

      // Subsection heading inside chapter, e.g. "Del Secretario General", "De las Secciones", "De la Comisión de Honor y Justicia"
      if (
        !inTransitorios &&
        /^(De\s+l[ao]s?\s+|Del\s+|De\s+su\s+|De\s+los\s+)/.test(line) &&
        line.length < 90 &&
        !line.endsWith('.') &&
        !/\b(que|cuando|para|como|será|tendrá|estará)\b/i.test(line)
      ) {
        currentSubSection = line.trim();
        continue;
      }

      const artMatch = line.match(/^(ART[IÍ]CULO\s+\d+(?:\s+BIS)?)\s*\.?\s*-?\s*(.*)$/i);
      // Match strictly uppercase "ARTÍCULO" headings to avoid inline lowercase references
      if (artMatch && /^ART[IÍ]CULO\s+\d+/.test(line)) {
        flushEntry();
        const label = artMatch[1].replace(/\s+/g, ' ').replace('ARTÍCULO', 'Artículo').replace('BIS', 'Bis');
        const rest = artMatch[2].trim();
        const secFull = currentChapterTitle
          ? currentSubSection
            ? `${currentChapter} · ${currentChapterTitle} — ${currentSubSection}`
            : `${currentChapter} · ${currentChapterTitle}`
          : currentChapter;
        const titleSource = currentSubSection || rest;
        const title = titleSource.length > 85 ? `${titleSource.slice(0, 82).trim()}…` : titleSource || label;

        currentEntry = {
          documentId: 'estatutos-sntss-2022',
          documentName: 'Estatutos SNTSS 2022',
          parentDivision: currentChapter,
          regulation: 'Estatutos SNTSS (Octubre 2022)',
          section: secFull,
          articleLabel: label,
          articleTitle: title,
          pagePrinted,
          pagePrintedEnd: pagePrinted,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted, pagePdf: p }],
        };
        continue;
      }

      const transMatch = inTransitorios
        ? line.match(/^((?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO)\s+TRANSITORIO)\s*\.\s*(.*)$/i)
        : null;
      if (transMatch) {
        flushEntry();
        const label = transMatch[1]
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const rest = transMatch[2].trim();
        currentEntry = {
          documentId: 'estatutos-sntss-2022',
          documentName: 'Estatutos SNTSS 2022',
          parentDivision: 'ARTÍCULOS TRANSITORIOS',
          regulation: 'Estatutos SNTSS (Octubre 2022)',
          section: 'Artículos Transitorios · LXI Congreso Nacional Ordinario',
          articleLabel: label,
          articleTitle: rest.slice(0, 82) + (rest.length > 82 ? '…' : ''),
          pagePrinted,
          pagePrintedEnd: pagePrinted,
          pagePdf: p,
          pagePdfEnd: p,
          lines: [{ text: line, pagePrinted, pagePdf: p }],
        };
        continue;
      }

      if (currentEntry) {
        currentEntry.lines.push({ text: line, pagePrinted, pagePdf: p });
        currentEntry.pagePrintedEnd = pagePrinted;
        currentEntry.pagePdfEnd = p;
      }
    }
  }
  flushEntry();

  return entries;
}

export async function runIngestion(force = false): Promise<{ documents: number; entries: number; subsections: number }> {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM documents').get() as { cnt: number };
  const entryCount = db.prepare('SELECT COUNT(*) AS cnt FROM entries').get() as { cnt: number };

  if (!force && existing.cnt >= 2 && entryCount.cnt > 500) {
    const subCount = db.prepare('SELECT COUNT(*) AS cnt FROM subsections').get() as { cnt: number };
    return { documents: existing.cnt, entries: entryCount.cnt, subsections: subCount.cnt };
  }

  const cctPath = path.resolve(process.cwd(), 'public/assets/aistudio/CCT_2025-2027_6a8763f8.pdf');
  const estPath = path.resolve(process.cwd(), 'public/assets/aistudio/estatutos-sntss-rcci-image_9b29b255.pdf');

  const cctPages = await extractAllPdfLines(cctPath);
  const estPages = await extractAllPdfLines(estPath);

  const cctEntries = parseCctDocument(cctPages);
  const estEntries = parseEstatutosDocument(estPages);
  const allEntries = [...cctEntries, ...estEntries];

  const now = new Date().toISOString();

  const insertAll = db.transaction(() => {
    db.exec(`
      DELETE FROM entries_fts;
      DELETE FROM subsections;
      DELETE FROM entries;
      DELETE FROM documents;
    `);

    const insertDoc = db.prepare(`
      INSERT INTO documents (id, short_name, title, subtitle, pdf_path, total_pdf_pages, total_entries, total_subsections, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateDocCounts = db.prepare(`
      UPDATE documents SET total_entries = ?, total_subsections = ? WHERE id = ?
    `);

    insertDoc.run(
      'cct-2025-2027',
      'CCT 2025–2027',
      'Contrato Colectivo de Trabajo IMSS–SNTSS 2025–2027',
      'Clausulado General, Tabulador, Profesiogramas, Catálogos, 27 Reglamentos y Convenio Adicional',
      '/assets/aistudio/CCT_2025-2027_6a8763f8.pdf',
      cctPages.length,
      0,
      0,
      now,
    );

    insertDoc.run(
      'estatutos-sntss-2022',
      'Estatutos SNTSS 2022',
      'Estatutos del Sindicato Nacional de Trabajadores del Seguro Social',
      'Declaración de Principios, Capítulos I–XIII y Artículos Transitorios (Octubre 2022)',
      '/assets/aistudio/estatutos-sntss-rcci-image_9b29b255.pdf',
      estPages.length,
      0,
      0,
      now,
    );

    const insertEntry = db.prepare(`
      INSERT INTO entries (
        document_id, document_name, parent_division, regulation, section,
        article_label, article_title, page_printed, page_printed_end,
        page_pdf, page_pdf_end, content, search_text, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSubsection = db.prepare(`
      INSERT INTO subsections (
        entry_id, document_id, subsection_label, page_printed, page_pdf, content, search_text, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFts = db.prepare(`
      INSERT INTO entries_fts (
        entry_id, subsection_id, document_id, article_label, article_title,
        section, regulation, subsection_label, content_folded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let totalEntries = 0;
    let totalSubsections = 0;
    const countsByDoc: Record<string, { entries: number; subsections: number }> = {
      'cct-2025-2027': { entries: 0, subsections: 0 },
      'estatutos-sntss-2022': { entries: 0, subsections: 0 },
    };

    allEntries.forEach((entry, idx) => {
      const fullContent = entry.lines.map((l) => l.text).join('\n').trim();
      if (!fullContent) return;

      const entryFolded = normalizeForSearch(
        `${entry.articleLabel} ${entry.articleTitle} ${entry.section} ${entry.regulation} ${fullContent}`,
      );

      const res = insertEntry.run(
        entry.documentId,
        entry.documentName,
        entry.parentDivision,
        entry.regulation,
        entry.section,
        entry.articleLabel,
        entry.articleTitle,
        entry.pagePrinted,
        entry.pagePrintedEnd,
        entry.pagePdf,
        entry.pagePdfEnd,
        fullContent,
        entryFolded,
        idx + 1,
      );

      const entryId = Number(res.lastInsertRowid);
      totalEntries++;
      countsByDoc[entry.documentId].entries++;

      // Index entry header + full content as entry-level FTS row
      insertFts.run(
        entryId,
        null,
        entry.documentId,
        normalizeForSearch(entry.articleLabel),
        normalizeForSearch(entry.articleTitle),
        normalizeForSearch(entry.section),
        normalizeForSearch(entry.regulation),
        '',
        normalizeForSearch(fullContent),
      );

      const subs = splitSubsections(entry.lines);
      subs.forEach((sub, subIdx) => {
        const subFolded = normalizeForSearch(sub.content);
        const subRes = insertSubsection.run(
          entryId,
          entry.documentId,
          sub.subsectionLabel,
          sub.pagePrinted,
          sub.pagePdf,
          sub.content,
          subFolded,
          subIdx + 1,
        );
        const subId = Number(subRes.lastInsertRowid);
        totalSubsections++;
        countsByDoc[entry.documentId].subsections++;

        insertFts.run(
          entryId,
          subId,
          entry.documentId,
          normalizeForSearch(entry.articleLabel),
          normalizeForSearch(entry.articleTitle),
          normalizeForSearch(entry.section),
          normalizeForSearch(entry.regulation),
          normalizeForSearch(sub.subsectionLabel),
          subFolded,
        );
      });
    });

    updateDocCounts.run(
      countsByDoc['cct-2025-2027'].entries,
      countsByDoc['cct-2025-2027'].subsections,
      'cct-2025-2027',
    );
    updateDocCounts.run(
      countsByDoc['estatutos-sntss-2022'].entries,
      countsByDoc['estatutos-sntss-2022'].subsections,
      'estatutos-sntss-2022',
    );

    return { documents: 2, entries: totalEntries, subsections: totalSubsections };
  });

  return insertAll();
}

export async function ensureDatabaseSeeded(): Promise<void> {
  const stats = await runIngestion(false);
  console.log(
    `[normativa-db] Ready: ${stats.documents} documents, ${stats.entries} articles/clauses, ${stats.subsections} subsections indexed.`,
  );
}

// Allow direct execution: `tsx server/ingest.ts` or `node server/ingest.ts`
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const force = process.argv.includes('--force');
  const stats = await runIngestion(force);
  console.log('Ingestion complete:', stats);
}
