# 🗺️ Sentinel Express - Roadmap

## 1. Fase Actual (Estabilización Beta 0.9.x)
El desarrollo y pruebas actuales están destinados a cerrar funcionalmente la auditoría base.
* **Completado**: Lectura de CFDI 4.0 masiva en navegador. Funcionalidad `Zip`/`DragAndDrop`. Reportes tabulares avanzados e Integración (Frontend + Landing).
* **Completado**: Sistema local de validación con semáforo y Exportación a `.XLSX`.
* **Completado**: Tokenización de accesos para Onboarding directo y sin fricción (Lead Generation).
* **En Curso**: Despliegue de primera campaña y Beta con primeros 5–10 pilotos. (QA de producción en progreso).
* **Por Afinar**: Estabilizar tiempos de ping y latencia SAT SOAP XML Validator para los casos extremos y reportes contables que generen bloqueos temporales por límite HTTP.

---

## 2. Beta Pública y Escalamiento (~ Mes 1 a 3)
La versión `1.0.0` está programada para recibir al público de marketing masivamente:

* **Soporte Completo Multi-Tenant**: Unificar base de datos a `history` sólida para que múltiples clientes procesen lotes paralelamente desde Netlify.
* **Email Onboarding Automático**: Implementar flujos programáticos (`Nodemailer` / SendGrid) cuando un cliente provee un Token de acceso en el lead.
* **Refuerzos Backend**: Integrar BullMQ + Redis o equivalentes de background jobs, listos para recibir lotes encolados asícronos desde el dashboard (ver **Batch Processing Architecture**).
* **Desacople Workers UI**: Migrar WebWorkers del lado del cliente a `ServiceWorkers` paralelos más profundos en React, para garantizar 0% bloqueos del hilo de JS durante mapeos > 15,000 archivos diarios.

---

## 3. Próximas Funcionalidades (Versiones Post 1.0.0)

### 3.1. Sincronización Automática con SAT
Capaz de conectarse vía WS-Security y autenticación de `FIEL` (.cer/.key/.pwd) al Web Service de Descarga Masiva del SAT. Para de este modo evitar cargar XMLs manualmente y obtener la data directamente desde la autoridad mes a mes de manera transparente.

### 3.2. Detección Automática de Cancelados 
Implementar cronjobs en backend (ej: cada 24/48 horas) donde el sistema actualice el "estado real" (Vigente/Cancelado) automáticamente de los XMLs vivos en el dashboard (retrasos de proveedores) sin necesidad de que el usuario pulse [Refrescar SAT] manual. Alertas vía Email si un XML previamente Vigente se convierte en Cancelado.

### 3.3. Dashboard Analítico para Despachos Contables (B2B Multi-Empresa)
Paneles segregados donde un "Despacho" pueda alternar la visibilidad entre múltiples R.F.C. clientes asociados con un control de Roles y Permisos y resúmenes de nivel ejecutivo ($ de impuestos pendientes entre todo su portafolio).

### 3.4. Factura Engine API Rest
Abrir acceso programático mediante "API Keys". Para que sistemas de ERP o facturación internos (de terceros - clientes B2B Empresa / Developers) envíen Webhooks con el Base64 de un XML para obtener al instante el veredicto del semáforo.

---

## 4. Metas a Largo Plazo
* **Validación DIOT Automa** (F324): Parsear resultados del CFDI y cruzar contra el archivo TXT para evitar sanciones relacionadas al flujo del IVA pagado/causado.
* **Auditoría IA predictiva**: Usando modelos de lenguaje para clasificar Gastos y analizar descripciones ambiguas y deducibilidad general (`ObjetoImp` y claves Catálogo SAT).
