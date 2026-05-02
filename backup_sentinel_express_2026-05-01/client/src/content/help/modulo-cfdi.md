# Módulo CFDI 4.0

El estándar CFDI 4.0 introdujo cambios significativos en la validación de datos del receptor.

## ✅ Validaciones Clave
1. **RFC:** Debe estar inscrito en el padrón del SAT.
2. **Nombre/Razón Social:** Debe coincidir exactamente con la Constancia de Situación Fiscal (sin régimen de capital).
3. **CP Receptor:** El código postal del domicilio fiscal debe ser válido.
4. **Régimen Fiscal:** Debe ser compatible con el tipo de persona (Física/Moral).
5. **Uso de CFDI:** Debe corresponder al régimen fiscal del receptor.

## 📊 Reglas de Totales
Sentinel valida que la suma de conceptos sea exactamente igual al total declarado, considerando impuestos trasladados y retenidos, con una tolerancia de **$0.01**.
