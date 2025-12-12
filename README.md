# Registro de Horas Gasteiz - Aplicación con Autenticación OAuth

## 🚀 Características

✅ **Portada de Acceso**
- Acceso como visitante (sin login)
- Acceso con cuenta (Google o Microsoft)

✅ **Autenticación OAuth 2.0**
- Login con Google (Google Identity Services)
- Login con Microsoft (MSAL)
- Sesión persistente (24 horas)

✅ **Almacenamiento en la Nube**
- Guardado automático en Google Drive
- Guardado automático en OneDrive
- Solo disponible para usuarios autenticados

✅ **Funcionalidad Completa**
- Registro de turnos (normales, nocturnas, festivas)
- Exportación a PDF profesional
- Historial de meses anteriores
- Modo oscuro/claro
- 100% Responsive (Mobile-First)

---

## 📋 Configuración Requerida

### 1. Obtener Credenciales de Google

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita las siguientes APIs:
   - Google Drive API
   - Google Identity Services
4. Ve a "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth 2.0"
5. Configura la pantalla de consentimiento OAuth
6. Añade los orígenes autorizados:
   ```
   http://localhost:5500
   http://127.0.0.1:5500
   https://tu-dominio.com
   ```
7. Copia el **Client ID** (formato: `xxxxx.apps.googleusercontent.com`)

### 2. Obtener Credenciales de Microsoft

1. Ve a [Azure Portal](https://portal.azure.com/)
2. Navega a "Azure Active Directory" → "App registrations"
3. Crea un nuevo registro de aplicación
4. Configura:
   - Nombre: "Registro Horas Gasteiz"
   - Tipo de cuenta: "Cuentas en cualquier directorio organizativo y cuentas personales de Microsoft"
   - URI de redirección: `http://localhost:5500` (Web)
5. En "Autenticación", habilita:
   - Tokens de acceso
   - Tokens de ID
6. En "Permisos de API", añade:
   - Microsoft Graph → `User.Read`
   - Microsoft Graph → `Files.ReadWrite`
7. Copia el **Application (client) ID**

### 3. Configurar la Aplicación

Edita el archivo `src/auth.js` y reemplaza las credenciales:

```javascript
// Líneas 4-5
const GOOGLE_CLIENT_ID = 'TU_GOOGLE_CLIENT_ID_AQUI.apps.googleusercontent.com';
const MICROSOFT_CLIENT_ID = 'TU_MICROSOFT_CLIENT_ID_AQUI';
```

---

## 🛠️ Instalación y Uso

### Opción 1: Servidor Local Simple

```bash
# Con Python 3
python -m http.server 5500

# Con Node.js (npx)
npx serve -p 5500

# Con PHP
php -S localhost:5500
```

### Opción 2: Live Server (VS Code)

1. Instala la extensión "Live Server"
2. Click derecho en `index.html` → "Open with Live Server"

### Opción 3: Despliegue en Producción

1. Sube los archivos a tu hosting
2. Actualiza los **Orígenes autorizados** en Google Cloud Console
3. Actualiza las **URIs de redirección** en Azure Portal

---

## 📁 Estructura de Archivos

```
primordial-protostar/
├── index.html              # Página principal con landing page
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── src/
│   ├── auth.js            # ⭐ Módulo de autenticación OAuth
│   ├── main.js            # Lógica principal de la app
│   └── style.css          # Estilos responsive
└── public/
    ├── clock.svg          # Logo
    └── icon.png           # Icono PWA
```

---

## 🔐 Flujo de Autenticación

### Visitante (Sin Login)
1. Click en "Acceso Visitante"
2. Acceso completo a la app
3. ❌ No puede guardar PDFs en la nube
4. ✅ Puede descargar PDFs localmente

### Usuario con Cuenta
1. Click en "Acceso con Cuenta"
2. Selecciona Google o Microsoft
3. Autoriza permisos (Drive o OneDrive)
4. ✅ Acceso completo + guardado en la nube
5. ✅ Sesión persistente (24h)

---

## ☁️ Guardado en la Nube

### Google Drive
- Los PDFs se guardan en la raíz de "Mi unidad"
- Permisos: Solo archivos creados por la app
- API: Google Drive API v3

### OneDrive
- Los PDFs se guardan en la raíz de OneDrive
- Permisos: Lectura/escritura de archivos
- API: Microsoft Graph API

### Configuración en el PDF
- Checkbox "Guardar automáticamente en la nube"
- Aparece solo si el usuario está autenticado
- Indica el proveedor (Drive o OneDrive)

---

## 🎨 Personalización

### Colores del Tema

Edita `src/style.css` (líneas 6-19):

```css
:root {
  --color-red: #DC2626;      /* Color principal */
  --color-green: #16A34A;    /* Color de éxito */
  --color-black: #0F172A;    /* Texto principal */
  --color-white: #FFFFFF;    /* Fondo claro */
}
```

### Textos de la Landing Page

Edita `index.html` (líneas 22-75):

```html
<h1 class="landing-title">Tu Título Aquí</h1>
<p class="landing-subtitle">Tu subtítulo aquí</p>
```

---

## 🐛 Solución de Problemas

### Error: "La biblioteca de Google no se ha cargado"
- Verifica que tienes conexión a internet
- Comprueba que el script de Google está en `index.html`
- Revisa la consola del navegador para errores de CORS

### Error: "No hay token de acceso"
- El usuario debe autorizar los permisos de Drive/OneDrive
- Cierra sesión y vuelve a iniciar sesión
- Verifica que los scopes están correctos en `auth.js`

### Los PDFs no se guardan en la nube
- Verifica que el checkbox "Guardar en la nube" está marcado
- Comprueba que el usuario no es visitante
- Revisa la consola para errores de API

### CORS en desarrollo local
- Usa un servidor local (no abras el archivo directamente)
- Añade `http://localhost:PUERTO` a los orígenes autorizados
- Usa HTTPS en producción

---

## 📱 PWA (Progressive Web App)

La aplicación es instalable como PWA:

1. Abre la app en Chrome/Edge móvil
2. Menú → "Añadir a pantalla de inicio"
3. La app se abre en modo standalone (sin navegador)

---

## 🔒 Seguridad

✅ **OAuth 2.0**: Autenticación segura sin almacenar contraseñas
✅ **Tokens en memoria**: Los access tokens no se guardan en localStorage
✅ **HTTPS recomendado**: Para producción, usa siempre HTTPS
✅ **Permisos mínimos**: Solo acceso a archivos creados por la app

---

## 📄 Licencia

Este proyecto es de código abierto. Puedes usarlo, modificarlo y distribuirlo libremente.

---

## 🤝 Soporte

Si tienes problemas:

1. Revisa la consola del navegador (F12)
2. Verifica que las credenciales OAuth están correctas
3. Comprueba que las APIs están habilitadas en Google Cloud / Azure
4. Asegúrate de usar un servidor local (no `file://`)

---

## 🎯 Próximas Mejoras

- [ ] Sincronización automática con la nube
- [ ] Exportación a Excel
- [ ] Notificaciones push
- [ ] Modo offline completo
- [ ] Compartir PDFs por email

---

**¡Listo para usar!** 🚀

Recuerda configurar tus credenciales OAuth antes de empezar.
