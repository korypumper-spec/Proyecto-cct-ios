# Compilación iOS Offline (GitHub Actions + Xcode)

El proyecto incluye el proyecto nativo de **Capacitor iOS** con **Swift Package Manager** en `ios/App/` (`mx.org.sntss.normativa`, compatible con **iOS 15.0+** en iPhone y iPad) y el workflow `.github/workflows/build-ios-ipa.yml` sobre `macos-latest`.

## 1. Compilación automática sin certificado Apple (modo gratuito / Sideload & Simulador)

Al hacer `push` a `main`/`master` o lanzar manualmente **Actions → Build iOS App (Signed / Unsigned IPA + Simulator)** sin configurar secretos de Apple:

1. Ejecuta `npm run lint` (`tsc --noEmit`), `npm run build` (`vite build`) y `npx cap sync ios`.
2. Verifica que el paquete offline completo (`index.html`, `normativa-offline.json`, `pdf.worker.min.mjs`, `CCT_2025-2027_6a8763f8.pdf` y `estatutos-sntss-rcci-image_9b29b255.pdf`) esté integrado dentro de `ios/App/App/public/`.
3. Resuelve `CapApp-SPM` (`Capacitor` y `Cordova` `8.6.2`) con Swift Package Manager.
4. Compila el binario nativo ARM64 (`-sdk iphoneos -destination 'generic/platform=iOS' archive`) y genera dos artefactos descargables:
   - **`normativa-imss-sntss-offline-ios-unsigned-ipa`**: contiene `normativa-imss-sntss-offline-unsigned.ipa` (listo para firmar e instalar con **AltStore**, **Sideloadly**, o re-firmar en Xcode).
   - **`normativa-imss-sntss-ios-simulator-app`**: contiene `App.app` compilado para **iOS Simulator** (arrastrable directamente al Simulador de Xcode en macOS).

---

## 2. Compilación oficial firmada (.ipa listo para iPhone / TestFlight / App Store)

Si cuentas con cuenta de **Apple Developer**, agrega estos secretos en **Settings → Secrets and variables → Actions**:

| Secret | Descripción |
| :--- | :--- |
| `APPLE_CERTIFICATE_BASE64` | Archivo `.p12` de tu certificado (`Apple Distribution` o `Apple Development`) codificado en Base64. |
| `APPLE_CERTIFICATE_PASSWORD` | Contraseña del archivo `.p12`. |
| `APPLE_PROVISIONING_PROFILE_BASE64` | Archivo `.mobileprovision` para el Bundle ID `mx.org.sntss.normativa` codificado en Base64. |
| `APPLE_TEAM_ID` *(opcional)* | ID de equipo de 10 caracteres (si se omite, el workflow lo extrae automáticamente del `.mobileprovision`). |
| `APPLE_EXPORT_METHOD` *(opcional)* | `app-store-connect`, `ad-hoc` o `development` (si se omite, se detecta automáticamente desde el perfil). |

### Cómo convertir tus archivos en Base64 (macOS / Linux):
```bash
base64 -i Certificado.p12 | tr -d '\n'
base64 -i Perfil.mobileprovision | tr -d '\n'
```

Cuando los 3 secretos obligatorios están presentes, el workflow crea un llavero temporal seguro en macOS, firma el archivo `.xcarchive`, ejecuta `xcodebuild -exportArchive` y publica el artefacto **`normativa-imss-sntss-offline-ios-signed-ipa`** (`normativa-imss-sntss-offline-signed.ipa`), limpiando el llavero y perfil al finalizar.

---

## 3. Compilación local en macOS con Xcode

```bash
npm install
npm run ios:sync
npx cap open ios
```
En Xcode selecciona tu equipo en **Signing & Capabilities** para `mx.org.sntss.normativa` y ejecuta en dispositivo físico o simulador.
