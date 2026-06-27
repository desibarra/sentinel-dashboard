import { ValidationResult } from '@/lib/cfdiEngine';

// Configurable: ventana máxima (días) para considerar complemento dentro de periodo
export const PAYMENT_COMPLEMENT_MAX_DAYS = 90;

const tryParseCFDIDate = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s || s === 'NO VIENE EN XML' || s === 'NO DISPONIBLE') return null;

  // ISO datetime with T
  const isoMatch = s.match(/^\d{4}-\d{2}-\d{2}T/);
  if (isoMatch) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Date-only YYYY-MM-DD
  const dateOnlyMatch = s.match(/^\d{4}-\d{2}-\d{2}$/);
  if (dateOnlyMatch) {
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  // Try generic Date parse as fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export function applyFiscalRules(r: ValidationResult): ValidationResult {
  const res = { ...r } as ValidationResult;

  const reasons: string[] = [];
  const rulesApplied: string[] = [];

  // MetodoPago rules
  const metodo = String(res.metodoPago || '').toUpperCase();
  if (metodo === 'PPD') {
    const pagosPresente = String(res.pagosPresente || '').toUpperCase();
    const pagosValido = String(res.pagosValido || '').toUpperCase();
    if (pagosPresente === 'SI' && pagosValido === 'SI') {
      res.paymentComplementStatus = 'PPD_CON_COMPLEMENTO';
      rulesApplied.push('PPD_CON_COMPLEMENTO');
    } else if (pagosPresente === 'SI' && pagosValido !== 'SI') {
      res.paymentComplementStatus = 'PPD_REVISAR_COMPLEMENTO';
      reasons.push('PPD con complemento presente pero inválido');
      rulesApplied.push('PPD_REVISAR_COMPLEMENTO');
    } else {
      res.paymentComplementStatus = 'PPD_SIN_COMPLEMENTO';
      reasons.push('PPD sin complemento detectado');
      rulesApplied.push('PPD_SIN_COMPLEMENTO');
    }
  }

  if (metodo === 'PUE') {
    // Revisar evidencia de cobro en trazabilidad
    const fechaCobro = res.trazabilidadInfo?.fechaCobro;
    if (!fechaCobro || fechaCobro === '' || fechaCobro === 'NO VIENE EN XML') {
      res.paymentComplementStatus = 'PUE_REVISAR_COBRO';
      reasons.push('PUE sin evidencia de cobro en trazabilidad');
      rulesApplied.push('PUE_REVISAR_COBRO');
    } else {
      res.paymentComplementStatus = 'PUE_VALIDO';
      rulesApplied.push('PUE_VALIDO');
    }
  }

  // CFDI Tipo P detection
  if (String(res.tipoCFDI || '').toUpperCase() === 'P') {
    rulesApplied.push('CFDI_TIPO_P_DETECTADO');
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
  if (res.paymentComplementStatus && String(res.paymentComplementStatus).includes('SIN_COMPLEMENTO')) {
    res.ivaCreditabilityStatus = 'NO_ACREDITABLE';
  } else if (String(res.pagosValido || '').toUpperCase() === 'NO') {
    res.ivaCreditabilityStatus = 'NO_ACREDITABLE';
  } else if ((res.ivaTraslado || 0) > 0 && res.isValid) {
    res.ivaCreditabilityStatus = 'ACREDITABLE';
  } else {
    res.ivaCreditabilityStatus = 'POR_DETERMINAR';
  }

  // Nivel de riesgo simplificado
  const isCritical = res.ivaCreditabilityStatus === 'NO_ACREDITABLE' || (String(res.tipoCFDI || '').toUpperCase() === 'P' && String(res.total || '0') !== '0');
  if (isCritical) {
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

export function reconcilePaymentComplements(results: ValidationResult[]): ValidationResult[] {
  const map = new Map<string, ValidationResult>();
  results.forEach(r => {
    if (r && r.uuid) map.set(String(r.uuid).toUpperCase(), r);
  });

  // Inicializar estados en documentos que son posibles origenes (no REP)
  results.forEach(r => {
    const tipo = String(r.tipoCFDI || '').toUpperCase();
    if (tipo !== 'P') {
      if (!r.paymentComplementStatus || r.paymentComplementStatus === 'NO APLICA') {
        r.paymentComplementStatus = 'SIN_COMPLEMENTO';
      }
    }
  });

  // Procesar complementos (tipo P) y relacionarlos
  results.forEach(r => {
    const tipo = String(r.tipoCFDI || '').toUpperCase();
    if (tipo === 'P') {
      const related = Array.isArray(r.uuids_relacionados) ? r.uuids_relacionados : (r.uuidRelacionado ? [r.uuidRelacionado] : []);
      if (!related.length) {
        r.paymentComplementStatus = 'UUID_RELACIONADO_NO_ENCONTRADO';
        r.fiscalRuleApplied = (r.fiscalRuleApplied ? r.fiscalRuleApplied + ', ' : '') + 'UUID_RELACIONADO_NO_ENCONTRADO';
        return;
      }
      related.forEach(rel => {
        if (!rel) return;
        const key = String(rel).toUpperCase();
        const origin = map.get(key);
        if (!origin) {
          r.paymentComplementStatus = 'UUID_RELACIONADO_NO_ENCONTRADO';
          r.fiscalRuleApplied = (r.fiscalRuleApplied ? r.fiscalRuleApplied + ', ' : '') + 'UUID_RELACIONADO_NO_ENCONTRADO';
          return;
        }

        // Encontrado: marcar origen como COMPLETO o COMPLEMENTO_FUERA_DE_PERIODO
        // Evaluar diferencia de fechas (si están presentes)
        // Evaluar fechas con parseo robusto
        const fechaOrigenDate = tryParseCFDIDate(origin.fechaEmision || origin.fechaEmision);
        const fechaComplementoDate = tryParseCFDIDate(r.fechaEmision || r.fechaEmision);

        if (!fechaOrigenDate || !fechaComplementoDate) {
          // Si no se pudo parsear alguna fecha, marcar revisión (AMARILLO) en lugar de ROJO
          origin.fiscalRiskLevel = origin.fiscalRiskLevel === 'ROJO' ? origin.fiscalRiskLevel : 'AMARILLO';
          origin.fiscalRiskReason = (origin.fiscalRiskReason ? origin.fiscalRiskReason + ' | ' : '') + 'REVISAR_FECHA';
          origin.fiscalRuleApplied = (origin.fiscalRuleApplied ? origin.fiscalRuleApplied + ', ' : '') + 'REVISAR_FECHA';
          r.fiscalRiskLevel = r.fiscalRiskLevel === 'ROJO' ? r.fiscalRiskLevel : 'AMARILLO';
          r.fiscalRiskReason = (r.fiscalRiskReason ? r.fiscalRiskReason + ' | ' : '') + 'REVISAR_FECHA';
          r.fiscalRuleApplied = (r.fiscalRuleApplied ? r.fiscalRuleApplied + ', ' : '') + 'REVISAR_FECHA';
          // No forzar estado COMPLETO/COMPLEMENTO_FUERA_DE_PERIODO cuando fechas inválidas; dejar como está o marcar revisión
          return;
        }

        const diffDays = Math.floor((fechaComplementoDate.getTime() - fechaOrigenDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > PAYMENT_COMPLEMENT_MAX_DAYS) {
          origin.paymentComplementStatus = 'COMPLEMENTO_FUERA_DE_PERIODO';
          origin.fiscalRuleApplied = (origin.fiscalRuleApplied ? origin.fiscalRuleApplied + ', ' : '') + 'COMPLEMENTO_FUERA_DE_PERIODO';
        } else {
          origin.paymentComplementStatus = 'COMPLETO';
          origin.fiscalRuleApplied = (origin.fiscalRuleApplied ? origin.fiscalRuleApplied + ', ' : '') + 'COMPLETO';
        }

        // Marcar complemento como relacionado correctamente
        r.paymentComplementStatus = 'COMPLETO';
        r.fiscalRuleApplied = (r.fiscalRuleApplied ? r.fiscalRuleApplied + ', ' : '') + 'RELACIONADO_A:' + origin.uuid;
      });
    }
  });

  return results;
}
