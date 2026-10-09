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
const amountFields = ['Base_MXN', 'IVA trasladado emitidas (MXN)', 'IVA acreditable pagado recibidas (MXN)', 'IVA emitido por cobrar (MXN)', 'IVA recibido pendiente de pago (MXN)', 'IVA_retenido_MXN', 'ISR_retenido_MXN', 'IVA_REP_facturas_otros_meses_MXN', 'IVA_REP_factura_no_localizada_MXN'];

/** Flujo mensual: PUE y NC por emisión; REP por FechaPago e impuestos DR, sin prorratear la factura. */
export function buildMainReportVat(results: ValidationResult[]): { detail: Row[]; totals: Row[]; alerts: Row[] } {
  const detail: Row[] = [];
  const alerts: Row[] = [];
  const byUuid = new Map(results.map(r => [r.uuid.toUpperCase(), r]));
  const paidVat = new Map<string, number>();
  const alert = (r: ValidationResult, reason: string) => alerts.push({ UUID: r.uuid, Tipo_Alerta: 'IVA', Nivel_Riesgo: 'NARANJA', Descripcion_Tecnica: reason, Evidencia_XML: r.fileName, Recomendacion: 'Revisar los impuestos y monedas del REP en el XML; no se estiman importes ausentes.' });
  const add = (r: ValidationResult, period: string, source: string, related: string, tax: string, rate: string, base: number | null, amount: number | null, exchange: number | null, pending = false) => {
    const issued = r.direccionCFDI === 'EMITIDO';
    const converted = amount !== null && exchange !== null ? round(amount * exchange) : '';
    const invoice = byUuid.get(related.toUpperCase());
    const row: Row = {
      UUID: r.uuid, UUID_factura: related, UUID_REP: source === 'REP' ? r.uuid : '',
      Factura_en_lote: source !== 'REP' ? 'SÍ' : invoice ? 'SÍ' : 'NO LOCALIZADA',
      Fecha_CFDI: r.fechaEmision, Mes_factura: source === 'REP' ? invoice?.fechaEmision?.slice(0, 7) || 'NO LOCALIZADA' : r.fechaEmision?.slice(0, 7),
      Mes_periodo: period, Dirección: r.direccionCFDI, Fuente: source, Rubro: tax, Tasa: rate,
      Base_MXN: base !== null && exchange !== null ? round(base * exchange) : '',
      'IVA trasladado emitidas (MXN)': tax === 'IVA' && issued && !pending ? converted : 0,
      'IVA acreditable pagado recibidas (MXN)': tax === 'IVA' && !issued && !pending ? converted : 0,
      'IVA emitido por cobrar (MXN)': tax === 'IVA' && issued && pending ? converted : 0,
      'IVA recibido pendiente de pago (MXN)': tax === 'IVA' && !issued && pending ? converted : 0,
      IVA_retenido_MXN: tax === 'RETENCIÓN IVA' && !pending ? converted : 0,
      ISR_retenido_MXN: tax === 'RETENCIÓN ISR' && !pending ? converted : 0,
      IVA_REP_facturas_otros_meses_MXN: source === 'REP' && tax === 'IVA' && invoice && invoice.fechaEmision?.slice(0, 7) !== period ? converted : 0,
      IVA_REP_factura_no_localizada_MXN: source === 'REP' && tax === 'IVA' && !invoice ? converted : 0,
      Estado: converted === '' ? 'NO CUANTIFICABLE' : pending ? 'INFORMATIVO PENDIENTE' : 'CUANTIFICADO',
    };
    detail.push(row);
    return converted;
  };
  // Primero se extraen todos los DR, incluyendo facturas que no están en el lote.
  for (const r of results.filter(r => r.tipoCFDI === 'P' && !cancelled(r) && ['EMITIDO', 'RECIBIDO'].includes(r.direccionCFDI || ''))) {
    const doc = new DOMParser().parseFromString(r.xmlContent || '', 'application/xml');
    const payments = children(doc, 'Pago');
    if (!payments.length) {
      alert(r, 'REP sin nodos Pago legibles; IVA no cuantificable.');
      add(r, 'SIN FECHA', 'REP', '', 'IVA', 'NO DESGLOSADA', null, null, null);
    }
    for (const payment of payments) {
      const date = payment.getAttribute('FechaPago') || '';
      if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
        alert(r, 'REP sin FechaPago válida; no se puede asignar el IVA al mes.');
        add(r, 'SIN FECHA', 'REP', '', 'IVA', 'NO DESGLOSADA', null, null, null);
        continue;
      }
      const currency = payment.getAttribute('MonedaP');
      const paymentRate = currency === 'MXN' ? 1 : numberAttr(payment, 'TipoCambioP');
      for (const dr of children(payment, 'DoctoRelacionado')) {
        const related = dr.getAttribute('IdDocumento') || '';
        const invoice = byUuid.get(related.toUpperCase());
        if (invoice && cancelled(invoice)) continue;
        if (invoice && (invoice.metodoPago === 'PUE' || invoice.tipoCFDI !== 'I' || invoice.direccionCFDI !== r.direccionCFDI)) {
          alert(r, `REP relacionado con CFDI incompatible (${related}); excluido para evitar doble conteo.`); continue;
        }
        const drCurrency = dr.getAttribute('MonedaDR');
        const equivalence = drCurrency && drCurrency === currency ? 1 : numberAttr(dr, 'EquivalenciaDR');
        const exchange = paymentRate && equivalence && currency && drCurrency ? paymentRate / equivalence : null;
        if (exchange === null) alert(r, `REP ${related}: falta TipoCambioP, MonedaP, MonedaDR o EquivalenciaDR; IVA no convertible a MXN.`);
        const taxes = [...children(dr, 'TrasladoDR'), ...children(dr, 'RetencionDR')];
        if (!taxes.length && dr.getAttribute('ObjetoImpDR') !== '01') {
          alert(r, `REP ${related}: sin impuestos DR desglosados; IVA no cuantificable.`);
          add(r, date.slice(0, 7), 'REP', related, 'IVA', 'NO DESGLOSADA', null, null, exchange);
        }
        for (const tax of taxes) {
          const retained = tax.localName === 'RetencionDR';
          const code = tax.getAttribute('ImpuestoDR');
          if (code !== '002' && !(retained && code === '001')) continue;
          const factor = tax.getAttribute('TipoFactorDR') || '';
          const amount = factor === 'Exento' ? 0 : numberAttr(tax, 'ImporteDR');
          const base = numberAttr(tax, 'BaseDR');
          if (amount === null || base === null) alert(r, `REP ${related}: BaseDR o ImporteDR ausente; no se estiman impuestos.`);
          const taxRate = rateLabel(tax.getAttribute('TasaOCuotaDR') || '', factor);
          const converted = add(r, date.slice(0, 7), 'REP', related, retained ? code === '001' ? 'RETENCIÓN ISR' : 'RETENCIÓN IVA' : 'IVA', taxRate, base, amount, exchange);
          if (!retained && amount !== null && invoice?.moneda === drCurrency) {
            const key = `${related.toUpperCase()}|${taxRate}`;
            paidVat.set(key, (paidVat.get(key) || 0) + amount);
            paidVat.set(related.toUpperCase(), (paidVat.get(related.toUpperCase()) || 0) + amount);
          }
        }
      }
    }
  }
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
  return { detail, totals: [...Array.from(monthly.values()), ...Array.from(groups.values())], alerts };
}
