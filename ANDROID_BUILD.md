# Compilación del Instalador `.apk` (Capacitor Android Offline)

Esta aplicación incluye todo el acervo normativo (**CCT IMSS–SNTSS 2025–2027** y **Estatutos SNTSS 2022**), su base indexada (`public/data/normativa-offline.json`), el visor de páginas PDF (`public/pdf.worker.min.mjs`) y ambos documentos PDF dentro del paquete de Android para funcionar **100% sin conexión a internet**.

## Opción 1: Compilar localmente con Android Studio / Gradle

Requisitos en tu equipo:
- Node.js 20 o superior
- Java JDK 21 (incluido en Android Studio)
- Android Studio / Android SDK

Pasos:
1. Descarga o abre la carpeta del proyecto e instala dependencias (si aún no están instaladas):
   ```bash
   npm install
   ```
2. Regenera (si modificaste los PDFs) y sincroniza la compilación offline con Android:
   ```bash
   npm run android:sync
   ```
3. Abre la carpeta `android/` en **Android Studio** y selecciona **Build > Build Bundle(s) / APK(s) > Build APK(s)**, o ejecuta por consola:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
4. El instalador generado quedará en:
   `android/app/build/outputs/apk/debug/app-debug.apk`

## Opción 2: Generar el `.apk` automáticamente en la nube (GitHub Actions)

Se incluyó el flujo `.github/workflows/build-android-apk.yml`:
1. Sube este proyecto a un repositorio en GitHub.
2. En la pestaña **Actions**, ejecuta **Build Android APK (Offline)**.
3. Al finalizar, descarga el artefacto `normativa-imss-sntss-offline-apk` con el archivo `app-debug.apk` listo para instalar en dispositivos Android.
