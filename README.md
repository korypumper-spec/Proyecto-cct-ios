# Buscador Normativo IMSS–SNTSS (Web, Safari, Android e iOS Offline)

Aplicación de consulta jurídico-laboral de alta precisión sobre el **Contrato Colectivo de Trabajo IMSS–SNTSS 2025–2027** (clausulado general, tabulador, profesiogramas, catálogos, 27 reglamentos y convenio adicional) y los **Estatutos del SNTSS (Octubre 2022)**.

Cada búsqueda devuelve la ubicación exacta:
- **Documento**
- **Reglamento / Instrumento**
- **Sección / Capítulo**
- **Artículo / Cláusula**
- **Subsección / Fracción / Inciso**
- **Página impresa y página del PDF**

---

## Compatibilidad multiplataforma

- **Navegadores de escritorio y móvil**: Chrome, Firefox, Edge, Safari (macOS y iOS/iPadOS 15+) con transpilación `es2020`/`safari15`, visor PDF `pdf.js` (`legacy/build`) integrado en canvas, detección automática de modo seguro para Safari/iOS/iPadOS, áreas seguras (`safe-area-inset-*`), `dvh` y prevención de auto-zoom en campos de búsqueda.
- **Android Offline**: Proyecto nativo Capacitor en `android/` (`mx.org.sntss.normativa`).
- **iOS Offline**: Proyecto nativo Capacitor + Swift Package Manager en `ios/` (`mx.org.sntss.normativa`).

---

## Estructura del repositorio

- `src/` — Interfaz React + TypeScript + Tailwind CSS y motor de búsqueda offline (`src/services/normativaClient.ts`).
- `server/` y `server.ts` — Servidor Express opcional con indexador PDF a SQLite FTS5 (`server/ingest.ts`) y exportador de base estática (`server/export-static.ts`).
- `public/assets/aistudio/` — Documentos PDF originales incluidos en el repositorio (`CCT_2025-2027_6a8763f8.pdf` y `estatutos-sntss-rcci-image_9b29b255.pdf`).
- `public/data/normativa-offline.json` — Base documental indexada lista para funcionar sin conexión a internet.
- `public/pdf.worker.min.mjs` — Worker local compatible con Safari/iOS de `pdf.js` (`legacy/build`) para renderizar páginas PDF sin conexión.
- `android/`, `ios/` y `capacitor.config.ts` — Proyectos nativos Android e iOS de Capacitor (`mx.org.sntss.normativa`).
- `.github/workflows/build-android-apk.yml` — Flujo de GitHub Actions para compilar el instalador `.apk` automáticamente en la nube.
- `.github/workflows/build-ios-ipa.yml` — Flujo de GitHub Actions en `macos-latest` para generar el paquete `.ipa` de iOS sin firma (`unsigned`) o abrir en Xcode.

---

## Generar `.apk` (Android) e `.ipa` (iOS) en GitHub

1. Sube todo el contenido del repositorio a tu rama `main` en GitHub.
2. Abre la pestaña **Actions**:
   - **Build Android APK (Offline)** genera el artefacto `normativa-imss-sntss-offline-apk` (`app-debug.apk`).
   - **Build iOS App (Signed / Unsigned IPA + Simulator)** compila la app nativa iOS en `macos-latest` generando `normativa-imss-sntss-offline-ios-signed-ipa` (si configuras certificados Apple en *Secrets*), `normativa-imss-sntss-offline-ios-unsigned-ipa` (sin cuenta Apple Developer) y `normativa-imss-sntss-ios-simulator-app`.
   - Consulta la guía detallada en [`IOS_BUILD.md`](./IOS_BUILD.md) y [`ANDROID_BUILD.md`](./ANDROID_BUILD.md).

---

## Ejecución y compilación local

### Modo web (con servidor Express + SQLite)
```bash
npm install
npm run dev
```

### Generar bundle estático offline y sincronizar Android + iOS
```bash
npm install
npm run cap:sync
```

### Compilar `.apk` localmente (Java 21 + Android SDK)
```bash
cd android
./gradlew assembleDebug
```
El instalador quedará en `android/app/build/outputs/apk/debug/app-debug.apk`.

### Abrir proyecto iOS en macOS (Xcode)
```bash
npm run ios:sync
npx cap open ios
```
