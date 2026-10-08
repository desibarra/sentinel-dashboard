# Despliegue completo en `sentinel.wibby.cloud`

Este procedimiento instala el frontend y Express en `srv1324384` con PM2, Nginx, TLS de Let's Encrypt y SQLite en `/var/lib/sentinel/sentinel.db`. No requiere Netlify en producción. Los comandos remotos de este documento deben ejecutarse manualmente; no se ejecutan desde el repositorio.

## 1. Publicar la rama

Desde el checkout local de la rama `feat/vps-migration`, revisar el staging para no incluir archivos temporales locales:

```bash
git status --short
git add .npmrc client server deploy ecosystem.config.cjs netlify.toml package.json package-lock.json pnpm-lock.yaml scripts/create-admin.ts scripts/import-legacy-token-stores.ts scripts/reset-admin.ts scripts/backup-db.sh DEPLOY.md docs/DEPLOY_NOTES.md docs/TECH_ARCHITECTURE.md
git add -u netlify/functions
git diff --cached --check
git commit -m "Prepare full Sentinel VPS deployment" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin feat/vps-migration
```

## 2. Conectar y actualizar el checkout

Con una instalación previa:

```bash
ssh srv1324384
cd /opt/sentinel-express
git fetch origin
git switch feat/vps-migration
git pull --ff-only origin feat/vps-migration
```

Instalación inicial: clona en `/opt/sentinel-express` usando la URL SSH real del repositorio:

```bash
ssh srv1324384
sudo install -d -o "$USER" -g "$USER" -m 755 /opt/sentinel-express
git clone --branch feat/vps-migration <URL_SSH_DEL_REPO> /opt/sentinel-express
cd /opt/sentinel-express
```

## 3. Instalar, compilar y confirmar que el puerto esté libre

Usa Node.js 20 o posterior. `sqlite3` incluye binding nativo; instala compiladores para que npm pueda construirlo si no encuentra un binario precompilado:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
cd /opt/sentinel-express
npm ci
npm config get ignore-scripts
node -e "require('sqlite3')"
npm run check
npm run build
sudo ss -ltnp | grep ':3187' || echo 'No aparece ningún listener en 3187'
```

`npm config get ignore-scripts` debe imprimir `false`; `node -e "require('sqlite3')"` debe terminar sin error. `.npmrc` conserva la resolución de peer dependencies requerida por el proyecto para que `npm ci` use el mismo modo de resolución.

Si `3187` está ocupado, elige otro puerto y actualízalo tanto en `ecosystem.config.cjs` como en `deploy/nginx/sentinel.wibby.cloud.conf` antes de continuar.

## 4. Crear almacenamiento persistente vacío

```bash
sudo install -d -o "$USER" -g "$USER" -m 750 /var/lib/sentinel
sudo install -d -o "$USER" -g "$USER" -m 750 /var/backups/sentinel
```

El VPS empieza con una base limpia: **no copies ni subas `data/sentinel.db`**. La aplicación creará `/var/lib/sentinel/sentinel.db` y su esquema vacío cuando arranque en el paso 6.

## 5. Guardar secretos fuera del repositorio

PM2 carga `JWT_SECRET` y `ADMIN_TOKENS_PASSWORD` de variables del proceso del usuario que ejecuta PM2. Créalo fuera del checkout y no lo añadas al repositorio:

```bash
sudo install -d -o "$USER" -g "$USER" -m 700 /etc/sentinel
(umask 077; printf 'JWT_SECRET=%s\nADMIN_TOKENS_PASSWORD=%s\n' "$(openssl rand -hex 64)" "$(openssl rand -hex 32)" > /etc/sentinel/sentinel.env)
sudo chown "$USER:$USER" /etc/sentinel/sentinel.env
sudo chmod 600 /etc/sentinel/sentinel.env
```

Para cargar el entorno de forma interactiva antes de los comandos PM2:

```bash
set -a
. /etc/sentinel/sentinel.env
set +a
```

Si ya existe `admin` y se va a restablecer su clave:

## 6. Arrancar Sentinel para crear la base vacía

```bash
cd /opt/sentinel-express
set -a
. /etc/sentinel/sentinel.env
set +a
pm2 start ecosystem.config.cjs --update-env
pm2 status sentinel
pm2 logs sentinel --lines 100 --nostream
pm2 startup systemd -u "$USER" --hp "$HOME"
```

Ejecuta el comando `sudo` exacto que `pm2 startup` imprima y guarda la lista de procesos:

```bash
pm2 save
test -f /var/lib/sentinel/sentinel.db
```

El primer arranque crea el esquema SQLite vacío. No se crea el usuario `admin` automáticamente.

## 7. Crear el administrador

```bash
cd /opt/sentinel-express
DB_PATH=/var/lib/sentinel/sentinel.db npm run create-admin
```

El comando solicita dos veces una contraseña oculta de al menos 12 caracteres y falla sin cambiar nada si `admin` ya existe.

## 8. Importar tokens de Netlify Blobs y JSONBin y verificar conteos

La importación debe ejecutarse antes de retirar las cuentas o credenciales de origen. Agrega temporalmente al archivo `/etc/sentinel/sentinel.env` los valores de `NETLIFY_SITE_ID`, `NETLIFY_API_TOKEN`, `JSONBIN_MASTER_KEY` y `JSONBIN_BIN_ID`, luego vuelve a cargarlo:

```bash
sudoedit /etc/sentinel/sentinel.env
cd /opt/sentinel-express
set -a
. /etc/sentinel/sentinel.env
set +a
DB_PATH=/var/lib/sentinel/sentinel.db npm run import:legacy-tokens
```

La salida del importador indica cuántos registros encontró en el origen (nuevos más los que ya existían). Comprueba en Netlify Blobs y JSONBin los conteos de origen y compáralos con los de la base del VPS:

```bash
sqlite3 -header -column /var/lib/sentinel/sentinel.db "
SELECT
  COUNT(*) AS application_tokens,
  SUM(CASE WHEN store_name = 'sentinel-tokens' THEN 1 ELSE 0 END) AS netlify_blobs,
  SUM(CASE WHEN store_name = 'jsonbin-tokens' THEN 1 ELSE 0 END) AS jsonbin,
  SUM(CASE
    WHEN json_valid(data)
      AND json_extract(data, '\$.status') = 'pending'
      AND json_extract(data, '\$.email') IS NOT NULL
      AND json_extract(data, '\$.phone') IS NOT NULL
    THEN 1 ELSE 0
  END) AS lead_records
FROM application_tokens;
"
```

El esquema actual **no tiene una tabla `leads` separada**: `/api/functions/lead-capture` guarda cada lead como registro en `application_tokens`; `lead_records` cuenta los que tienen estado `pending`, correo y teléfono. En una base limpia, compara `application_tokens` y los subtotales `netlify_blobs`/`jsonbin` con los conteos de sus orígenes, y `lead_records` con los leads pendientes en Netlify. Investiga cualquier diferencia antes de retirar credenciales o datos de origen. La importación añade registros ausentes y no sobrescribe claves existentes.

## 9. Configurar Nginx para Cloudflare y emitir el certificado

Antes de emitir TLS, confirma que el registro DNS de `sentinel.wibby.cloud` apunta a la IP pública del VPS y que los puertos 80/443 llegan a Nginx. El archivo del repo incluye `real_ip_header CF-Connecting-IP` y los rangos publicados por Cloudflare en [cloudflare.com/ips](https://www.cloudflare.com/ips/). Confirma que la lista siga vigente antes de aplicar; si cambia, actualiza todas las directivas `set_real_ip_from`. El firewall debe permitir tráfico web desde Cloudflare y no exponer directamente el puerto `3187`.

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx sqlite3
sudo cp /opt/sentinel-express/deploy/nginx/sentinel.wibby.cloud.conf /etc/nginx/sites-available/sentinel.wibby.cloud.conf
sudo ln -s /etc/nginx/sites-available/sentinel.wibby.cloud.conf /etc/nginx/sites-enabled/sentinel.wibby.cloud.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d sentinel.wibby.cloud --redirect
```

En Cloudflare usa cifrado **Full (strict)** y restringe conexiones de origen a sus rangos oficiales. `app.set("trust proxy", 1)` confía en el salto Nginx; Nginx reconstruye `remote_addr` desde `CF-Connecting-IP` solo cuando la conexión viene de un rango de Cloudflare. Los rate limits de Express usan por tanto la IP real normalizada por Nginx. No cambies Express para confiar ciegamente en ese header: el puerto de Node debe seguir limitado a loopback/firewall.

## 10. Cambiar DNS y repetir la importación

En Cloudflare, cambia el registro `sentinel.wibby.cloud` a la IP del VPS y confirma que la URL responde con HTTPS. Después del cambio de DNS, y mientras las credenciales de origen sigan disponibles, repite la importación para capturar leads/tokens que hayan llegado al despliegue viejo durante el corte:

```bash
ssh srv1324384
cd /opt/sentinel-express
set -a
. /etc/sentinel/sentinel.env
set +a
DB_PATH=/var/lib/sentinel/sentinel.db npm run import:legacy-tokens
```

La importación se puede repetir: incorpora únicamente claves nuevas y conserva los datos que ya existen en SQLite. Retira `NETLIFY_SITE_ID`, `NETLIFY_API_TOKEN`, `JSONBIN_MASTER_KEY` y `JSONBIN_BIN_ID` del archivo secreto solo después de comprobar que la segunda ejecución no dejó registros pendientes.

## 11. Verificar y configurar backup diario

Comprueba manualmente login, dashboard, gestión de tokens, alta de leads, enlaces de acceso demo y validación SOAP del SAT. El administrador debe haberse creado o restablecido en los pasos 5/7, antes del corte.

Instala y prueba el backup:

```bash
cd /opt/sentinel-express
bash -n scripts/backup-db.sh
sudo install -o "$USER" -g "$USER" -m 750 /opt/sentinel-express/scripts/backup-db.sh /usr/local/sbin/sentinel-backup-db
/usr/local/sbin/sentinel-backup-db
```

Agrega el cron diario a las 03:00 (hora local del VPS) como el usuario propietario de la base:

```cron
0 3 * * * /usr/local/sbin/sentinel-backup-db >> /var/backups/sentinel/backup.log 2>&1
```

El script guarda en `/var/backups/sentinel/`, usa SQLite `.backup` para una copia consistente y elimina backups `sentinel-*.db` con más de 14 días.

## 12. Completar el corte y apagar Netlify

[`client/public/_redirects`](./client/public/_redirects) está listo para devolver una redirección permanente `301` de todo el tráfico a `https://sentinel.wibby.cloud/:splat`. Úsalo solo si se mantiene un dominio de Netlify que deba redirigir; para dejar de usar Netlify por completo, actualiza el DNS/dominio y desactiva deploys automáticos, Functions y Forms en Netlify cuando la verificación post-corte esté completa.

Tras el segundo import y la validación, Netlify Blobs, sus Functions y JSONBin ya no participan en runtime. Puedes retirar sus credenciales. Conserva la base SQLite del VPS y su carpeta de backups.

## Pendientes post-despliegue

- Migrar a sqlite3@6 en rama aparte.
