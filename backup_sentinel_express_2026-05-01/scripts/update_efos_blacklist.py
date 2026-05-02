import os
import re
import csv
import ssl
import urllib.request
import argparse

# Fuentes oficiales del Servicio de Administración Tributaria (SAT)
SAT_69B_URL = "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv"

def download_and_format_blacklist(tipo="69B"):
    out_dir = os.path.join(os.path.dirname(__file__), "..", "client", "public", "blacklists")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "Listado_69-B.csv")
    
    print(f"[*] Descargando listado 69-B del SAT desde: {SAT_69B_URL}")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    req = urllib.request.Request(SAT_69B_URL, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })
    
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            content = response.read().decode('latin-1')
    except Exception as e:
        print(f"[-] Error descargando el archivo del SAT: {e}")
        return

    lines = content.split('\n')
    print(f"[*] Archivo descargado en memoria ({len(lines)} líneas). Procesando y limpiando formato...")
    
    rfc_pattern = re.compile(r'^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$')
    
    cleaned_records = []
    
    for line in lines:
        if not line.strip(): continue
        
        # El SAT utiliza normalmente coma (,) o split de comillas
        # En el CSV original, a veces los nombres traen comas, procesamos usando csv.reader
        # para respetar escape csv.
        try:
            parts = next(csv.reader([line]))
        except Exception:
            parts = line.split(',')
            
        rfc = ""
        razon = ""
        situacion = ""

        # CSV del SAT 69-B estructura: 0: No., 1: RFC, 2: Nombre del Contribuyente, 3: Situación del contribuyente, ...
        if len(parts) >= 4:
            possible_rfc = parts[1].strip()
            if rfc_pattern.match(possible_rfc):
                rfc = possible_rfc
                razon = parts[2].strip()
                situacion = parts[3].strip()
                cleaned_records.append([rfc, razon, situacion])
                
    if not cleaned_records:
        print("[-] Error: No se encontraron RFCs válidos en el documento.")
        return
        
    print(f"[*] Exportando {len(cleaned_records)} RFCs en formato limpio UTF-8 a: {out_file}")
    
    try:
        with open(out_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(["RFC", "Razon Social", "Situacion"]) # Header compatible con Sentinel Express
            writer.writerows(cleaned_records)
            
        print("[+] Listado 69-B procesado exitosamente.\n[!] El archivo 'Listado_69-B.csv' está listo en client/public/blacklists/.\n[!] Ahora puedes cargarlo en la plataforma Sentinel usando la interfaz o consumirlo directamente.")
    except Exception as e:
        print(f"[-] Error guardando el archivo: {e}")

if __name__ == "__main__":
    download_and_format_blacklist()
