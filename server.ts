import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  browseEntries,
  getDocumentsSummary,
  getEntryDetail,
  getFilterOptions,
  getVisitCount,
  incrementVisitCount,
  searchNormativa,
} from './server/db.ts';
import { ensureDatabaseSeeded } from './server/ingest.ts';

const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function createServer(): Promise<void> {
  await ensureDatabaseSeeded();

  const app = express();
  app.use(express.json());

  // Serve public assets directly so PDF files resolve consistently in both dev and prod
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  app.get('/api/health', (_req, res) => {
    const docs = getDocumentsSummary();
    res.json({ ok: true, documents: docs.length });
  });

  app.get('/api/visits', (_req, res) => {
    try {
      res.json({ totalVisits: getVisitCount() });
    } catch (err) {
      console.error('Visits read error:', err);
      res.status(500).json({ error: 'No se pudo consultar el contador de visitas.' });
    }
  });

  app.post('/api/visits', (_req, res) => {
    try {
      res.json({ totalVisits: incrementVisitCount() });
    } catch (err) {
      console.error('Visits increment error:', err);
      res.status(500).json({ error: 'No se pudo registrar la visita.' });
    }
  });

  app.get('/api/documents', (_req, res) => {
    try {
      const documents = getDocumentsSummary();
      res.json({ documents });
    } catch (err) {
      console.error('Error fetching documents:', err);
      res.status(500).json({ error: 'No se pudo consultar la lista de documentos.' });
    }
  });

  app.get('/api/filters', (_req, res) => {
    try {
      const filters = getFilterOptions();
      res.json(filters);
    } catch (err) {
      console.error('Error fetching filter options:', err);
      res.status(500).json({ error: 'No se pudieron cargar los filtros normativos.' });
    }
  });

  app.get('/api/search', (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const doc = typeof req.query.doc === 'string' ? req.query.doc : '';
      const regulation = typeof req.query.regulation === 'string' ? req.query.regulation : '';
      const section = typeof req.query.section === 'string' ? req.query.section : '';
      const article = typeof req.query.article === 'string' ? req.query.article : '';
      const sort = typeof req.query.sort === 'string' ? req.query.sort : 'relevance';
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 30;
      const offset = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;

      const data = searchNormativa({
        q,
        doc,
        regulation,
        section,
        article,
        sort,
        limit: Number.isFinite(limit) ? limit : 30,
        offset: Number.isFinite(offset) ? offset : 0,
      });

      res.json(data);
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: 'Error al ejecutar la búsqueda en la base de datos.' });
    }
  });

  app.get('/api/browse', (req, res) => {
    try {
      const doc = typeof req.query.doc === 'string' ? req.query.doc : '';
      const regulation = typeof req.query.regulation === 'string' ? req.query.regulation : '';
      const section = typeof req.query.section === 'string' ? req.query.section : '';
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 80;
      const offset = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;

      const data = browseEntries({
        doc,
        regulation,
        section,
        limit: Number.isFinite(limit) ? limit : 80,
        offset: Number.isFinite(offset) ? offset : 0,
      });

      res.json(data);
    } catch (err) {
      console.error('Browse error:', err);
      res.status(500).json({ error: 'Error al consultar el índice normativo.' });
    }
  });

  app.get('/api/entries/:id', (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Identificador de artículo inválido.' });
        return;
      }
      const detail = getEntryDetail(id);
      if (!detail) {
        res.status(404).json({ error: 'Artículo o cláusula no encontrada.' });
        return;
      }
      res.json(detail);
    } catch (err) {
      console.error('Entry detail error:', err);
      res.status(500).json({ error: 'Error al recuperar el detalle del artículo.' });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Buscador Normativo IMSS-SNTSS listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
