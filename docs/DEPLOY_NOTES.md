# Notas de Despliegue - Identidad Visual Mentores Estratégicos

Este documento detalla los cambios realizados para alinear el Dashboard de Sentinel Express con la identidad visual de Mentores Estratégicos.

## Archivos Modificados

### Estilos y Temas
- `client/src/index.css`: Se actualizaron las variables de CSS (`--primary`, `--accent`, etc.) para usar el Azul Marino (#0B2340) y Amarillo (#F9C646). Se refinaron los colores de los "semáforos" fiscales.
- `client/src/pages/Dashboard.tsx`: Se aplicó el tema visual a las tarjetas, botones y se reemplazó el icono genérico del header por el logo oficial circular.
- `client/src/components/UploadZone.tsx`: Alineación de colores de carga y estados.
- `client/src/components/CFDISATStatus.tsx`: Refinamiento de badges de estatus SAT con tonos elegantes.
- `client/src/components/HistorySidebar.tsx`: Actualización de colores en el historial local.
- `client/src/components/CompanySelector.tsx`: Ajuste de colores en el selector de empresas.

### Activos y Favicons
- `client/public/assets/logo.png`: Logo oficial (círculo azul con flecha).
- `client/public/favicon.ico`: Favicon multiresolución.
- `client/public/favicon-16x16.png`, `32x32.png`, `48x48.png`, `96x96.png`.
- `client/public/apple-touch-icon.png`: Versión para iOS (180x180).
- `client/public/android-chrome-192x192.png`, `512x512.png`: Versiones para Android/PWA.
- `client/public/site.webmanifest`: Manifiesto de la aplicación.
- `client/index.html`: Vinculación de todos los metadatos de iconos y manifest.

## Proceso de Despliegue en Netlify

La aplicación está configurada para **Despliegue Continuo**. Para aplicar los cambios en producción:

1. Realizar commit de los cambios locales.
2. Hacer **push** a la rama principal (main/master) del repositorio conectado.
3. Netlify detectará el push y generará automáticamente un nuevo despliegue en:
   [https://leafy-longma-cc440e.netlify.app/](https://leafy-longma-cc440e.netlify.app/)

No es necesario realizar ninguna configuración adicional en el panel de Netlify.
