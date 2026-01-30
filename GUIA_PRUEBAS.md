# 🧪 GUÍA DE PRUEBAS - SENTINEL EXPRESS

## 📋 OBJETIVO
Verificar que el sistema **NO marca como error** CFDI que son correctos según el SAT.

---

## 🚀 PASOS PARA PROBAR

### 1️⃣ Instalar dependencias (si es necesario)
```powershell
cd "c:\Users\USER\OneDrive - Sinergy IE SC\Documentos\sentinel-dashboard"
pnpm install
```

### 2️⃣ Iniciar el servidor de desarrollo
```powershell
pnpm run dev
```

### 3️⃣ Abrir el navegador
- Ir a: `http://localhost:5173`

### 4️⃣ Cargar el XML de prueba
1. Hacer clic en **"Cargar XML"** o zona de drag & drop
2. Seleccionar: `test-cfdi-ejemplo.xml`
3. Esperar a que se procese

---

## ✅ RESULTADO ESPERADO

### Dashboard debe mostrar:
- **Archivo:** `test-cfdi-ejemplo.xml`
- **UUID:** `12345678-1234-1234-1234-123456789012`
- **Versión CFDI:** `4.0`
- **RFC Emisor:** `AAA010101AAA`
- **RFC Receptor:** `BBB020202BBB`
- **Subtotal:** `$233.18`
- **IVA Trasladado:** `$37.32`
- **Total XML:** `$270.50`
- **Total Calculado:** `$270.50`
- **Diferencia:** `$0.00`
- **Resultado:** `🟢 USABLE`
- **Comentario Fiscal:** `"Total correcto. Calculado por concepto considerando traslados y retenciones. CFDI 4.0 válido. Cumple con reglas actuales."`

### Al exportar a Excel:
- Columna `Resultado` debe tener: `🟢 USABLE`
- Columna `Total_Calculado` debe tener: `270.50`
- Columna `Total_Declarado` debe tener: `270.50`
- Columna `Diferencia_Totales` debe tener: `0.00`
- Columna `Subtotal` debe tener: `233.18`
- Columna `IVA_Trasladado` debe tener: `37.32`

---

## 🧪 CASOS DE PRUEBA ADICIONALES

### Caso 1: CFDI con retenciones
```
Subtotal: $1000.00
IVA Trasladado 16%: $160.00
IVA Retenido: $10.67
ISR Retenido: $10.00
Total XML: $1139.33

Total_Calc = 1000 + 160 - 10.67 - 10.00 = 1139.33 ✅
```

### Caso 2: CFDI con múltiples conceptos
```
Concepto 1: Importe $100.00, IVA $16.00
Concepto 2: Importe $133.18, IVA $21.32
Subtotal: $233.18
IVA Total: $37.32
Total: $270.50 ✅
```

### Caso 3: CFDI sin impuestos
```
Subtotal: $1000.00
Traslados: $0.00
Retenciones: $0.00
Total: $1000.00 ✅
```

---

## ❌ ERRORES QUE YA NO DEBERÍAN APARECER

### ❌ ANTES (INCORRECTO):
```
Subtotal: 0.00 (mal leído)
Total Calculado: 0.00
Total XML: 270.50
Diferencia: 270.50
Resultado: 🔴 NO USABLE
Comentario: "Totales no cuadran"
```

### ✅ AHORA (CORRECTO):
```
Subtotal: 233.18 (leído de conceptos)
Total Calculado: 270.50
Total XML: 270.50
Diferencia: 0.00
Resultado: 🟢 USABLE
Comentario: "Total correcto. Calculado por concepto..."
```

---

## 🔍 DEBUGGING (si algo falla)

### Ver el desglose por concepto
1. En el dashboard, hacer clic en el registro
2. Buscar el campo `desglose` o `Observaciones Técnicas`
3. Debe mostrar:
```
DESGLOSE POR CONCEPTO:

Concepto 1
  Importe: $233.18
  Traslados:
    - Impuesto 002, Tasa 0.160000: $37.32
  Subtotal acumulado: $233.18
  Total parcial: $270.50

RESUMEN DEL CFDI:
  Subtotal calculado: $233.18
  Traslados totales: $37.32
  Retenciones totales: $0.00
```

### Verificar en la consola del navegador
1. Abrir DevTools (F12)
2. Ir a la pestaña "Console"
3. Buscar mensajes de error relacionados con parsing XML

### Verificar el archivo XML
```powershell
# Mostrar el XML de prueba
Get-Content "test-cfdi-ejemplo.xml"
```

---

## 📝 CHECKLIST DE VALIDACIÓN

- [ ] El sistema lee correctamente el subtotal de los conceptos
- [ ] El IVA se calcula por concepto, no por nodo global
- [ ] La diferencia de totales es ≤ 0.01
- [ ] Los CFDI correctos se marcan como "USABLE"
- [ ] El desglose por concepto es visible
- [ ] El Excel exportado coincide con el dashboard
- [ ] El UUID se extrae correctamente del TimbreFiscalDigital
- [ ] RFC Emisor y Receptor son correctos
- [ ] El comentario fiscal es explicativo

---

## 🆘 SOPORTE

Si encuentras problemas:
1. Verifica que instalaste las dependencias: `pnpm install`
2. Limpia la caché: `pnpm run clean` (si existe)
3. Revisa el archivo [CORRECCIONES_TECNICAS.md](CORRECCIONES_TECNICAS.md)
4. Consulta la consola del navegador para errores JavaScript

---

**Última actualización:** 13 de enero de 2026  
**Responsable:** Arquitecto Fiscal y de Software Senior
