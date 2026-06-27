export interface CFDIMetodoPagoInput {
  uuid: string;
  metodoPago: string;
  formaPago: string;
  tipoDeComprobante: string;
  fecha: string;
  rfcEmisor: string;
  nombreEmisor: string;
  montoTotal: number;
  ivaTotal: number;
  uuidRelacionados?: string[];
}

export interface MetodoPagoValidacion {
  uuid: string;
  rfcEmisor: string;
  nombreEmisor: string;
  metodoPago: string;
  formaPago: string;
  tieneComplemento: boolean;
  ivaEnRiesgo: number;
  nivel: 'ok' | 'alerta' | 'critico';
  mensaje: string;
  fundamento: string;
}

const FUNDAMENTO = 'Art. 29-A CFF, tercer párrafo';

export function validarMetodosPago(
  cfdiLote: CFDIMetodoPagoInput[]
): MetodoPagoValidacion[] {
  const complementos = new Set<string>();

  cfdiLote
    .filter(cfdi => String(cfdi.tipoDeComprobante || '').trim().toUpperCase() === 'P')
    .forEach(cfdi => {
      (cfdi.uuidRelacionados || []).forEach(uuid => {
        if (uuid?.trim()) {
          complementos.add(uuid.trim().toUpperCase());
        }
      });
    });

  return cfdiLote.map(cfdi => {
    const uuid = String(cfdi.uuid || '').trim().toUpperCase();
    const metodoPago = String(cfdi.metodoPago || '').trim().toUpperCase();
    const formaPago = String(cfdi.formaPago || '').trim();
    const tipoDeComprobante = String(cfdi.tipoDeComprobante || '').trim().toUpperCase();
    const montoTotal = Number(cfdi.montoTotal || 0);
    const ivaTotal = Number(cfdi.ivaTotal || 0);
    const tieneComplemento =
      tipoDeComprobante === 'P'
        ? Array.isArray(cfdi.uuidRelacionados) && cfdi.uuidRelacionados.length > 0
        : Boolean(uuid && complementos.has(uuid));

    let nivel: MetodoPagoValidacion['nivel'] = 'ok';
    let mensaje = 'Método de pago y complementos detectados parecen consistentes.';
    let ivaEnRiesgo = 0;

    if (tipoDeComprobante === 'P') {
      if (montoTotal !== 0) {
        nivel = 'critico';
        mensaje =
          'CFDI tipo P debe emitirse con Total=0.00. Un recibo de pago con Total distinto indica una posible inconsistencia fiscal.';
      } else if (!tieneComplemento) {
        nivel = 'alerta';
        mensaje =
          'Recibo de pago tipo P sin UUIDs relacionados. Verifique que el complemento pague realmente a facturas válidas del lote.';
      }
    }

    if (tipoDeComprobante !== 'P' && metodoPago === 'PPD') {
      if (!tieneComplemento) {
        nivel = nivel === 'critico' ? 'critico' : 'alerta';
        mensaje =
          'CFDI con MetodoPago PPD sin complemento de pago detectado en el lote. El IVA del comprobante queda en riesgo hasta que se acredite el pago.';
        ivaEnRiesgo = ivaTotal;
      } else {
        mensaje =
          'CFDI PPD con complemento de pago detectado en el lote. El IVA está acreditado conforme al flujo de pago.';
      }
    }

    if (tipoDeComprobante !== 'P' && metodoPago === 'PUE') {
      mensaje =
        'CFDI con MetodoPago PUE no requiere complemento de pago en el lote y se considera menos riesgoso para IVA.';
    }

    return {
      uuid,
      rfcEmisor: cfdi.rfcEmisor,
      nombreEmisor: cfdi.nombreEmisor,
      metodoPago,
      formaPago,
      tieneComplemento,
      ivaEnRiesgo,
      nivel,
      mensaje,
      fundamento: FUNDAMENTO,
    };
  });
}
