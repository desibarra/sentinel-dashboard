import os
import re
import csv
import json
import ssl
import shutil
import urllib.request
from datetime import datetime

# Fuentes oficiales del Servicio de Administración Tributaria (SAT)
SAT_69B_URL = "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv"

PUBLIC_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "client", "public"))
CSV_FILE = os.path.join(PUBLIC_DIR, "blacklists", "Listado_69-B.csv")
JSON_FILE = os.path.join(PUBLIC_DIR, "69b.json")
BACKUP_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "backups"))

RFC_PATTERN = re.compile(r'^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$')

# Meses en español para normalizar la fecha oficial del encabezado del SAT
MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}

# Columnas del CSV oficial del SAT 69-B donde está la fecha de publicación de cada situación.
# Se prefiere "Publicación página SAT", fallback "Publicación DOF".
STATUS_DATE_COLS = {
    'presunto':  (5, 7),    # Pub SAT presuntos, Pub DOF presuntos
    'definitivo': (13, 15),  # Pub SAT definitivos, Pub DOF definitivos
    'desvirtuado': (9, 11),  # Pub SAT desvirtuados, Pub DOF desvirtuados
    'sentencia':  (17, 19),  # Pub SAT sentencia favorable, Pub DOF sentencia favorable
}


def parse_date(ddmmyyyy: str):
    """Convierte 'DD/MM/YYYY' a ISO 'YYYY-MM-DD'. Devuelve None si está vacío o no parseable."""
    s = (ddmmyyyy or '').strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def get_status_date(parts, situacion):
    """Devuelve la fecha de publicación oficial para una fila según su situación."""
    sit_lower = (situacion or '').lower()
    cols = None
    for key, value in STATUS_DATE_COLS.items():
        if key in sit_lower:
            cols = value
            break
    if not cols:
        return None
    for col in cols:
        date = parse_date(parts[col]) if col < len(parts) else None
        if date:
            return date
    return None


def extract_official_date(text: str):
    """Extrae 'Información actualizada al DD de MMMM de YYYY' del encabezado del archivo SAT."""
    m = re.search(r'actualiza(?:da|do)?\s+al\s+(\d{1,2})\s+de\s+([a-zA-Záéíóúñ]+)\s+de\s+(\d{4})', text[:4000], re.I)
    if not m:
        return None
    day, month_name, year = m.group(1), m.group(2).lower(), m.group(3)
    month = MONTHS.get(month_name)
    if month is None:
        return None
    try:
        return datetime(int(year), month, int(day)).date().isoformat()
    except ValueError:
        return None


def parse_blacklist(text: str):
    """Convierte el CSV oficial en tuplas (rfc, razon_social, situacion, fecha_publicacion) limpias."""
    # El SAT incluye renglones de encabezado/aviso antes de los datos (blurb + título + encabezado).
    records = []
    for parts in csv.reader(text.splitlines()):
        if len(parts) < 4:
            continue
        rfc = parts[1].strip().upper()
        situacion = parts[3].strip()
        if not RFC_PATTERN.match(rfc) or not situacion:
            continue
        fecha_pub = get_status_date(parts, situacion)
        records.append((rfc, parts[2].strip(), situacion, fecha_pub))
    return records


def dedupe_records(records):
    """Elimina duplicados exactos (rfc + situacion), conservando múltiples situaciones por RFC."""
    seen = set()
    out = []
    for rfc, razon, situ, fecha in records:
        key = (rfc, situ.upper())
        if key in seen:
            continue
        seen.add(key)
        out.append((rfc, razon, situ, fecha))
    return out


def write_outputs(records, fecha_oficial, force_csv=True):
    os.makedirs(os.path.join(PUBLIC_DIR, "blacklists"), exist_ok=True)

    if force_csv or not os.path.exists(CSV_FILE):
        with open(CSV_FILE, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["RFC", "Razon Social", "Situacion", "FechaPublicacion"])
            for rfc, razon, situ, fecha in records:
                writer.writerow([rfc, razon, situ, fecha or ""])

    registros = []
    for rfc, razon, situ, fecha in records:
        rec = {"rfc": rfc, "tipo": "69B", "razonSocial": razon, "situacion": situ}
        if fecha:
            rec["fechaPublicacion"] = fecha
        registros.append(rec)

    payload = {
        "fechaOficial": fecha_oficial,
        "fuente": "SAT - Listado 69-B (Art. 69-B CFF)",
        "registros": registros,
    }
    with open(JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


def backup_existing():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d")
    if os.path.exists(JSON_FILE):
        shutil.copy2(JSON_FILE, os.path.join(BACKUP_DIR, f"69b.json.{stamp}.bak"))
    if os.path.exists(CSV_FILE):
        shutil.copy2(CSV_FILE, os.path.join(BACKUP_DIR, f"Listado_69-B.csv.{stamp}.bak"))


def download():
    print(f"[*] Descargando listado 69-B del SAT desde: {SAT_69B_URL}")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(SAT_69B_URL, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })

    with urllib.request.urlopen(req, context=ctx, timeout=60) as response:
        return response.read().decode('latin-1')


def main():
    print("[*] Creando respaldo de archivos actuales...")
    backup_existing()

    try:
        text = download()
        fecha_oficial = extract_official_date(text)
        print(f"[*] Fecha oficial detectada en el archivo: {fecha_oficial or 'no encontrada'}")
        records = dedupe_records(parse_blacklist(text))
        source = "descarga oficial del SAT"
        force_csv = True
    except Exception as e:
        print(f"[-] Error descargando el archivo del SAT: {e}")
        if not os.path.exists(CSV_FILE):
            print("[-] No existe un CSV local previo. Abortando.")
            return
        print("[!] Usando el CSV local existente como respaldo (última copia válida).")
        with open(CSV_FILE, encoding="utf-8") as f:
            records = dedupe_records(parse_blacklist(f.read()))
        fecha_oficial = None
        source = "CSV local previo (fecha oficial no comprobada)"
        force_csv = False

    if not records:
        print("[-] Error: No se encontraron RFCs válidos en el documento.")
        return

    unique_rfcs = len({r for r, _, _, _ in records})
    con_fecha = sum(1 for _, _, _, f in records if f)
    print(f"[*] {source}")
    print(f"[*] Filas normalizadas (con multi-situación): {len(records)}")
    print(f"[*] RFC únicos: {unique_rfcs}")
    print(f"[*] Registros con fecha de publicación oficial: {con_fecha} / {len(records)}")

    write_outputs(records, fecha_oficial, force_csv=force_csv)

    if os.path.exists(JSON_FILE):
        with open(JSON_FILE, encoding="utf-8") as f:
            written = json.load(f)
        reg = written.get("registros", [])
        con_fecha_json = sum(1 for r in reg if r.get("fechaPublicacion"))
        print(f"[+] Listado 69-B procesado exitosamente.")
        print(f"[+] Fecha oficial guardada: {written.get('fechaOficial')}")
        print(f"[+] Registros en 69b.json: {len(reg)} (RFC únicos: {len({r['rfc'] for r in reg})})")
        print(f"[+] Registros con fechaPublicacion: {con_fecha_json} / {len(reg)}")
    else:
        print("[-] No se pudo generar 69b.json.")


if __name__ == "__main__":
    main()