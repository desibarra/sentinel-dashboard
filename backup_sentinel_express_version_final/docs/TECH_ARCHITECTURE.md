# 🏗️ Sentinel Express - Tech Architecture

## 1. Visión General del Sistema
Sentinel Express está diseñado con una arquitectura **Frontend-heavy y de privacidad primero**. 

El núcleo del modelo de negocio depende de que los archivos XML altamente sensibles (facturas) **nunca abandonen el navegador del cliente**. Esto obliga a migrar la pesada carga de procesamiento de XMLs, que tradicionalmente se hace en servidores monolíticos, al lado del cliente mediante Web APIs y Workers eficientes.

---

## 2. Tecnologías (Stack Core)
* **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui.
* **Backend**: Node.js, Express, `axios`.
* **Database**: SQLite (archivos locales, `sqlite3`).
* **Deploy/Hosting**: Netlify (`netlify.toml` para serverless functions o frontend hosting) + VPS / Local para el backend PM2.

---

## 3. Frontend Architecture
El frontend se encarga de la captura, decodificación (XML `DOMParser`), procesamiento lógico complejo e interfaz de usuario.
* **Ruteo (`App.tsx` / `wouter`)**: Controla las vistas de `Landing`, `Login`, `Dashboard` (App) y `Admin`.
* **Motor de Reglas Fiscales (`client/src/lib/cfdiEngine.ts`)**: El "cerebro" central de validación. Analiza y extrae Nodos, Complementos y Regímenes a partir del string XML puro, devolviendo un objeto `ValidationResult` exhaustivo.
* **Mapeador Causal (`utils/diagnosticRules.ts`)**: Interpreta la matrix de resultados y la clasifica en el Sistema de Semáforos (🟢 Usable, 🟡 Alerta, 🔴 No Usable, ⚪️ Otro). Evalúa retenciones nulas, faltantes de complementos y errores lógicos de montos.
* **Workers y Concurrencia (`hooks/useXMLValidator.ts`)**: Lee de manera optimizada los archivos *File[]* mediante concurrencia con límite (Chunks) para prevenir bloqueos de Memoria RAM en navegadores al inyectar miles de archivos.

---

## 4. Backend (Node.js API)
El backend actúa principalmente como un **proxy transaccional** ligero y manejador de credenciales o estados asincrónicos, no como el procesador de Big Data.

* **Endpoints Principales (`server/api.ts`)**:
  - `/api/auth/login`: Para administradores, usando JWT e ingreso protegido.
  - `/api/history`: Las resoluciones (únicamente metadatos y JSON de la validación sin XML crudos) se serializan y suben aquí como backups de historiales, atados a `user_id` / `company_id`.
  - `/api/sat/validate`: Un **Proxy SOAP** esencial. El navegador no puede mandar peticiones XMLHttpRequest al SAT libremente debido a CORS strict restrictions. El backend Express envía las peticiones SOAP a la web service de "Verifica CFDI" del SAT (`verificacfdi.facturaelectronica.sat.gob.mx`) burlando el origen cruzado y sirviendo la respuesta formateada de estatus, vigencia y cancelaciones.
  - `/api/xml/:id`: Un endpoint "placeholder" diseñado para *Soft Deletes* (bajas lógicas), mandando UUIDs borrados para su descarte visual en la sesión.

---

## 5. Security & Deployment Structure
* **Autenticación (Usuarios)**:
  - Tokens de invitación y acceso (`?token=XYZ`) que otorgan a la sesión un "Company ID" asociado, verificados a través del hook local.
  - JWT Tokens y Auth Middleware para las consultas administradoras a la API REST.

* **Despliegues (Netlify + PM2)**:
  - Frontend: Generado vía `vite build`. Las directivas de `netlify.toml` garantizan que todos los endpoints SPA como `/dashboard` reescriban correctamente a `index.html`. Las variables de entorno `NODE_VERSION` controlan la compilación estándar UTF-8 de la UI.
  - Backend: El servidor (`server/index.ts`) integra la base de SQLite local y es instanciado en entornos VPS a través del orquestador PM2 (`ecosystem.config.cjs`) configurado para variables de producción y escuchando en el puerto designado (ej. `:3002`).

* **Consideraciones de Encoding (UTF-8)**:
  - La interacción multiplataforma maneja forzosos correctores `TextDecoder("windows-1252")` en caso de errores legacy con codificación local para preservar símbolos (ej. Copyright © o tildes) si los XML vienen de sistemas contables arcaicos.
