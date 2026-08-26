import { ValidationResult, aplicarConciliacionPagos, DIAS_MAX_COMPLEMENTO } from '@/lib/cfdiEngine';

// Configurable: ventana máxima (días) para considerar complemento dentro de periodo.
// Reexportada desde la fuente central (cfdiEngine.ts) — no se duplica el valor.
export const PAYMENT_COMPLEMENT_MAX_DAYS = DIAS_MAX_COMPLEMENTO;

export function applyFiscalRules(r: ValidationResult): ValidationResult {
  const res = { ...r } as ValidationResult;

  const reasons: string[] = [];
  const rulesApplied: string[] = [];

  // Initialize defaults
  res.paymentMethodStatus = 'NO APLICA';
  res.paymentComplementStatus = 'NO APLICA';

  // MetodoPago rules
  const metodo = String(res.metodoPago || '').toUpperCase();
  if (metodo === 'PPD') {
    const pagosPresente = String(res.pagosPresente || '').toUpperCase();
    const pagosValido = String(res.pagosValido || '').toUpperCase();
    if (pagosPresente === 'SI' && pagosValido === 'SI') {
      res.paymentMethodStatus = 'PPD_CON_COMPLEMENTO';
      res.paymentComplementStatus = 'COMPLETO';
      rulesApplied.push('PPD_CON_COMPLEMENTO');
    } else if (pagosPresente === 'SI' && pagosValido !== 'SI') {
      res.paymentMethodStatus = 'PPD_REVISAR_COMPLEMENTO';
      res.paymentComplementStatus = 'SIN_COMPLEMENTO';
      reasons.push('PPD con complemento presente pero inválido');
      rulesApplied.push('PPD_REVISAR_COMPLEMENTO');
    } else {
      res.paymentMethodStatus = 'PPD_SIN_COMPLEMENTO';
      res.paymentComplementStatus = 'SIN_COMPLEMENTO';
      reasons.push('PPD sin complemento detectado');
      rulesApplied.push('PPD_SIN_COMPLEMENTO');
    }
  }

  if (metodo === 'PUE') {
    // Revisar evidencia de cobro en trazabilidad
    const fechaCobro = res.trazabilidadInfo?.fechaCobro;
    if (!fechaCobro || fechaCobro === '' || fechaCobro === 'NO VIENE EN XML') {
      res.paymentMethodStatus = 'PUE_REVISAR_COBRO';
      reasons.push('PUE sin evidencia de cobro en trazabilidad');
      rulesApplied.push('PUE_REVISAR_COBRO');
    } else {
      res.paymentMethodStatus = 'PUE_VALIDO';
      rulesApplied.push('PUE_VALIDO');
    }
    res.paymentComplementStatus = 'NO APLICA';
  }

  // CFDI Tipo P detection
  if (String(res.tipoCFDI || '').toUpperCase() === 'P') {
    rulesApplied.push('CFDI_TIPO_P_DETECTADO');
    res.paymentComplementStatus = 'SIN_COMPLEMENTO';
  }

  // UUID relacionado no encontrado (simple heuristic)
  if (Array.isArray(res.uuids_relacionados) && res.uuids_relacionados.length > 0) {
    const hasValid = res.uuids_relacionados.some(u => !!u && String(u).toUpperCase() !== 'NO DISPONIBLE' && String(u).trim() !== '');
    if (!hasValid) {
      res.paymentComplementStatus = 'UUID_RELACIONADO_NO_ENCONTRADO';
      reasons.push('UUID relacionado no encontrado');
      rulesApplied.push('UUID_RELACIONADO_NO_ENCONTRADO');
    }
  }

  // UsoCFDI y regimen checks
  if (!res.usoCFDI || String(res.usoCFDI).trim() === '' || String(res.usoCFDI).includes('NO DISPONIBLE')) {
    reasons.push('Uso CFDI no identificado');
    rulesApplied.push('USO_CFDI_NO_IDENTIFICADO');
  }
  if (!res.regimenReceptor || String(res.regimenReceptor).trim() === '' || String(res.regimenReceptor).includes('NO DISPONIBLE')) {
    reasons.push('Régimen receptor no identificado');
    rulesApplied.push('REGIMEN_NO_IDENTIFICADO');
  }

  // IVA acreditable heuristic (restricción: solo NO_ACREDITABLE por falta de complemento o pagos inválidos)
  // ✅ CORRECCIÓN DE ESPEJO CONTABLE: la acreditación de IVA solo aplica a CFDI RECIBIDOS.
  // Un CFDI EMITIDO (la empresa vende) genera IVA TRASLADADO a cargo, no acreditable para la empresa.
  if (res.direccionCFDI === 'EMITIDO') {
    res.ivaCreditabilityStatus = (res.ivaTraslado || 0) > 0 ? 'TRASLADADO' : 'NO_APLICA';
  } else if (res.paymentMethodStatus === 'PPD_SIN_COMPLEMENTO' || res.paymentComplementStatus === 'SIN_COMPLEMENTO') {
    res.ivaCreditabilityStatus = 'NO_ACREDITABLE';
  } else if (String(res.pagosValido || '').toUpperCase() === 'NO') {
    res.ivaCreditabilityStatus = 'NO_ACREDITABLE';
  } else if ((res.ivaTraslado || 0) > 0 && res.isValid) {
    res.ivaCreditabilityStatus = 'ACREDITABLE';
  } else {
    res.ivaCreditabilityStatus = 'POR_DETERMINAR';
  }

  // Nivel de riesgo simplificado
  // ✅ CORRECCIÓN DE CONTRADICCIÓN: un hallazgo fiscal NUNCA debe quedar en VERDE.
  // Un CFDI NO USABLE (🔴) o no validado SAT no puede reportarse como "SIN HALLAZGOS".
  const esNoUsable = String(res.resultado || '').includes('NO USABLE');
  const esNoValidado = String(res.resultado || '').includes('No validado');
  if (esNoUsable && reasons.length === 0) reasons.push('Documento NO USABLE (ilegible/corrupto)');
  if (esNoValidado && reasons.length === 0) reasons.push('Estatus SAT no confirmado: requiere reintento');

  const isCritical = res.ivaCreditabilityStatus === 'NO_ACREDITABLE' || (String(res.tipoCFDI || '').toUpperCase() === 'P' && String(res.total || '0') !== '0');
  if (isCritical || esNoUsable) {
    res.fiscalRiskLevel = 'ROJO';
  } else if (reasons.length > 0) {
    res.fiscalRiskLevel = 'AMARILLO';
  } else {
    res.fiscalRiskLevel = 'VERDE';
  }

  res.fiscalRiskReason = reasons.join(' | ') || 'SIN HALLAZGOS FISCALES';
  res.fiscalRuleApplied = rulesApplied.join(', ') || 'NINGUNA';

  return res;
}

export default applyFiscalRules;

// Adaptador: delega en la función central reconciliarPagosPPD/
// aplicarConciliacionPagos (cfdiEngine.ts) para que motor, alertas,
// Dashboard, resúmenes y Excel usen exactamente el mismo resultado — no se
// mantiene una segunda regla de negocio independiente ni duplicada aquí.
// Nota de compatibilidad: a diferencia de la versión anterior, esta función
// NO muta los objetos recibidos; retorna un arreglo nuevo. El único llamador
// (useXMLValidator.ts) ya usa el valor de retorno, no el arreglo original.
export function reconcilePaymentComplements(results: ValidationResult[]): ValidationResult[] {
  return aplicarConciliacionPagos(results);
}
