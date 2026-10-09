import type { ValidationResult } from './cfdiEngine';

type Row = Record<string, any>;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const children = (node: Document | Element, name: string): Element[] => Array.from(node.getElementsByTagName('*')).filter(n => n.localName === name);
const numberAttr = (node: Element, name: string): number | null => {
  const raw = node.getAttribute(name);
  if (raw === null || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const cancelled = (r: ValidationResult) => /cancelad/i.test(r.estatusSAT || '') || /cancelad/i.test(r.trazabilidadInfo?.observacionSAT || '');
const rateLabel = (rate: string, factor: string) => factor === 'Exento' ? 'EXENTO' : rate !== '' && Number.isFinite(Number(rate)) ? `${(Number(rate) * 100).toFixed(2)}%` : 'NO DESGLOSADA';
const month = (date?: string) => date?.slice(0, 7) || '';
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type RepSummary = { notInLot: Set<string>; inLot: Map<string, string>; earlyIva: Map<string, number> };
const amountFields = ['Base_MXN', 'IVA trasladado emitidas (MXN)', 'IVA acreditable pagado recibidas (MXN)', 'IVA con factura en lote (MXN)', 'IVA emitido por cobrar (MXN)', 'IVA recibido pendiente de pago (MXN)', 'IVA_retenido_MXN', 'ISR_retenido_MXN', 'IVA_REP_facturas_otros_meses_MXN', 'IVA_REP_factura_no_localizada_MXN', 'IVA_excluido_pago_duplicado_MXN'];
/** Trazabilidad de la lectura de REP para la hoja de conciliación contra el documento fuente. */
export type RepReconciliation = {
  repLeidos: number; repCancelados: number; repSinPagos: number; pagosLeidos: number; pagosSinFecha: number;
  drLeidos: number; drFacturaCancelada: number; drIncompatibles: number; drDuplicados: number; ivaDuplicadoExcluido: number;
  drSinImpuestos: number; drSinTipoCambio: number; drFacturaEnLote: number; drFacturaNoLocalizada: number;
  pagosMesDistintoEmisionREP: number; pagosFueraDelPeriodo: number; periodo: { desde: string; hasta: string } | null;
  pagosPorMes: { mes: string; pagos: number; iva: number; fueraDelPeriodo: boolean }[];
  duplicados: { UUID_REP_excluido: string; UUID_REP_conservado: string; UUID_factura: string; NumParcialidad: string; ImpPagado: string; FechaPago: string; IVA_excluido_MXN: number }[];
};

/** Flujo mensual: PUE y NC por emisión; REP por FechaPago e impuestos DR, sin prorratear la factura. */
export function buildMainReportVat(results: ValidationResult[]): { detail: Row[]; totals: Row[]; alerts: Row[]; repNotes: Map<string, string>; reconciliation: RepReconciliation } {
  const detail: Row[] = [];
  const alerts: Row[] = [];
  const byUuid = new Map(results.map(r => [r.uuid.toUpperCase(), r]));
  const paidVat = new Map<string, number>();
  const repSummaries = new Map<string, RepSummary>();
  const emissionMonths = results.filter(r => r.tipoCFDI !== 'P').map(r => month(r.fechaEmision)).filter(Boolean).sort();
  const rec: RepReconciliation = {
    repLeidos: 0, repCancelados: 0, repSinPagos: 0, pagosLeidos: 0, pagosSinFecha: 0, drLeidos: 0, drFacturaCancelada: 0, drIncompatibles: 0,
    drDuplicados: 0, ivaDuplicadoExcluido: 0, drSinImpuestos: 0, drSinTipoCambio: 0, drFacturaEnLote: 0, drFacturaNoLocalizada: 0,
    pagosMesDistintoEmisionREP: 0, pagosFueraDelPeriodo: 0,
    periodo: emissionMonths.length ? { desde: emissionMonths[0], hasta: emissionMonths[emissionMonths.length - 1] } : null,
    pagosPorMes: [], duplicados: [],
  };
  const paymentsByMonth = new Map<string, { pagos: number; iva: number }>();
  // Un mismo pago (factura + parcialidad + importe + FechaPago) puede venir en dos REP distintos;
  // solo se cuenta la primera vez, por orden de emisión del REP.
  const seenPayments = new Map<string, string>();
  const alert = (r: ValidationResult, reason: string, level = 'NARANJA', recommendation = 'Revisar los impuestos y monedas del REP en el XML; no se estiman importes ausentes.') =>
    alerts.push({ UUID: r.uuid, Tipo_Alerta: 'IVA', Nivel_Riesgo: level, Descripcion_Tecnica: reason, Evidencia_XML: r.fileName, Recomendacion: recommendation });
  const observation = (r: ValidationResult, period: string, source: string, invoice: ValidationResult | undefined, quantified: boolean) => {
    let note: string;
    if (source === 'REP') {
      if (period === 'SIN FECHA') note = 'REP sin FechaPago válida; el IVA no se asigna a ningún mes.';
      else if (!invoice) note = `Pago de una factura que no está en el lote (emitida en otro periodo); el IVA se acumula en ${period}, mes del pago.`;
      else if (month(invoice.fechaEmision) !== period) note = `Pago de la factura de ${month(invoice.fechaEmision)} incluida en el lote; el IVA se acumula en ${period}, mes del pago.`;
      else note = `Pago de una factura del mismo mes (${period}) incluida en el lote.`;
      if (period !== 'SIN FECHA' && month(r.fechaEmision) && period < month(r.fechaEmision)) {
        note += ` REP emitido el ${r.fechaEmision} con FechaPago de ${period}: el IVA corresponde a ${period}; verificar si ya se declaró.`;
      }
    } else if (source === 'PUE') note = 'Factura PUE: el IVA se acumula en el mes de emisión.';
    else if (source === 'NOTA DE CRÉDITO') note = 'Nota de crédito: disminuye el IVA del mes de emisión.';
    else note = 'Factura PPD: IVA informativo por el saldo no pagado con los REP del lote; se acumula en el mes en que se pague.';
    return quantified ? note : `${note} Importe no cuantificable: falta tipo de cambio o impuestos DR.`;
  };
  const add = (r: ValidationResult, period: string, source: string, related: string, tax: string, rate: string, base: number | null, amount: number | null, exchange: number | null, pending = false, duplicateOf = '') => {
    const issued = r.direccionCFDI === 'EMITIDO';
    const converted = amount !== null && exchange !== null ? round(amount * exchange) : '';
    const invoice = byUuid.get(related.toUpperCase());
    if (duplicateOf) {
      const excluded = tax === 'IVA' && typeof converted === 'number' ? converted : 0;
      rec.ivaDuplicadoExcluido = round(rec.ivaDuplicadoExcluido + excluded);
      detail.push({
        UUID: r.uuid, UUID_factura: related, UUID_REP: r.uuid, Factura_en_lote: invoice ? 'SÍ' : 'NO LOCALIZADA',
        Fecha_CFDI: r.fechaEmision, Mes_factura: invoice?.fechaEmision?.slice(0, 7) || 'NO LOCALIZADA', Mes_periodo: period,
        Dirección: r.direccionCFDI, Fuente: 'REP', Rubro: tax, Tasa: rate, Base_MXN: '',
        ...Object.fromEntries(amountFields.filter(f => f !== 'Base_MXN').map(f => [f, 0])),
        IVA_excluido_pago_duplicado_MXN: excluded,
        Estado: 'EXCLUIDO: PAGO DUPLICADO',
        Observación: `Mismo pago (factura, parcialidad, importe y FechaPago) ya contado en el REP ${duplicateOf}; no se suma dos veces.`,
      });
      return converted;
    }
    const row: Row = {
      UUID: r.uuid, UUID_factura: related, UUID_REP: source === 'REP' ? r.uuid : '',
      Factura_en_lote: source !== 'REP' ? 'SÍ' : invoice ? 'SÍ' : 'NO LOCALIZADA',
      Fecha_CFDI: r.fechaEmision, Mes_factura: source === 'REP' ? invoice?.fechaEmision?.slice(0, 7) || 'NO LOCALIZADA' : r.fechaEmision?.slice(0, 7),
      Mes_periodo: period, Dirección: r.direccionCFDI, Fuente: source, Rubro: tax, Tasa: rate,
      Base_MXN: base !== null && exchange !== null ? round(base * exchange) : '',
      'IVA trasladado emitidas (MXN)': tax === 'IVA' && issued && !pending ? converted : 0,
      'IVA acreditable pagado recibidas (MXN)': tax === 'IVA' && !issued && !pending ? converted : 0,
      'IVA con factura en lote (MXN)': tax === 'IVA' && !pending && (source !== 'REP' || invoice) ? converted : 0,
      'IVA emitido por cobrar (MXN)': tax === 'IVA' && issued && pending ? converted : 0,
      'IVA recibido pendiente de pago (MXN)': tax === 'IVA' && !issued && pending ? converted : 0,
      IVA_retenido_MXN: tax === 'RETENCIÓN IVA' && !pending ? converted : 0,
      ISR_retenido_MXN: tax === 'RETENCIÓN ISR' && !pending ? converted : 0,
      IVA_REP_facturas_otros_meses_MXN: source === 'REP' && tax === 'IVA' && invoice && invoice.fechaEmision?.slice(0, 7) !== period ? converted : 0,
      IVA_REP_factura_no_localizada_MXN: source === 'REP' && tax === 'IVA' && !invoice ? converted : 0,
      IVA_excluido_pago_duplicado_MXN: 0,
      Estado: converted === '' ? 'NO CUANTIFICABLE' : pending ? 'INFORMATIVO PENDIENTE' : 'CUANTIFICADO',
      Observación: observation(r, period, source, invoice, converted !== ''),
    };
    if (source === 'REP' && related) {
      const summary = repSummaries.get(r.uuid) || { notInLot: new Set<string>(), inLot: new Map<string, string>(), earlyIva: new Map<string, number>() };
      if (invoice) summary.inLot.set(related.toUpperCase(), month(invoice.fechaEmision));
      else summary.notInLot.add(related.toUpperCase());
      if (tax === 'IVA' && typeof converted === 'number' && period < month(r.fechaEmision)) {
        summary.earlyIva.set(period, round((summary.earlyIva.get(period) || 0) + converted));
      }
      repSummaries.set(r.uuid, summary);
    }
    detail.push(row);
    return converted;
  };
  // Primero se extraen todos los DR, incluyendo facturas que no están en el lote.
  const reps = results.filter(r => r.tipoCFDI === 'P' && ['EMITIDO', 'RECIBIDO'].includes(r.direccionCFDI || ''))
    .sort((a, b) => String(a.fechaEmision || '').localeCompare(String(b.fechaEmision || '')) || a.uuid.localeCompare(b.uuid));
  rec.repLeidos = reps.length;
  for (const r of reps) {
    if (cancelled(r)) { rec.repCancelados++; continue; }
    const doc = new DOMParser().parseFromString(r.xmlContent || '', 'application/xml');
    const payments = children(doc, 'Pago');
    if (!payments.length) {
      rec.repSinPagos++;
      alert(r, 'REP sin nodos Pago legibles; IVA no cuantificable.');
      add(r, 'SIN FECHA', 'REP', '', 'IVA', 'NO DESGLOSADA', null, null, null);
    }
    for (const payment of payments) {
      const date = payment.getAttribute('FechaPago') || '';
      rec.pagosLeidos++;
      if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
        rec.pagosSinFecha++;
        alert(r, 'REP sin FechaPago válida; no se puede asignar el IVA al mes.');
        add(r, 'SIN FECHA', 'REP', '', 'IVA', 'NO DESGLOSADA', null, null, null);
        continue;
      }
      const currency = payment.getAttribute('MonedaP');
      const paymentRate = currency === 'MXN' ? 1 : numberAttr(payment, 'TipoCambioP');
      const paymentMonth = date.slice(0, 7);
      const monthStats = paymentsByMonth.get(paymentMonth) || { pagos: 0, iva: 0 };
      monthStats.pagos++;
      paymentsByMonth.set(paymentMonth, monthStats);
      if (paymentMonth !== month(r.fechaEmision)) rec.pagosMesDistintoEmisionREP++;
      if (rec.periodo && (paymentMonth < rec.periodo.desde || paymentMonth > rec.periodo.hasta)) rec.pagosFueraDelPeriodo++;
      for (const dr of children(payment, 'DoctoRelacionado')) {
        const related = dr.getAttribute('IdDocumento') || '';
        const invoice = byUuid.get(related.toUpperCase());
        rec.drLeidos++;
        if (invoice && cancelled(invoice)) { rec.drFacturaCancelada++; continue; }
        if (invoice && (invoice.metodoPago === 'PUE' || invoice.tipoCFDI !== 'I' || invoice.direccionCFDI !== r.direccionCFDI)) {
          rec.drIncompatibles++;
          alert(r, `REP relacionado con CFDI incompatible (${related}); excluido para evitar doble conteo.`); continue;
        }
        const paymentKey = [r.direccionCFDI, related.trim().toUpperCase(), (dr.getAttribute('NumParcialidad') || '').trim(),
          numberAttr(dr, 'ImpPagado')?.toFixed(2) ?? (dr.getAttribute('ImpPagado') || ''), date.slice(0, 10)].join('|');
        const duplicateOf = seenPayments.get(paymentKey) || '';
        if (duplicateOf === r.uuid) continue;
        if (duplicateOf) rec.drDuplicados++;
        else {
          seenPayments.set(paymentKey, r.uuid);
          if (invoice) rec.drFacturaEnLote++; else rec.drFacturaNoLocalizada++;
        }
        const drCurrency = dr.getAttribute('MonedaDR');
        const equivalence = drCurrency && drCurrency === currency ? 1 : numberAttr(dr, 'EquivalenciaDR');
        const exchange = paymentRate && equivalence && currency && drCurrency ? paymentRate / equivalence : null;
        if (exchange === null && !duplicateOf) {
          rec.drSinTipoCambio++;
          alert(r, `REP ${related}: falta TipoCambioP, MonedaP, MonedaDR o EquivalenciaDR; IVA no convertible a MXN.`);
        }
        const taxes = [...children(dr, 'TrasladoDR'), ...children(dr, 'RetencionDR')];
        if (!taxes.length && dr.getAttribute('ObjetoImpDR') !== '01' && !duplicateOf) {
          rec.drSinImpuestos++;
          alert(r, `REP ${related}: sin impuestos DR desglosados; IVA no cuantificable.`);
          add(r, paymentMonth, 'REP', related, 'IVA', 'NO DESGLOSADA', null, null, exchange);
        }
        let duplicateVat = 0;
        for (const tax of taxes) {
          const retained = tax.localName === 'RetencionDR';
          const code = tax.getAttribute('ImpuestoDR');
          if (code !== '002' && !(retained && code === '001')) continue;
          const factor = tax.getAttribute('TipoFactorDR') || '';
          const amount = factor === 'Exento' ? 0 : numberAttr(tax, 'ImporteDR');
          const base = numberAttr(tax, 'BaseDR');
          if ((amount === null || base === null) && !duplicateOf) alert(r, `REP ${related}: BaseDR o ImporteDR ausente; no se estiman impuestos.`);
          const taxRate = rateLabel(tax.getAttribute('TasaOCuotaDR') || '', factor);
          const converted = add(r, paymentMonth, 'REP', related, retained ? code === '001' ? 'RETENCIÓN ISR' : 'RETENCIÓN IVA' : 'IVA', taxRate, base, amount, exchange, false, duplicateOf);
          if (duplicateOf) {
            if (!retained && typeof converted === 'number') duplicateVat = round(duplicateVat + converted);
            continue;
          }
          if (!retained && typeof converted === 'number') monthStats.iva = round(monthStats.iva + converted);
          if (!retained && amount !== null && invoice?.moneda === drCurrency) {
            const key = `${related.toUpperCase()}|${taxRate}`;
            paidVat.set(key, (paidVat.get(key) || 0) + amount);
            paidVat.set(related.toUpperCase(), (paidVat.get(related.toUpperCase()) || 0) + amount);
          }
        }
        if (duplicateOf) {
          rec.duplicados.push({ UUID_REP_excluido: r.uuid, UUID_REP_conservado: duplicateOf, UUID_factura: related, NumParcialidad: dr.getAttribute('NumParcialidad') || '',
            ImpPagado: dr.getAttribute('ImpPagado') || '', FechaPago: date, IVA_excluido_MXN: duplicateVat });
          alert(r, `Pago duplicado de la factura ${related} (parcialidad ${dr.getAttribute('NumParcialidad') || 'N/D'}, ImpPagado ${dr.getAttribute('ImpPagado') || 'N/D'}, FechaPago ${date.slice(0, 10)}) ya incluido en el REP ${duplicateOf}; IVA ${money(duplicateVat)} excluido.`,
            'NARANJA', 'Confirmar con el emisor cuál REP es el válido y solicitar la cancelación del duplicado.');
        }
      }
    }
  }
  rec.pagosPorMes = Array.from(paymentsByMonth, ([mes, v]) => ({ mes, pagos: v.pagos, iva: v.iva,
    fueraDelPeriodo: Boolean(rec.periodo && (mes < rec.periodo.desde || mes > rec.periodo.hasta)) })).sort((a, b) => a.mes.localeCompare(b.mes));
  for (const r of results.filter(r => ['I', 'E'].includes(r.tipoCFDI) && !cancelled(r) && ['EMITIDO', 'RECIBIDO'].includes(r.direccionCFDI || ''))) {
    const credit = r.tipoCFDI === 'E';
    const pending = !credit && r.metodoPago !== 'PUE';
    const exchange = r.moneda === 'MXN' ? 1 : r.tipoCambio && Number.isFinite(r.tipoCambio) && r.tipoCambio > 0 ? r.tipoCambio : null;
    const sign = credit ? -1 : 1;
    const taxLines: { rubro: string; base: number; importe: number; tasa: string }[] = [];
    for (const c of r.desglosePorConcepto || []) {
      for (const t of c.traslados || []) if (t.impuesto === '002') taxLines.push({ rubro: 'IVA', base: t.base, importe: t.importe, tasa: rateLabel(t.tasa, t.tipoFactor || '') });
      for (const t of c.retenciones || []) if (['001', '002'].includes(t.impuesto)) taxLines.push({ rubro: t.impuesto === '002' ? 'RETENCIÓN IVA' : 'RETENCIÓN ISR', base: t.base, importe: t.importe, tasa: rateLabel(t.tasa, t.tipoFactor || '') });
    }
    for (const [rubro, amount] of [['IVA', r.ivaTraslado], ['RETENCIÓN IVA', r.ivaRetenido], ['RETENCIÓN ISR', r.isrRetenido]] as const) {
      if (!taxLines.some(t => t.rubro === rubro) && amount > 0) taxLines.push({ rubro, base: rubro === 'IVA' ? r.subtotal : 0, importe: amount, tasa: 'NO DESGLOSADA' });
    }
    if (!taxLines.some(t => t.rubro === 'IVA') && r.baseIVAExento > 0) taxLines.push({ rubro: 'IVA', base: r.baseIVAExento, importe: 0, tasa: 'EXENTO' });
    for (const t of taxLines) {
      let amount = t.importe * sign;
      // Saldo informativo solamente: nunca se utiliza para determinar el IVA cobrado/pagado.
      if (pending && t.rubro === 'IVA' && exchange !== null) {
        const key = t.tasa === 'NO DESGLOSADA' ? r.uuid.toUpperCase() : `${r.uuid.toUpperCase()}|${t.tasa}`;
        const remainingPaid = paidVat.get(key) || 0;
        const reduction = Math.min(amount, remainingPaid);
        amount -= reduction;
        paidVat.set(key, remainingPaid - reduction);
      }
      add(r, r.fechaEmision?.slice(0, 7) || 'SIN FECHA', credit ? 'NOTA DE CRÉDITO' : pending ? 'PPD PENDIENTE' : 'PUE', r.uuid, t.rubro, t.tasa, t.base * sign, amount, exchange, pending);
    }
  }
  const groups = new Map<string, Row>();
  for (const row of detail) {
    const key = [row.Mes_periodo, row.Dirección, row.Rubro, row.Tasa, row.Fuente].join('|');
    const g = groups.get(key) || { Mes_periodo: row.Mes_periodo, Dirección: row.Dirección, Rubro: row.Rubro, Tasa: row.Tasa, Fuente: row.Fuente, Tipo_fila: 'DESGLOSE', No_cuantificables: 0, ...Object.fromEntries(amountFields.map(f => [f, 0])) };
    for (const f of amountFields) g[f] = round(g[f] + Number(row[f] || 0));
    if (row.Estado === 'NO CUANTIFICABLE') g.No_cuantificables++;
    groups.set(key, g);
  }
  const monthly = new Map<string, Row>();
  for (const g of Array.from(groups.values())) {
    const key = `${g.Mes_periodo}|${g.Dirección}`;
    const total = monthly.get(key) || { Mes_periodo: g.Mes_periodo, Dirección: g.Dirección, Tipo_fila: 'TOTAL MENSUAL', No_cuantificables: 0, ...Object.fromEntries(amountFields.map(f => [f, 0])) };
    for (const f of amountFields) {
      if (f === 'Base_MXN' && (g.Rubro !== 'IVA' || g.Fuente === 'PPD PENDIENTE')) continue;
      total[f] = round(total[f] + g[f]);
    }
    total.No_cuantificables += g.No_cuantificables;
    monthly.set(key, total);
  }
  const repNotes = new Map<string, string>();
  for (const r of results) {
    const summary = repSummaries.get(r.uuid);
    if (!summary) continue;
    const parts: string[] = [];
    if (summary.notInLot.size) parts.push(`${summary.notInLot.size} factura(s) no incluida(s) en el lote (de otros periodos)`);
    const otherMonths = Array.from(summary.inLot.values()).filter(m => m !== month(r.fechaEmision));
    if (otherMonths.length) parts.push(`${otherMonths.length} factura(s) del lote de otro mes (${Array.from(new Set(otherMonths)).sort().join(', ')})`);
    const sameMonth = summary.inLot.size - otherMonths.length;
    if (sameMonth) parts.push(`${sameMonth} factura(s) del lote del mismo mes`);
    let note = `REP: paga ${parts.join('; ')}. El IVA se acumula en el mes de cada FechaPago.`;
    const early = Array.from(summary.earlyIva.entries()).sort();
    if (early.length) {
      const detailText = early.map(([period, amount]) => `${money(amount)} en ${period}`).join(', ');
      note += ` FechaPago anterior a su emisión (${r.fechaEmision}): IVA ${detailText}; verificar si ya se declaró.`;
      alert(r, `REP emitido el ${r.fechaEmision} con FechaPago de un mes anterior: IVA ${detailText} asignado a ese mes.`, 'INFO',
        'Verificar si el IVA de ese mes ya se declaró; si no, puede requerir declaración complementaria.');
    }
    repNotes.set(r.uuid.toUpperCase(), note);
  }
  return { detail, totals: [...Array.from(monthly.values()), ...Array.from(groups.values())], alerts, repNotes, reconciliation: rec };
}
