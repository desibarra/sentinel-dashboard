
import { BlacklistValidation } from "@/utils/blacklistValidator";
import { evaluarMaterialidadGasto } from "./materialityRules";
import { DireccionCFDI } from "./direccionCFDI";

export interface ConceptoDesglose {
    numero: number;
    importe: number;
    descuento: number;
    objetoImp: string;
    claveProdServ: string;
    descripcion: string;
    cantidad?: number;
    noIdentificacion?: string;
    valorUnitario?: number;
    traslados: Array<{ impuesto: string; tasa: string; importe: number; base: number; tipoFactor?: string }>;
    retenciones: Array<{ impuesto: string; tasa: string; importe: number; base: number; tipoFactor?: string }>;
    subtotalAcumulado: number;
    totalParcial: number;
}

export interface ValidationResult {
    fileName: string;
    uuid: string;
    versionCFDI: string;
    tipoCFDI: string;
    serie: string;
    folio: string;
    fechaEmision: string;
    horaEmision: string;
    xmlContent?: any;
    añoFiscal: number;
    estatusSAT: string;
    fechaCancelacion: string;
    rfcEmisorBlacklist?: BlacklistValidation;
    rfcReceptorBlacklist?: BlacklistValidation;
    cfdiSustituido: string;
    uuidSustitucion: string;
    rfcEmisor: string;
    nombreEmisor: string;
    regimenEmisor: string;
    estadoSATEmisor: string;
    rfcReceptor: string;
    nombreReceptor: string;
    regimenReceptor: string;
    usoCFDI: string;
    cpReceptor: string;
    tieneCfdiRelacionados: string;
    tipoRelacion: string;
    uuidRelacionado: string;
    uuids_relacionados: string[]; // ✅ Nuevo para soporte multi-UUID
    tipoRealDocumento: string;
    requiereCartaPorte: string;
    cartaPorte: string;
    cartaPorteCompleta: string;
    versionCartaPorte: string;
    pagosPresente: string;
    versionPagos: string;
    pagosValido: string;
    encodingDetectado: string;
    complementosDetectados: string[];
    scoreInformativo: number;
    subtotal: number;
    baseIVA16: number;
    baseIVA8: number;
    baseIVA0: number;
    baseIVAExento: number;
    baseNoObjeto: number;          // ObjetoImp=01: No objeto de impuesto
    baseObjetoSinDesglose: number; // ObjetoImp=03: Objeto pero sin desglose obligatorio
    clasificacionFiscal: string;   // Clasificación explícita: GRAVADO/EXENTO/NO_OBJETO/OBJETO_SIN_DESGLOSE/MIXTO
    ivaTraslado: number;
    ivaRetenido: number;
    isrRetenido: number;
    iepsTraslado: number;
    iepsRetenido: number;
    impuestosLocalesTrasladados: number;
    impuestosLocalesRetenidos: number;
    total: number;
    moneda: string;
    tipoCambio: number;
    formaPago: string;
    metodoPago: string;
    nivelValidacion: string;
    resultado: string;
    comentarioFiscal: string;
    observacionesTecnicas: string;
    iva: number;
    isValid: boolean;
    totalCalculado: number;
    diferenciaTotales: number;
    desglosePorConcepto: ConceptoDesglose[];
    desglosePagos?: any[];
    // Detalle de DoctoRelacionado extraído del complemento Pagos — solo se
    // llena para CFDI Tipo P (REP). Ver extractPagoDetalles/reconciliarPagosPPD.
    pagosRelacionados?: PagoRelacionadoDetalle[];
    // Resultado de la conciliación central PPD↔REP aplicado por
    // aplicarConciliacionPagos — misma fuente que Dashboard/Resumen/Excel.
    pagosRelacionadosEstado?: EstadoPagoFactura | EstadoREP;
    pagosRelacionadosTotalPagado?: number;
    pagosRelacionadosSaldoInsoluto?: number | null;
    pagosRelacionadosObservacion?: string;
    /** Informativo: REP con FechaPago comprobada anterior al 01/09/2018. No cambia el estado de pago. */
    pagosRelacionadosHistoricamenteExento?: boolean;
    desglose: string;
    esNomina: string;
    versionNomina: string;
    totalPercepciones: number;
    totalDeducciones: number;
    totalOtrosPagos: number;
    isrRetenidoNomina: number;
    totalCalculadoNomina: number;
    observacionesContador?: string;
    resultadoMotor?: string; // Sin considerar SAT
    comentarioMotor?: string; // Sin considerar SAT
    ultimoRefrescoSAT?: string; // ISO Date de cuándo se verificó por última vez
    giroEmpresa?: string; // ✅ Nuevo: Giro declarado de la empresa para análisis de materialidad
    deleted?: boolean;
    deletedAt?: string;
    trazabilidadInfo?: TrazabilidadFiscalInfo;
    // ✅ FASE 2 - AUDIT FIX: Campos fiscales complementarios extraídos directamente del Comprobante
    descuentoGlobal: number;    // Atributo Descuento del Comprobante (puede diferir de Σ descuentos por concepto en edge cases)
    condicionesDePago: string;  // Atributo CondicionesDePago del Comprobante (campo opcional SAT)
    // Campos para auditoría preventiva IVA (opcional para compatibilidad)
    fiscalRiskLevel?: 'VERDE' | 'AMARILLO' | 'ROJO';
    fiscalRiskReason?: string;
    fiscalRuleApplied?: string;
    paymentMethodStatus?: 'PUE_VALIDO' | 'PUE_REVISAR_COBRO' | 'PPD_CON_COMPLEMENTO' | 'PPD_SIN_COMPLEMENTO' | 'PPD_REVISAR_COMPLEMENTO' | string;
    paymentComplementStatus?: 'COMPLETO' | 'SIN_COMPLEMENTO' | 'COMPLEMENTO_FUERA_DE_PERIODO' | 'UUID_RELACIONADO_NO_ENCONTRADO' | 'REVISAR_FECHA' | string;
    ivaCreditabilityStatus?: 'ACREDITABLE' | 'NO_ACREDITABLE' | 'POR_DETERMINAR' | string;
    // ✅ DIRECCIÓN DEL CFDI: corrección de espejos contables. La empresa audita
    // sus propios comprobantes; un CFDI "tipo I" recibido NO es ingreso propio.
    direccionCFDI?: DireccionCFDI;       // 'EMITIDO' | 'RECIBIDO' | 'REQUIERE_REVISION'
    rfcEmpresaEvaluada?: string;          // RFC de la empresa que audita (no hardcodeado)
    naturalezaParaEmpresa?: string;       // INGRESO/VENTA | COMPRA/GASTO | etc.
    impactoIVA?: string;                  // IVA TRASLADADO (A CARGO) | IVA ACREDITABLE (A FAVOR) | etc.
    motivoClasificacion?: string;         // Explicación legible de la clasificación
}

export interface UbicacionCP {
  tipoUbicacion: string;
  idUbicacion: string;
  rfcRemitenteDestinatario: string;
  nombreRemitenteDestinatario: string;
  fechaHoraSalidaLlegada: string;
  calle: string;
  numeroExterior: string;
  numeroInterior: string;
  colonia: string;
  localidad: string;
  municipio: string;
  estado: string;
  pais: string;
  codigoPostal: string;
  referencia: string;
}

export interface MercanciaCP {
  bienesTransp: string;
  descripcion: string;
  cantidad: string;
  claveUnidad: string;
  unidad: string;
  pesoEnKg: string;
  valorMercancia: string;
  moneda: string;
  fraccionArancelaria: string;
  uuidComercioExt: string;
  materialPeligroso: string;
  cveMaterialPeligroso: string;
  embalaje: string;
}

export interface RemolqueCP {
  subTipoRem: string;
  placa: string;
}

export interface AutotransporteCP {
  permSCT: string;
  numPermisoSCT: string;
  configVehicular: string;
  placaVM: string;
  anioModeloVM: string;
  aseguradoraRespCivil: string;
  polizaRespCivil: string;
  remolques: RemolqueCP[];
}

export interface FiguraCP {
  tipoFigura: string;
  rfcFigura: string;
  nombreFigura: string;
  numLicencia: string;
  residenciaFiscal: string;
  numRegIdTrib: string;
}

export interface CartaPorteDetalle {
  version: string;
  transpInternac: string;
  transporteInternacional: string;
  entradaSalidaMercancia: string;
  paisOrigenDestino: string;
  viaEntradaSalida: string;
  totalDistanciaRecorrida: string;
  pesoBrutoTotal: string;
  unidadPeso: string;
  numTotalMercancias: string;
  origenes: UbicacionCP[];
  destinos: UbicacionCP[];
  mercancias: MercanciaCP[];
  autotransporte: AutotransporteCP | null;
  figuras: FiguraCP[];
  origen?: UbicacionCP;
  destino?: UbicacionCP;
  operador?: FiguraCP;
  mercanciaPrincipal?: string;
}

export interface TrazabilidadFiscalInfo {
    fechaCobro: string;
    folioTransferencia: string;
    banco: string;
    identificadorBancario: string;
    observacionSAT: string;

    exportacion: string;
    destinoExtranjero: string;
    tienePedimento: string;
    pedimento: string;
    tieneDoda: string;
    numeroDodaIntegracion: string;
    soporteComercioExterior: string;
    diagnosticoTasa0: string;
    accionRecomendadaTasa0: string;

    ivaAcreditable: number;
    fechaPago: string;
    diagnosticoIvaAcreditable: string;
    accionRecomendadaIvaAcreditable: string;

    tieneCartaPorte: string;
    tienePlacasUnidad: string;
    tieneRemolque: string;
    tieneOperador: string;
    tieneOrigen: string;
    tieneDestino: string;
    tieneMercancias: string;
    cartaPorteDetalle?: CartaPorteDetalle | null;
    placas?: any;
    remolques?: any;
    rfcOperador?: any;
    distancia?: any;
    permisoSCT?: any;
    transporteInternacional?: any;
    tienePesoDistancia: string;
    tieneEntryNumber: string;
    datosFaltantes: string;
    fuenteExternaRequerida: string;
    diagnosticoDatosFaltantes: string;
    accionRecomendadaDatosFaltantes: string;
    auditableSoloConXML: string;

    estadoDeCuenta: string;
    nivelExpediente: string;
    estatusDocumental: string;
    riesgo: string;
    accionRecomendadaMatriz: string;
}

export function extraerDetalleCartaPorte(doc: Document): CartaPorteDetalle | null {
  try {
    const todosLosElementos = doc.getElementsByTagName("*");
    let nodoCP: Element | null = null;
    for (let i = 0; i < todosLosElementos.length; i++) {
      const el = todosLosElementos[i];
      if (el.localName === "CartaPorte") {
        nodoCP = el;
        break;
      }
    }
    if (!nodoCP) return null;

    const getAttr = (el: Element | null | undefined, name: string): string => {
      if (!el) return "NO VIENE EN XML";
      const val = el.getAttribute(name);
      return val !== null && val !== undefined ? val : "NO VIENE EN XML";
    };

    const transpInternac = getAttr(nodoCP, "TranspInternac");
    const entradaSalidaMerc = getAttr(nodoCP, "EntradaSalidaMerc");
    const paisOrigenDestino = getAttr(nodoCP, "PaisOrigenDestino");
    const viaEntradaSalida = getAttr(nodoCP, "ViaEntradaSalida");
    const totalDistRecorrida = getAttr(nodoCP, "TotalDistRecorrida") !== "NO VIENE EN XML" ? getAttr(nodoCP, "TotalDistRecorrida") : getAttr(nodoCP, "TotalDistRec");

    let cpVersion = getAttr(nodoCP, "Version");
    const ns = nodoCP.namespaceURI || "";
    if (ns.includes("CartaPorte31")) {
      cpVersion = "3.1";
    } else if (ns.includes("CartaPorte30")) {
      cpVersion = "3.0";
    } else if (ns.includes("CartaPorte20")) {
      cpVersion = "2.0";
    } else if (cpVersion === "4.0" || cpVersion === "2.0" || cpVersion === "NO VIENE EN XML") {
      cpVersion = "3.1";
    }

    const detalle: CartaPorteDetalle = {
      version: cpVersion,
      transpInternac,
      transporteInternacional: transpInternac,
      entradaSalidaMercancia: entradaSalidaMerc,
      paisOrigenDestino,
      viaEntradaSalida,
      totalDistanciaRecorrida: totalDistRecorrida,
      pesoBrutoTotal: "NO VIENE EN XML",
      unidadPeso: "NO VIENE EN XML",
      numTotalMercancias: "NO VIENE EN XML",
      origenes: [],
      destinos: [],
      mercancias: [],
      autotransporte: null,
      figuras: []
    };

    const hijosCP = nodoCP.children || nodoCP.childNodes;
    for (let i = 0; i < hijosCP.length; i++) {
      const hijo = hijosCP[i];
      if (hijo.nodeType !== 1) continue;
      const elHijo = hijo as Element;

      if (elHijo.localName === "Ubicaciones") {
        const ubicaciones = elHijo.children || elHijo.childNodes;
        for (let j = 0; j < ubicaciones.length; j++) {
          const u = ubicaciones[j];
          if (u.nodeType !== 1) continue;
          const elU = u as Element;
          if (elU.localName === "Ubicacion") {
            const tipo = getAttr(elU, "TipoUbicacion");
            let domCalle = "NO VIENE EN XML";
            let domNumExt = "NO VIENE EN XML";
            let domNumInt = "NO VIENE EN XML";
            let domColonia = "NO VIENE EN XML";
            let domLocalidad = "NO VIENE EN XML";
            let domMunicipio = "NO VIENE EN XML";
            let domEstado = "NO VIENE EN XML";
            let domPais = "NO VIENE EN XML";
            let domCP = "NO VIENE EN XML";
            let domRef = "NO VIENE EN XML";

            const doms = elU.children || elU.childNodes;
            for (let k = 0; k < doms.length; k++) {
              const d = doms[k];
              if (d.nodeType === 1 && (d as Element).localName === "Domicilio") {
                const elD = d as Element;
                domCalle = getAttr(elD, "Calle");
                domNumExt = getAttr(elD, "NumeroExterior");
                domNumInt = getAttr(elD, "NumeroInterior");
                domColonia = getAttr(elD, "Colonia");
                domLocalidad = getAttr(elD, "Localidad");
                domMunicipio = getAttr(elD, "Municipio");
                domEstado = getAttr(elD, "Estado");
                domPais = getAttr(elD, "Pais");
                domCP = getAttr(elD, "CodigoPostal");
                domRef = getAttr(elD, "Referencia");
                break;
              }
            }

            const ubicacionObj: UbicacionCP = {
              tipoUbicacion: tipo,
              idUbicacion: getAttr(elU, "IDUbicacion"),
              rfcRemitenteDestinatario: getAttr(elU, "RFCRemitenteDestinatario"),
              nombreRemitenteDestinatario: getAttr(elU, "NombreRemitenteDestinatario"),
              fechaHoraSalidaLlegada: getAttr(elU, "FechaHoraSalidaLlegada") !== "NO VIENE EN XML" ? getAttr(elU, "FechaHoraSalidaLlegada") : getAttr(elU, "FechaHoraProg"),
              calle: domCalle,
              numeroExterior: domNumExt,
              numeroInterior: domNumInt,
              colonia: domColonia,
              localidad: domLocalidad,
              municipio: domMunicipio,
              estado: domEstado,
              pais: domPais,
              codigoPostal: domCP,
              referencia: domRef
            };

            if (tipo === "Origen") {
              detalle.origenes.push(ubicacionObj);
            } else if (tipo === "Destino") {
              detalle.destinos.push(ubicacionObj);
            }
          }
        }
      }

      if (elHijo.localName === "Mercancias") {
        detalle.pesoBrutoTotal = getAttr(elHijo, "PesoBrutoTotal");
        detalle.unidadPeso = getAttr(elHijo, "UnidadPeso");
        detalle.numTotalMercancias = getAttr(elHijo, "NumTotalMercancias");

        const mercs = elHijo.children || elHijo.childNodes;
        for (let j = 0; j < mercs.length; j++) {
          const m = mercs[j];
          if (m.nodeType !== 1) continue;
          const elM = m as Element;
          if (elM.localName === "Mercancia") {
            const mercanciaObj: MercanciaCP = {
              bienesTransp: getAttr(elM, "BienesTransp"),
              descripcion: getAttr(elM, "Descripcion") !== "NO VIENE EN XML" ? getAttr(elM, "Descripcion") : getAttr(elM, "Descripción"),
              cantidad: getAttr(elM, "Cantidad"),
              claveUnidad: getAttr(elM, "ClaveUnidad"),
              unidad: getAttr(elM, "Unidad"),
              pesoEnKg: getAttr(elM, "PesoEnKg"),
              valorMercancia: getAttr(elM, "ValorMercancia"),
              moneda: getAttr(elM, "Moneda"),
              fraccionArancelaria: getAttr(elM, "FraccionArancelaria"),
              uuidComercioExt: getAttr(elM, "UUIDComercioExt"),
              materialPeligroso: getAttr(elM, "MaterialPeligroso"),
              cveMaterialPeligroso: getAttr(elM, "CveMaterialPeligroso"),
              embalaje: getAttr(elM, "Embalaje")
            };
            detalle.mercancias.push(mercanciaObj);
          } else if (elM.localName === "Autotransporte") {
            detalle.autotransporte = parseAutotransporte(elM, getAttr);
          }
        }
      }

      if (elHijo.localName === "Autotransporte") {
        detalle.autotransporte = parseAutotransporte(elHijo, getAttr);
      }

      if (elHijo.localName === "FiguraTransporte" || elHijo.localName === "TiposFigura") {
        const figs = elHijo.children || elHijo.childNodes;
        if (elHijo.localName === "TiposFigura") {
          const figObj = parseFigura(elHijo, getAttr);
          if (figObj.tipoFigura !== "NO VIENE EN XML" || figObj.rfcFigura !== "NO VIENE EN XML") {
            detalle.figuras.push(figObj);
          }
        }
        
        for (let j = 0; j < figs.length; j++) {
          const f = figs[j];
          if (f.nodeType !== 1) continue;
          const elF = f as Element;
          if (elF.localName === "TiposFigura" || elF.localName === "Operadores" || elF.localName === "Operador" || elF.localName === "FiguraTransporte") {
            if (elF.localName === "Operador" || elF.localName === "Operadores") {
              const figObj: FiguraCP = {
                tipoFigura: "01",
                rfcFigura: getAttr(elF, "RFCOperador") !== "NO VIENE EN XML" ? getAttr(elF, "RFCOperador") : getAttr(elF, "RFCFigura"),
                nombreFigura: getAttr(elF, "NombreOperador") !== "NO VIENE EN XML" ? getAttr(elF, "NombreOperador") : getAttr(elF, "NombreFigura"),
                numLicencia: getAttr(elF, "NumLicencia"),
                residenciaFiscal: getAttr(elF, "ResidenciaFiscalOperador") !== "NO VIENE EN XML" ? getAttr(elF, "ResidenciaFiscalOperador") : getAttr(elF, "ResidenciaFiscal"),
                numRegIdTrib: getAttr(elF, "NumRegIdTribOperador") !== "NO VIENE EN XML" ? getAttr(elF, "NumRegIdTribOperador") : getAttr(elF, "NumRegIdTrib")
              };
              detalle.figuras.push(figObj);
            } else {
              detalle.figuras.push(parseFigura(elF, getAttr));
            }
          }
        }
      }
    }

    detalle.origen = detalle.origenes[0];
    detalle.destino = detalle.destinos[0];
    detalle.operador = detalle.figuras.find(f => f.tipoFigura === "01") || detalle.figuras[0];
    detalle.mercanciaPrincipal = detalle.mercancias[0]?.descripcion;

    return detalle;
  } catch (error) {
    console.error("Error al extraer detalle de CartaPorte:", error);
    return null;
  }
}

function parseAutotransporte(el: Element, getAttr: (el: Element | null | undefined, name: string) => string): AutotransporteCP {
  let configVehicular = "NO VIENE EN XML";
  let placaVM = "NO VIENE EN XML";
  let anioModeloVM = "NO VIENE EN XML";
  let aseguradoraRespCivil = "NO VIENE EN XML";
  let polizaRespCivil = "NO VIENE EN XML";
  const remolques: RemolqueCP[] = [];

  const hijos = el.children || el.childNodes;
  for (let i = 0; i < hijos.length; i++) {
    const h = hijos[i];
    if (h.nodeType !== 1) continue;
    const elH = h as Element;
    if (elH.localName === "IdentificacionVehicular") {
      configVehicular = getAttr(elH, "ConfigVehicular");
      placaVM = getAttr(elH, "PlacaVM") !== "NO VIENE EN XML" ? getAttr(elH, "PlacaVM") : getAttr(elH, "Placa");
      anioModeloVM = getAttr(elH, "AnioModeloVM");
    } else if (elH.localName === "Seguros") {
      aseguradoraRespCivil = getAttr(elH, "AseguradoraRespCivil") !== "NO VIENE EN XML" ? getAttr(elH, "AseguradoraRespCivil") : getAttr(elH, "AseguraRespCivil");
      polizaRespCivil = getAttr(elH, "PolizaRespCivil");
    } else if (elH.localName === "Remolques") {
      const rems = elH.children || elH.childNodes;
      for (let j = 0; j < rems.length; j++) {
        const rNode = rems[j];
        if (rNode.nodeType === 1 && (rNode as Element).localName === "Remolque") {
          const elR = rNode as Element;
          remolques.push({
            subTipoRem: getAttr(elR, "SubTipoRem") !== "NO VIENE EN XML" ? getAttr(elR, "SubTipoRem") : getAttr(elR, "SubTipoRemolque"),
            placa: getAttr(elR, "Placa") !== "NO VIENE EN XML" ? getAttr(elR, "Placa") : getAttr(elR, "PlacaRemolque")
          });
        }
      }
    }
  }

  return {
    permSCT: getAttr(el, "PermSCT"),
    numPermisoSCT: getAttr(el, "NumPermisoSCT"),
    configVehicular,
    placaVM,
    anioModeloVM,
    aseguradoraRespCivil,
    polizaRespCivil,
    remolques
  };
}

function parseFigura(el: Element, getAttr: (el: Element | null | undefined, name: string) => string): FiguraCP {
  return {
    tipoFigura: getAttr(el, "TipoFigura"),
    rfcFigura: getAttr(el, "RFCFigura"),
    nombreFigura: getAttr(el, "NombreFigura"),
    numLicencia: getAttr(el, "NumLicencia"),
    residenciaFiscal: getAttr(el, "ResidenciaFiscal"),
    numRegIdTrib: getAttr(el, "NumRegIdTrib")
  };
}

export const evaluarTrazabilidad = (xmlDoc: XMLDocument, xmlContent: string, r: any): TrazabilidadFiscalInfo => {
    const comprobante = xmlDoc.documentElement;
    const exportacion = comprobante?.getAttribute("Exportacion") || "NO DISPONIBLE";
    
    let conceptoPrincipal = "";
    let maxImporte = -1;
    const conceptos = comprobante?.getElementsByTagName("*");
    if (conceptos) {
        for (let i = 0; i < conceptos.length; i++) {
            const nodo = conceptos[i];
            if ((nodo.localName || nodo.nodeName) === "Concepto") {
                const desc = nodo.getAttribute("Descripcion") || "";
                const imp = parseFloat(nodo.getAttribute("Importe") || "0");
                if (imp > maxImporte) {
                    maxImporte = imp;
                    conceptoPrincipal = desc;
                }
            }
        }
    }

    let tieneCartaPorte = "No";
    let tienePlacasUnidad = "No";
    let tieneRemolque = "No";
    let tieneOperador = "No";
    let tieneOrigen = "No";
    let tieneDestino = "No";
    let tieneMercancias = "No";
    let tienePesoDistancia = "No";
    
    const cartaPorteNodes = Array.from(comprobante?.getElementsByTagName("*") || []).filter(n => (n.localName || n.nodeName) === "CartaPorte");
    if (cartaPorteNodes.length > 0) {
        tieneCartaPorte = "SI";
        const cpNode = cartaPorteNodes[0];
        
        const ubicaciones = cpNode.getElementsByTagName("*");
        for (let i = 0; i < ubicaciones.length; i++) {
            const u = ubicaciones[i];
            const name = u.localName || u.nodeName;
            if (name === "Ubicacion") {
                const tipo = u.getAttribute("TipoUbicacion");
                if (tipo === "Origen") tieneOrigen = "SI";
                if (tipo === "Destino") tieneDestino = "SI";
            }
            if (name === "Autotransporte") {
                const ident = u.getElementsByTagName("*");
                for (let j = 0; j < ident.length; j++) {
                    const idn = ident[j];
                    if ((idn.localName || idn.nodeName) === "IdentificacionVehicular") {
                        if (idn.getAttribute("PlacaVM") || idn.getAttribute("Placa")) tienePlacasUnidad = "SI";
                    }
                    if ((idn.localName || idn.nodeName) === "Remolque") {
                        if (idn.getAttribute("Placa")) tieneRemolque = "SI";
                    }
                }
            }
            if (name === "Mercancias") {
                tieneMercancias = "SI";
                if (u.getAttribute("PesoBrutoTotal")) tienePesoDistancia = "SI";
            }
            if (name === "TiposFigura" || name === "FiguraTransporte") {
                const figs = u.getElementsByTagName("*");
                for (let j = 0; j < figs.length; j++) {
                    const fig = figs[j];
                    if ((fig.localName || fig.nodeName) === "TiposFigura" && fig.getAttribute("TipoFigura") === "01") tieneOperador = "SI";
                    if ((fig.localName || fig.nodeName) === "Operador") tieneOperador = "SI";
                }
            }
        }
    }
    
    if (tieneOrigen === "No" && xmlContent.includes('TipoUbicacion="Origen"')) tieneOrigen = "SI (Detectado)";
    if (tieneDestino === "No" && xmlContent.includes('TipoUbicacion="Destino"')) tieneDestino = "SI (Detectado)";
    if (tienePlacasUnidad === "No" && (xmlContent.match(/PlacaVM="[^"]+"/) || xmlContent.match(/Placa="[^"]+"/))) tienePlacasUnidad = "SI (Detectado)";
    if (tienePesoDistancia === "No" && xmlContent.match(/PesoBrutoTotal="[^"]+"/)) tienePesoDistancia = "SI (Detectado)";
    if (tieneMercancias === "No" && xmlContent.includes("NumTotalMercancias")) tieneMercancias = "SI (Detectado)";
    if (tieneOperador === "No" && (xmlContent.includes('TipoFigura="01"') || xmlContent.includes('<cartaporte:Operador'))) tieneOperador = "SI (Detectado)";

    let pedimentosStr = "";
    let tienePedimento = "No";
    if (xmlContent.includes("NumeroPedimento") || xmlContent.includes("NumPedimento") || xmlContent.includes("DocumentoAduanero") || xmlContent.includes("ComercioExterior")) {
        tienePedimento = "SI";
        const pedMatch = xmlContent.match(/NumeroPedimento="([^"]+)"/g) || xmlContent.match(/NumPedimento="([^"]+)"/g);
        if (pedMatch) {
            pedimentosStr = Array.from(new Set(pedMatch.map(m => m.split('"')[1]))).join(" | ");
        } else {
            pedimentosStr = "Detectado (sin detalle)";
        }
    } else {
        pedimentosStr = "REQUIERE CAPTURA/IMPORTACIÓN";
    }

    let tieneDoda = "No";
    let numeroDodaIntegracion = "REQUIERE CAPTURA/IMPORTACIÓN";
    const dodaRegex = /(?:DODA|PITA|num(?:ero)?\s*de\s*integracion)[\s-:]*([A-Z0-9]{10,25})/i;
    const matchDoda = xmlContent.match(dodaRegex);
    if (matchDoda) {
        tieneDoda = "SI (posible DODA detectado)";
        numeroDodaIntegracion = matchDoda[1];
    }

    let tieneEntryNumber = "No";
    if (/Entry[\s-:]*([A-Z0-9]{8,15})/i.test(xmlContent) || xmlContent.includes("Entry Number")) {
        tieneEntryNumber = "SI";
    }

    let identificadorBancario = "REQUIERE CAPTURA/IMPORTACIÓN";
    if (xmlContent.includes("CtaOrdenante") || xmlContent.includes("CtaBeneficiario")) {
        identificadorBancario = "SI (Detectado en CEP)";
    }
    
    let soporteComercioExterior = "REQUIERE CAPTURA/IMPORTACIÓN";
    let destinoExtranjero = r.rfcReceptor && r.rfcReceptor.startsWith("XEXX") ? "SI" : "NO";
    
    let diagnosticoTasa0 = "NO APLICA";
    let accionRecomendadaTasa0 = "NO APLICA";
    if (r.baseIVA0 > 0) {
        if (exportacion === "01" || exportacion === "02") {
            let faltas = [];
            if (tieneOrigen === "No") faltas.push("Origen");
            if (destinoExtranjero === "NO") faltas.push("Destino extranjero");
            if (tieneCartaPorte === "No") faltas.push("Carta Porte");
            if (tienePedimento === "No") faltas.push("Pedimento");
            if (faltas.length > 0) {
                diagnosticoTasa0 = "RIESGO EN TASA 0% / REQUIERE SOPORTE";
                accionRecomendadaTasa0 = "Falta: " + faltas.join(", ");
            } else {
                diagnosticoTasa0 = "SOPORTADO";
                accionRecomendadaTasa0 = "Ninguna";
            }
        } else {
            diagnosticoTasa0 = "Tasa 0% Nacional";
            accionRecomendadaTasa0 = "Verificar evidencia de entrega";
        }
    }

    let ivaAcreditable = (r.tipoCFDI === "E" || (r.tipoCFDI === "I" && r.rfcReceptor !== "Desconocido")) ? r.ivaTraslado : 0;
    let diagnosticoIvaAcreditable = ivaAcreditable > 0 ? (identificadorBancario.includes("SI") ? "ACREDITAMIENTO SOPORTADO" : "FALTA CRUCE CON ESTADO DE CUENTA") : "NO APLICA";
    let accionRecomendadaIvaAcreditable = ivaAcreditable > 0 && !identificadorBancario.includes("SI") ? "Asociar transferencia o CEP" : "Ninguna";

    let datosFaltantes = "Ninguno";
    let fuenteExternaRequerida = "NO";
    let diagnosticoDatosFaltantes = "XML Básico";
    let accionRecomendadaDatosFaltantes = "Ninguna";
    let auditableSoloConXML = "SI";

    let nivelExpediente = "SOPORTE FISCAL PARCIAL";
    let estatusDocumental = "Válido a nivel SAT";
    let riesgo = "MEDIO";
    let accionRecomendadaMatriz = "Ninguna";

    const esFleteOCartaPorte = tieneCartaPorte === "SI" || /flete|transporte|acarreo/i.test(conceptoPrincipal) || 
                        Array.from(comprobante?.getElementsByTagName("*") || []).some(n => (n.localName || n.nodeName) === "Concepto" && /^78101[78]\d{2}|^78102\d{3}/.test(n.getAttribute("ClaveProdServ")||""));

    if (esFleteOCartaPorte) {
        if (tieneCartaPorte === "No") {
            diagnosticoDatosFaltantes = "FALTA CARTA PORTE";
            datosFaltantes = "Complemento Carta Porte";
            fuenteExternaRequerida = "SI (Soporte Transportista)";
            accionRecomendadaDatosFaltantes = "Solicitar Carta Porte al emisor";
            auditableSoloConXML = "NO";
            nivelExpediente = "NO APTO PARA TRAZABILIDAD ADUANERA DIRECTA";
        } else if (tieneOrigen.includes("SI") && tieneDestino.includes("SI")) {
            diagnosticoDatosFaltantes = "Carta Porte Logística Completa";
            nivelExpediente = tienePedimento === "No" ? "LOGÍSTICA SIN SOPORTE ADUANAL" : "SOPORTE FISCAL Y LOGÍSTICO PARCIAL";
            auditableSoloConXML = "SI (Logística)";
        } else {
            nivelExpediente = "SOPORTE FISCAL Y LOGÍSTICO PARCIAL";
        }
    }

    if (tienePedimento === "SI") {
        if (!tieneDoda.includes("SI")) {
            diagnosticoDatosFaltantes = "FALTA DODA / NÚMERO DE INTEGRACIÓN";
            datosFaltantes = "DODA";
            fuenteExternaRequerida = "SI (Agente Aduanal)";
            accionRecomendadaDatosFaltantes = "Cruzar pedimento con agente aduanal";
            auditableSoloConXML = "NO";
            nivelExpediente = "SOPORTE ADUANERO PARCIAL";
            riesgo = "MEDIO-ALTO";
        } else {
            nivelExpediente = "SOPORTE ADUANERO ROBUSTO";
            diagnosticoDatosFaltantes = "Pedimento y DODA detectados";
            auditableSoloConXML = "SI (Con VUCEM)";
            riesgo = "BAJO";
        }
    } else if (exportacion === "01" || exportacion === "02" || r.baseIVA0 > 0) {
        if (tienePedimento === "No") {
            diagnosticoDatosFaltantes = "FALTA PEDIMENTO / REQUIERE AGENTE ADUANAL";
            fuenteExternaRequerida = "SI (Agente Aduanal)";
            datosFaltantes = "Pedimento";
            accionRecomendadaDatosFaltantes = "Obtener pedimento para soportar exportación";
            auditableSoloConXML = "NO";
        }
    }

    if (tieneEntryNumber === "SI") {
        nivelExpediente = "ADUANERA EUA";
    }

    if (nivelExpediente === "SOPORTE ADUANERO ROBUSTO" && identificadorBancario.includes("SI")) {
        nivelExpediente = "EXPEDIENTE SOPORTADO";
        estatusDocumental = "Completo";
        riesgo = "NULO";
        accionRecomendadaMatriz = "Archivar para auditoría";
    }

    if (r.baseIVA0 > 0 && tienePedimento === "No") {
        nivelExpediente = "RIESGO EN TASA 0% / REQUIERE SOPORTE";
        riesgo = "ALTO";
        estatusDocumental = "Incompleto";
        accionRecomendadaMatriz = "Completar expediente aduanero";
    }
    
    if (nivelExpediente === "SOPORTE FISCAL PARCIAL" && !identificadorBancario.includes("SI")) {
        accionRecomendadaMatriz = "FALTA CRUCE CON ESTADO DE CUENTA";
    }

    const cartaPorteDetalle = extraerDetalleCartaPorte(xmlDoc);

    return {
        fechaCobro: "REQUIERE CAPTURA/IMPORTACIÓN",
        folioTransferencia: "REQUIERE CAPTURA/IMPORTACIÓN",
        banco: "REQUIERE CAPTURA/IMPORTACIÓN",
        identificadorBancario,
        observacionSAT: r.estatusSAT,

        exportacion,
        destinoExtranjero,
        tienePedimento,
        pedimento: pedimentosStr,
        tieneDoda,
        numeroDodaIntegracion,
        soporteComercioExterior,
        diagnosticoTasa0,
        accionRecomendadaTasa0,

        ivaAcreditable,
        fechaPago: "REQUIERE CAPTURA/IMPORTACIÓN",
        diagnosticoIvaAcreditable,
        accionRecomendadaIvaAcreditable,

        tieneCartaPorte,
        tienePlacasUnidad,
        tieneRemolque,
        tieneOperador,
        tieneOrigen,
        tieneDestino,
        tieneMercancias,
        tienePesoDistancia,
        tieneEntryNumber,
        datosFaltantes,
        fuenteExternaRequerida,
        diagnosticoDatosFaltantes,
        accionRecomendadaDatosFaltantes,
        auditableSoloConXML,

        estadoDeCuenta: "REQUIERE CAPTURA/IMPORTACIÓN",
        nivelExpediente,
        estatusDocumental,
        riesgo,
        accionRecomendadaMatriz,
        cartaPorteDetalle: cartaPorteDetalle
    };
};

export const detectCFDIVersion = (xmlContent: string): string => {
    // ✅ AUDIT FIX: Usar DOM como fuente primaria para evitar falsos positivos con comentarios XML
    try {
        const doc = new DOMParser().parseFromString(xmlContent, "text/xml");
        if (doc.getElementsByTagName("parsererror").length === 0) {
            const comp = doc.documentElement;
            if (comp && (comp.localName === "Comprobante" || comp.nodeName.includes("Comprobante"))) {
                const v = comp.getAttribute("Version") || comp.getAttribute("version");
                if (v) return v;
            }
        }
    } catch {}
    // Fallback regex — buscar Version SOLO dentro del elemento Comprobante
    const m = xmlContent.match(/Comprobante[^>]*Version="([^"]+)"/);
    return m ? m[1] : "DESCONOCIDA";
};

export const parseXMLDate = (dateStr: string): { fecha: string; hora: string } => {
    if (!dateStr) return { fecha: "NO DISPONIBLE", hora: "NO DISPONIBLE" };
    const parts = dateStr.split("T");
    const fecha = parts[0] || "NO DISPONIBLE";
    const hora = parts[1]?.substring(0, 8) || "NO DISPONIBLE";
    return { fecha, hora };
};

export const extractCPReceptor = (xmlDoc: XMLDocument, version: string): string => {
    const todosNodos = xmlDoc.documentElement?.getElementsByTagName("*");
    if (todosNodos) {
        for (let i = 0; i < todosNodos.length; i++) {
            const nodo = todosNodos[i];
            const tagName = nodo.localName || nodo.nodeName;
            if (version === "4.0" && (tagName === "Receptor" || tagName === "cfdi:Receptor")) {
                const cp = nodo.getAttribute("DomicilioFiscalReceptor");
                if (cp) return cp;
            }
            if (nodo.hasAttribute("CodigoPostal")) return nodo.getAttribute("CodigoPostal") || "NO DISPONIBLE";
            if (nodo.hasAttribute("codigoPostal")) return nodo.getAttribute("codigoPostal") || "NO DISPONIBLE";
        }
    }
    return "NO DISPONIBLE";
};

export const extractCfdiRelacionados = (xmlDoc: XMLDocument, xmlContent: string): {
    tieneCfdiRelacionados: string;
    tipoRelacion: string;
    uuidRelacionado: string;
    uuids_relacionados: string[];
} => {
    const tieneCfdiRelacionados = xmlContent.includes("CfdiRelacionados");
    if (!tieneCfdiRelacionados) {
        return {
            tieneCfdiRelacionados: "NO",
            tipoRelacion: "NO APLICA",
            uuidRelacionado: "NO APLICA",
            uuids_relacionados: []
        };
    }
    let tipoRelacion = "NO DISPONIBLE";
    const tipoRelacionMatch = xmlContent.match(/TipoRelacion="(\d{2})"/);
    if (tipoRelacionMatch) tipoRelacion = tipoRelacionMatch[1];

    // Extraer todos los UUIDs relacionados
    const uuids_relacionados: string[] = [];
    const uuidRegex = /CfdiRelacionado[^>]*UUID="([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})"/gi;
    let match;
    while ((match = uuidRegex.exec(xmlContent)) !== null) {
        uuids_relacionados.push(match[1].toUpperCase());
    }

    const uuidRelacionado = uuids_relacionados.length > 0 ? uuids_relacionados[0] : "NO DISPONIBLE";

    return {
        tieneCfdiRelacionados: "SI",
        tipoRelacion,
        uuidRelacionado,
        uuids_relacionados
    };
};

export const extractReceptorInfo = (xmlDoc: XMLDocument): { rfc: string; nombre: string; regimenFiscal: string; usoCFDI: string } => {
    let rfc = "NO DISPONIBLE";
    let nombre = "NO DISPONIBLE";
    let regimenFiscal = "NO DISPONIBLE";
    let usoCFDI = "NO DISPONIBLE";

    // Buscar nodo receptor
    const todosElementos = xmlDoc.documentElement?.getElementsByTagName("*");
    if (todosElementos) {
        for (let i = 0; i < todosElementos.length; i++) {
            const nodo = todosElementos[i];
            const tagName = nodo.localName || nodo.nodeName;

            if (tagName === "Receptor" || tagName === "cfdi:Receptor") {
                rfc = nodo.getAttribute("Rfc") || nodo.getAttribute("rfc") || rfc;
                nombre = nodo.getAttribute("Nombre") || nodo.getAttribute("nombre") || nombre;
                usoCFDI = nodo.getAttribute("UsoCFDI") || nodo.getAttribute("usoCFDI") || usoCFDI;
                regimenFiscal = nodo.getAttribute("RegimenFiscalReceptor") || nodo.getAttribute("regimenFiscalReceptor") || regimenFiscal;
                break;
            }
        }
    }

    return { rfc, nombre, regimenFiscal, usoCFDI };
};


export const determinarTipoRealDocumento = (tipoCFDI: string, tieneCfdiRelacionados: string, tipoRelacion: string): string => {
    if (tipoCFDI === "I" && tieneCfdiRelacionados === "SI" && tipoRelacion === "02") return "Nota de Cargo";
    if (tipoCFDI === "E" && tieneCfdiRelacionados === "SI" && tipoRelacion === "01") return "Nota de Crédito";
    if (tipoCFDI === "E") return "Egreso";
    if (tipoCFDI === "P") return "Pago (REP)";
    if (tipoCFDI === "N") return "Nómina";
    if (tipoCFDI === "T") return "Traslado";
    if (tipoCFDI === "I") return "Factura";
    return "Desconocido";
};

export const obtenerReglasAplicables = (version: string, añoFiscal: number, tipoCFDI: string) => {
    if (["2.0", "2.2", "3.0", "3.2"].includes(version)) {
        return { requiereCartaPorte: false, requiereComplementoPagos: false, versionPagosEsperada: "NO APLICA", validacionesAplicables: ["estructural", "totales", "campos-obligatorios"], contextoHistorico: `CFDI ${version} (${añoFiscal}): Reglas históricas SAT ${añoFiscal}, sin Carta Porte ni Pagos` };
    }
    if (version === "3.3") {
        return { requiereCartaPorte: false, requiereComplementoPagos: añoFiscal >= 2018 && tipoCFDI === "P", versionPagosEsperada: añoFiscal >= 2018 ? "1.0" : "NO APLICA", validacionesAplicables: ["estructural", "totales", "campos-obligatorios", "timbrado"], contextoHistorico: `CFDI 3.3 (${añoFiscal}): Reglas SAT ${añoFiscal}, ${añoFiscal >= 2018 ? 'Pagos 1.0 disponible' : 'Pre-Pagos'}, sin Carta Porte` };
    }
    if (version === "4.0") {
        return { requiereCartaPorte: ["T", "I"].includes(tipoCFDI), requiereComplementoPagos: tipoCFDI === "P", versionPagosEsperada: tipoCFDI === "P" ? "2.0" : "NO APLICA", validacionesAplicables: ["estructural", "totales", "campos-obligatorios", "timbrado", "carta-porte"], contextoHistorico: `CFDI 4.0 (${añoFiscal}): Reglas SAT vigentes ${añoFiscal}, Carta Porte obligatoria según tipo, Pagos 2.0` };
    }
    return { requiereCartaPorte: false, requiereComplementoPagos: false, versionPagosEsperada: "NO APLICA", validacionesAplicables: ["estructural"], contextoHistorico: `Versión ${version} no reconocida, validación mínima` };
};

export const extractTaxesByConcepto = (xmlDoc: XMLDocument, version: string) => {
    let subtotalCalculado = 0, baseIVA16 = 0, baseIVA8 = 0, baseIVA0 = 0, baseIVAExento = 0;
    // ✅ CFDI 4.0 - ObjetoImp: acumuladores por clasificación fiscal
    let baseNoObjeto = 0;          // ObjetoImp="01": No objeto de impuesto
    let baseObjetoSinDesglose = 0; // ObjetoImp="03": Objeto pero sin desglose obligatorio
    let trasladosTotales = 0, retencionesTotales = 0, ivaTraslado = 0, ivaRetenido = 0, isrRetenido = 0, iepsTraslado = 0, iepsRetenido = 0, impuestosLocalesTrasladados = 0, impuestosLocalesRetenidos = 0;
    const desglosePorConcepto: ConceptoDesglose[] = [];
    const comprobante = xmlDoc.documentElement;
    const conceptos = comprobante?.getElementsByTagName("*");
    let conceptoNumero = 0;
    if (conceptos) {
        for (let i = 0; i < conceptos.length; i++) {
            const nodo = conceptos[i];
            if ((nodo.localName || nodo.nodeName) !== "Concepto") continue;
            conceptoNumero++;
            const importe = parseFloat(nodo.getAttribute("Importe") || "0");
            const descuento = parseFloat(nodo.getAttribute("Descuento") || "0");
            const cantidadRaw = nodo.getAttribute("Cantidad");
            const cantidad = cantidadRaw !== null && cantidadRaw !== undefined ? parseFloat(cantidadRaw) : 1;
            const noIdentificacion = nodo.getAttribute("NoIdentificacion") || "";
            const valorUnitarioRaw = nodo.getAttribute("ValorUnitario");
            const valorUnitario = valorUnitarioRaw !== null && valorUnitarioRaw !== undefined ? parseFloat(valorUnitarioRaw) : importe;

            // ✅ REGLA FISCAL CORRECTA CFDI 4.0:
            // La clasificación depende EXCLUSIVAMENTE de ObjetoImp, NO de la existencia del nodo Impuestos.
            // Valores SAT oficiales:
            //   "01" = No objeto de impuesto  → base va a baseNoObjeto (NO_OBJETO)
            //   "02" = SI objeto de impuesto   → evaluar nodo Impuestos.Traslados
            //   "03" = Objeto sin desglose      → base va a baseObjetoSinDesglose
            // En CFDI 3.3 el atributo no existe; default "02" para compatibilidad.
            // ✅ AUDIT FIX: El default SIEMPRE es "02" (objeto de impuesto).
            // En CFDI 4.0 ObjetoImp es REQUERIDO según Anexo 20 SAT; si falta es error del PAC.
            // Asumir "01" (no objeto) causaba falsos NO USABLE al ignorar el IVA real del concepto.
            const objetoImp = nodo.getAttribute("ObjetoImp") || "02";
            const claveProdServ = nodo.getAttribute("ClaveProdServ") || "";
            const descripcion = nodo.getAttribute("Descripcion") || "";
            const baseConcepto = importe - descuento;

            subtotalCalculado += baseConcepto;

            // ✅ ObjetoImp="01": NO OBJETO — clasificar SIN revisar nodo Impuestos
            if (objetoImp === "01") {
                baseNoObjeto += baseConcepto;
                desglosePorConcepto.push({
                    numero: conceptoNumero, importe, descuento, objetoImp, claveProdServ, descripcion,
                    cantidad, noIdentificacion, valorUnitario,
                    traslados: [], retenciones: [],
                    subtotalAcumulado: subtotalCalculado, totalParcial: baseConcepto
                });
                continue; // NO evaluar impuestos; son no objeto
            }

            // ✅ ObjetoImp="03": OBJETO SIN DESGLOSE — acumular base pero sin detalle de impuestos
            if (objetoImp === "03") {
                baseObjetoSinDesglose += baseConcepto;
                desglosePorConcepto.push({
                    numero: conceptoNumero, importe, descuento, objetoImp, claveProdServ, descripcion,
                    cantidad, noIdentificacion, valorUnitario,
                    traslados: [], retenciones: [],
                    subtotalAcumulado: subtotalCalculado, totalParcial: baseConcepto
                });
                continue; // No hay desglose de impuestos exigible
            }

            // ✅ ObjetoImp="02" (o default CFDI 3.3): evaluar nodo Impuestos
            const trasladosConcepto: any[] = [], retencionesConcepto: any[] = [];
            const impuestosConcepto = Array.from(nodo.children).find(h => (h.localName || h.nodeName) === "Impuestos");

            if (impuestosConcepto) {
                const children = Array.from(impuestosConcepto.getElementsByTagName("*"));
                children.forEach((nodoImpuesto: any) => {
                    const tagImpuesto = nodoImpuesto.localName || nodoImpuesto.nodeName;
                    if (tagImpuesto === "Traslado") {
                        const tasa = nodoImpuesto.getAttribute("TasaOCuota") || "0", base = parseFloat(nodoImpuesto.getAttribute("Base") || "0"), importeTraslado = parseFloat(nodoImpuesto.getAttribute("Importe") || "0"), impuesto = nodoImpuesto.getAttribute("Impuesto") || "002", tipoFactor = nodoImpuesto.getAttribute("TipoFactor") || "Tasa";
                        trasladosTotales += importeTraslado;
                        trasladosConcepto.push({ impuesto, tasa, importe: importeTraslado, base, tipoFactor });
                        if (impuesto === "002") {
                            if (tasa === "0.16" || tasa === "0.160000") baseIVA16 += base;
                            else if (tasa === "0.08" || tasa === "0.080000") baseIVA8 += base;
                            else if (tasa === "0.00" || tasa === "0.000000") baseIVA0 += base;
                            else baseIVAExento += base; // Exento: ObjetoImp=02 sin tasa válida registrada
                            ivaTraslado += importeTraslado;
                        } else if (impuesto === "003") iepsTraslado += importeTraslado;
                    } else if (tagImpuesto === "Retencion") {
                        const impuesto = nodoImpuesto.getAttribute("Impuesto") || "002", importeRetencion = parseFloat(nodoImpuesto.getAttribute("Importe") || "0"), tasa = nodoImpuesto.getAttribute("TasaOCuota") || "0", base = parseFloat(nodoImpuesto.getAttribute("Base") || "0"), tipoFactor = nodoImpuesto.getAttribute("TipoFactor") || "Tasa";
                        retencionesTotales += importeRetencion;
                        retencionesConcepto.push({ impuesto, tasa, importe: importeRetencion, base, tipoFactor });
                        if (impuesto === "002") ivaRetenido += importeRetencion;
                        else if (impuesto === "001") isrRetenido += importeRetencion;
                        else if (impuesto === "003") iepsRetenido += importeRetencion;
                    }
                });
            } else {
                // ObjetoImp=02 pero SIN nodo Impuestos de concepto:
                // Según SAT puede ser exento real. Se registra en baseIVAExento.
                baseIVAExento += baseConcepto;
            }

            const totalParcial = baseConcepto + trasladosConcepto.reduce((sum, t) => sum + t.importe, 0) - retencionesConcepto.reduce((sum, r) => sum + r.importe, 0);
            desglosePorConcepto.push({ numero: conceptoNumero, importe, descuento, objetoImp, claveProdServ, descripcion, cantidad, noIdentificacion, valorUnitario, traslados: trasladosConcepto, retenciones: retencionesConcepto, subtotalAcumulado: subtotalCalculado, totalParcial });
        }
    }
    const todosNodos = comprobante?.getElementsByTagName("*");
    if (todosNodos) {
        for (let i = 0; i < todosNodos.length; i++) {
            const nodo = todosNodos[i];
            if ((nodo.localName || nodo.nodeName) === "ImpuestosLocales") {
                const totalTrasladados = nodo.getAttribute("TotaldeTraslados") || nodo.getAttribute("TotalImpuestosLocalesTrasladados");
                const totalRetenidos = nodo.getAttribute("TotaldeRetenciones") || nodo.getAttribute("TotalImpuestosLocalesRetenidos");
                if (totalTrasladados) impuestosLocalesTrasladados += parseFloat(totalTrasladados);
                if (totalRetenidos) impuestosLocalesRetenidos += parseFloat(totalRetenidos);
                Array.from(nodo.children).forEach((hijo: any) => {
                    const hijoTag = hijo.localName || hijo.nodeName;
                    if (hijoTag === "TrasladosLocales") {
                        const imp = parseFloat(hijo.getAttribute("Importe") || "0");
                        if (imp > 0 && !totalTrasladados) impuestosLocalesTrasladados += imp;
                    } else if (hijoTag === "RetencionesLocales") {
                        const imp = parseFloat(hijo.getAttribute("Importe") || "0");
                        if (imp > 0 && !totalRetenidos) impuestosLocalesRetenidos += imp;
                    }
                });
                break;
            }
        }
    }

    // ✅ Clasificación fiscal consolidada
    const baseGravadaTotal = Math.round((baseIVA16 + baseIVA8 + baseIVA0) * 100) / 100;
    const hayGravado = baseGravadaTotal > 0;
    const hayExento = baseIVAExento > 0;
    const hayNoObjeto = baseNoObjeto > 0;
    const haySinDesglose = baseObjetoSinDesglose > 0;
    const tiposActivos = [hayGravado, hayExento, hayNoObjeto, haySinDesglose].filter(Boolean).length;
    let clasificacionFiscal: string;
    if (tiposActivos > 1) clasificacionFiscal = "MIXTO";
    else if (hayGravado) clasificacionFiscal = "GRAVADO";
    else if (hayExento) clasificacionFiscal = "EXENTO";
    else if (hayNoObjeto) clasificacionFiscal = "NO_OBJETO";
    else if (haySinDesglose) clasificacionFiscal = "OBJETO_SIN_DESGLOSE";
    else clasificacionFiscal = "SIN_IMPUESTOS";

    return {
        subtotal: Math.round(subtotalCalculado * 100) / 100,
        baseIVA16: Math.round(baseIVA16 * 100) / 100,
        baseIVA8: Math.round(baseIVA8 * 100) / 100,
        baseIVA0: Math.round(baseIVA0 * 100) / 100,
        baseIVAExento: Math.round(baseIVAExento * 100) / 100,
        baseNoObjeto: Math.round(baseNoObjeto * 100) / 100,
        baseObjetoSinDesglose: Math.round(baseObjetoSinDesglose * 100) / 100,
        clasificacionFiscal,
        ivaTraslado: Math.round(ivaTraslado * 100) / 100,
        ivaRetenido: Math.round(ivaRetenido * 100) / 100,
        isrRetenido: Math.round(isrRetenido * 100) / 100,
        iepsTraslado: Math.round(iepsTraslado * 100) / 100,
        iepsRetenido: Math.round(iepsRetenido * 100) / 100,
        impuestosLocalesTrasladados: Math.round(impuestosLocalesTrasladados * 100) / 100,
        impuestosLocalesRetenidos: Math.round(impuestosLocalesRetenidos * 100) / 100,
        trasladosTotales: Math.round(trasladosTotales * 100) / 100,
        retencionesTotales: Math.round(retencionesTotales * 100) / 100,
        desglosePorConcepto
    };
};

/**
 * ✅ FASE 2 - AUDIT FIX (Hallazgo #5):
 * validateTotals ahora acepta descuentoGlobal como parámetro explícito.
 *
 * Fórmula SAT Anexo 20 (oficial):
 *   Total = SubTotal − Descuento + TotalImpuestosTrasladados − TotalImpuestosRetenidos
 *
 * El Descuento a nivel Comprobante puede diferir de Σ(descuentos por concepto) en CFDIs
 * donde el descuento se aplica globalmente (ej. descuento por pronto pago, bonificación global).
 * Si no se consideraba, la diferencia podía superar 0.01 → falso NO USABLE.
 *
 * COMPATIBILIDAD:
 * - CFDI 3.3: Descuento era opcional y puede no existir → fallback a 0 (sin cambio de comportamiento)
 * - CFDI 4.0: Descuento es opcional pero frecuente → se usa el valor real del atributo
 * - Si descuentoGlobal === 0 (valor por defecto), el cálculo es idéntico al anterior
 */
export const validateTotals = (taxesByConcepto: any, totalXML: number, descuentoGlobal: number = 0) => {
    // subtotal en taxesByConcepto = Σ(importe - descuento por concepto)
    // Si hay descuento global que ya no está en los conceptos individuales, hay que restarlo del subtotal calculado
    // Para evitar doble descuento: si Σ descuentos concepto ≈ descuentoGlobal → no hay diferencia.
    // Si descuentoGlobal > 0 pero los conceptos no tienen descuento → necesitamos restarlo.
    const sumDescuentosConcepto = taxesByConcepto.desglosePorConcepto
        ? (taxesByConcepto.desglosePorConcepto as any[]).reduce((sum: number, c: any) => sum + (c.descuento || 0), 0)
        : 0;
    // Solo aplicar corrección si el descuento global difiere significativamente de la suma de conceptos
    const descuentoAjuste = Math.abs(descuentoGlobal - sumDescuentosConcepto) > 0.01
        ? (descuentoGlobal - sumDescuentosConcepto)
        : 0;
    const totalCalculado = taxesByConcepto.subtotal
        - descuentoAjuste
        + taxesByConcepto.trasladosTotales
        - taxesByConcepto.retencionesTotales
        + taxesByConcepto.impuestosLocalesTrasladados
        - taxesByConcepto.impuestosLocalesRetenidos;
    const diferencia = Math.abs(totalCalculado - totalXML);
    const tolerancia = 0.01;
    return { isValid: diferencia <= tolerancia, calculado: Math.round(totalCalculado * 100) / 100, diferencia: Math.round(diferencia * 100) / 100, explicacion: descuentoAjuste !== 0 ? `Ajuste por descuento global: ${descuentoAjuste.toFixed(2)}` : "" };
};

export const generateDesglose = (result: any): string => {
    let desglose = "DESGLOSE POR CONCEPTO:\n\n";
    result.desglosePorConcepto.forEach((concepto: any) => {
        desglose += `Concepto ${concepto.numero}\n  Importe: $${concepto.importe.toFixed(2)}\n`;
    });
    return desglose;
};

export const determineRequiereCartaPorte = (xmlContent: string, tipoCFDI: string, version: string): string => {
    if (version === "3.3") return "NO APLICA";
    if (["P", "E", "N"].includes(tipoCFDI)) return "NO";
    if (xmlContent.includes("CartaPorte") && xmlContent.includes("Ubicacion")) return "SI";
    if (tipoCFDI === "T") {
        if (xmlContent.includes("Autotransporte") && /ClaveProdServ="78\d{5}|80\d{5}|81\d{5}"/i.test(xmlContent)) return "SI";
        return "NO";
    }
    if (tipoCFDI === "I") {
        const tieneCve = /ClaveProdServ="78101[78]\d{2}|78102\d{3}|80101[78]\d{2}|81101[78]\d{2}"/i.test(xmlContent);
        const tieneDesc = /Descripcion="[^"]*\b(?:servicio\s+de\s+transporte|flete|acarreo|autotransporte)\b[^"]*"/i.test(xmlContent);
        const tieneRuta = /\b(?:origen|destino|kilometros?|ruta|via\s+federal|carretera)\b/i.test(xmlContent);
        if (tieneCve && tieneDesc && tieneRuta) return "SI";
        return "NO";
    }
    return "NO";
};

export const extractCartaPorteInfo = (xmlContent: string, version: string) => {
    const tiene = /<(?:[a-zA-Z0-9_]+:)?CartaPorte[\s\/>]/i.test(xmlContent);
    if (version === "3.3" && !tiene) return { presente: "NO APLICA", completa: "NO APLICA", version: "NO APLICA" };
    if (!tiene) return { presente: "NO", completa: "NO APLICA", version: "NO APLICA" };
    let cpVersion = "3.1";
    if (xmlContent.includes("CartaPorte31")) {
        cpVersion = "3.1";
    } else if (xmlContent.includes("CartaPorte30")) {
        cpVersion = "3.0";
    } else if (xmlContent.includes("CartaPorte20")) {
        cpVersion = "2.0";
    } else {
        const vMatch = xmlContent.match(/CartaPorte[^>]*Version="([^"]+)"/);
        cpVersion = vMatch ? vMatch[1] : "NO VIENE EN XML";
    }
    if (cpVersion === "4.0" || cpVersion === "2.0" || cpVersion === "NO DISPONIBLE") {
        cpVersion = "3.1";
    }
    const uComp = xmlContent.includes("Ubicaciones") && /TipoUbicacion="Origen"/i.test(xmlContent) && /TipoUbicacion="Destino"/i.test(xmlContent);
    const mComp = xmlContent.includes("Mercancias") && xmlContent.includes("PesoBrutoTotal") && xmlContent.includes("UnidadPeso") && xmlContent.includes("NumTotalMercancias");
    const aComp = xmlContent.includes("Autotransporte") && xmlContent.includes("PermSCT") && xmlContent.includes("NumPermisoSCT") && xmlContent.includes("IdentificacionVehicular") && xmlContent.includes("ConfigVehicular") && xmlContent.includes("Placa") && (xmlContent.includes("AnioModeloVM") || xmlContent.includes("Anio")) && xmlContent.includes("AseguraRespCivil") && xmlContent.includes("PolizaRespCivil");
    const fComp = xmlContent.includes("FiguraTransporte") && (/RFCFigura="[A-Z0-9]{12,13}"/i.test(xmlContent) || /RFC="[A-Z0-9]{12,13}"/i.test(xmlContent)) && xmlContent.includes("NumLicencia");
    return { presente: "SI", completa: uComp && mComp && aComp && fComp ? "SI" : "NO", version: cpVersion };
};

export const extractPagosInfo = (xmlContent: string, tipoCFDI: string, version: string, añoFiscal: number, requiere: boolean, vEsperada: string) => {
    if (tipoCFDI !== "P") return { presente: "NO APLICA", versionPagos: "NO APLICA", valido: "NO APLICA", errorMsg: "" };
    if (!requiere) return { presente: "NO APLICA", versionPagos: "NO APLICA", valido: "NO APLICA", errorMsg: `Complemento Pagos no existía en ${añoFiscal}` };
    // ✅ AUDIT FIX: Regex tolerante a prefijos alternativos (pago10, pago20, p10, p20, Pagos sin prefijo)
    // PACs como Tralix, Edicom, ContPAQi usan prefijos distintos al estándar
    const tieneP20 = /(?:pago20|p20):Pagos[\s>]/i.test(xmlContent) || 
                     (xmlContent.includes("Pagos") && /Version="2\.0"/i.test(xmlContent));
    const tieneP10 = !tieneP20 && (
        /(?:pago10|p10):Pagos[\s>]/i.test(xmlContent) || 
        (xmlContent.includes("Pagos") && /Version="1\.0"/i.test(xmlContent))
    );
    if (!tieneP10 && !tieneP20) return { presente: "NO", versionPagos: "NO DISPONIBLE", valido: "NO", errorMsg: `Falta complemento de Pagos (${vEsperada})` };
    const vDet = tieneP20 ? "2.0" : "1.0";
    if (vDet !== vEsperada) return { presente: "SI", versionPagos: vDet, valido: "NO", errorMsg: `Requiere Pagos ${vEsperada}, detectado ${vDet}` };
    return { presente: "SI", versionPagos: vDet, valido: "SI", errorMsg: "" };
};

export const detectarEncoding = (xmlContent: string) => {
    const match = xmlContent.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i);
    if (!match) return { encoding: "UTF-8", soportado: true, errorMsg: "" };
    const enc = match[1].toUpperCase();
    const supported = ["UTF-8", "ISO-8859-1", "WINDOWS-1252"].includes(enc.replace("UTF8", "UTF-8").replace("LATIN1", "ISO-8859-1"));
    return { encoding: enc, soportado: supported, errorMsg: supported ? "" : `Encoding ${enc} no soportado` };
};

export const calcularScoreInformativo = (resultado: string, isValid: boolean, dif: number, cpComp: string, reqCP: string) => {
    if (resultado.includes("🔴")) return dif > 10 ? 10 : (dif > 1 ? 25 : 40);
    if (resultado.includes("🟡")) return reqCP === "SI" && cpComp === "NO" ? 70 : 80;
    return isValid && dif === 0 ? 100 : 95;
};

// ✅ AUDIT FIX: Regex tolerante a prefijos alternativos de Nómina (nomina11, nomina12, nom11, nom12, sin prefijo)
export const detectarNomina = (xmlContent: string, tipoCFDI: string) => 
    tipoCFDI === "N" && /(?:nomina11|nomina12|nom11|nom12)?:?Nomina[\s>"]/i.test(xmlContent);

export const extractNominaInfo = (xmlDoc: XMLDocument, xmlContent: string) => {
    const nodes = Array.from(xmlDoc.documentElement?.getElementsByTagName("*") || []);
    const node = nodes.find(n => (n.localName || n.nodeName).includes("Nomina"));
    if (!node) return { 
        versionNomina: "NO DISPONIBLE", totalPercepciones: 0, totalDeducciones: 0, totalOtrosPagos: 0, 
        isrRetenido: 0, subsidioCausado: 0, percepcionesGravadas: 0, percepcionesExentas: 0, diasPagados: 15,
        esValida: false, errorMsg: "No hay nodo Nómina" 
    };
    
    const version = node.getAttribute("Version") || "1.2";
    const diasPagados = parseFloat(node.getAttribute("NumDiasPagados") || "15") || 15;

    let percepcionesGravadas = 0, percepcionesExentas = 0, isrRetenido = 0, subsidioCausado = 0, totalD = 0, totalO = 0;

    const percepcionesNode = nodes.find(n => (n.localName || n.nodeName) === "Percepciones");
    if (percepcionesNode) {
        percepcionesGravadas = parseFloat(percepcionesNode.getAttribute("TotalGravado") || "0");
        percepcionesExentas = parseFloat(percepcionesNode.getAttribute("TotalExento") || "0");
    }
    const totalP = percepcionesGravadas + percepcionesExentas;

    const deduccionesNode = nodes.find(n => (n.localName || n.nodeName) === "Deducciones");
    if (deduccionesNode) {
        const otrasDeducciones = parseFloat(deduccionesNode.getAttribute("TotalOtrasDeducciones") || "0");
        const impuestosRetenidos = parseFloat(deduccionesNode.getAttribute("TotalImpuestosRetenidos") || "0");
        totalD = otrasDeducciones + impuestosRetenidos;
        
        Array.from(deduccionesNode.children).forEach((child: any) => {
            if ((child.localName || child.nodeName) === "Deduccion" && child.getAttribute("TipoDeduccion") === "002") {
                isrRetenido += parseFloat(child.getAttribute("Importe") || "0");
            }
        });
    }

    const otrosPagosNode = nodes.find(n => (n.localName || n.nodeName) === "OtrosPagos");
    if (otrosPagosNode) {
        totalO = parseFloat(otrosPagosNode.getAttribute("TotalOtrosPagos") || "0");
        const subsidioNode = nodes.find(n => (n.localName || n.nodeName) === "SubsidioAlEmpleo");
        if (subsidioNode) {
            subsidioCausado = parseFloat(subsidioNode.getAttribute("SubsidioCausado") || "0");
        }
    }

    return { 
        versionNomina: version, 
        totalPercepciones: Math.round(totalP * 100) / 100, 
        totalDeducciones: Math.round(totalD * 100) / 100, 
        totalOtrosPagos: totalO, 
        isrRetenido,
        subsidioCausado,
        percepcionesGravadas,
        percepcionesExentas,
        diasPagados,
        esValida: true, 
        errorMsg: "" 
    };
};

// Heurística simplificada de estimación de ISR (no cálculo exacto, solo proxy de validación ligera)
export const estimarISRHeuristicoMensual = (baseGravable: number, diasPagados: number): number => {
    if (baseGravable <= 0 || diasPagados <= 0) return 0;
    
    // Ingreso mensualizado base
    const ingresoMensual = (baseGravable / diasPagados) * 30.4;
    
    // Tramos heurísticos muy simplificados
    let porcentaje = 0;
    if (ingresoMensual > 40000) porcentaje = 0.25;
    else if (ingresoMensual > 20000) porcentaje = 0.18;
    else if (ingresoMensual > 10000) porcentaje = 0.12;
    else if (ingresoMensual > 7000) porcentaje = 0.08;
    else if (ingresoMensual > 0) porcentaje = 0.02;

    const isrMensual = ingresoMensual * porcentaje;
    return (isrMensual / 30.4) * diasPagados;
};

export const validateNominaTotals = (p: number, d: number, o: number, total: number) => {
    const totalCalculado = p + o - d;
    const diferencia = Math.abs(totalCalculado - total);

    // ✅ REGLA: Retornar false en isValid si hay diferencia para que classifyCFDI maneje la lógica detallada
    return { 
        isValid: diferencia <= 0.01, 
        calculado: Math.round(totalCalculado * 100) / 100, 
        diferencia: Math.round(diferencia * 100) / 100 
    };
};

export const classifyCFDI = (
    xmlContent: string,
    version: string,
    tipoCFDI: string,
    taxes: any,
    validation: any,
    esNomina: boolean,
    nominaInfo: any,
    pagosInfo: any,
    cartaPorteInfo: any,
    requiereCartaPorte: string,
    contextoHistorico: string,
    giroEmpresa?: string // ✅ Nuevo: Giro para evaluación de materialidad
): { resultado: string, comentarioFiscal: string, nivelValidacion: string } => {

    let resultado = "🟢 USABLE";
    let comentarioFiscal = "";
    let nivelValidacion = esNomina ? "ESTRUCTURAL, NÓMINA" : "ESTRUCTURAL, SAT, NEGOCIO, RIESGO";

    // 1. EXTRACCIÓN DE DATOS PARA CLASIFICACIÓN (Fallback si no vienen en pads)
    const emisorMatch = xmlContent.match(/Emisor[^>]*Nombre="([^"]+)"/i);
    const nombreEmisor = emisorMatch ? emisorMatch[1].toUpperCase() : "";

    // 2. DETECTORES PARA REGLAS DE NEGOCIO
    const tieneECC = xmlContent.includes("ecc12:EstadoDeCuentaCombustible");
    const totalXMLMatch = xmlContent.match(/Total="([^"]+)"/i);
    const totalXML = totalXMLMatch ? parseFloat(totalXMLMatch[1]) : 0;

    // Identificadores de Rubros Exentos "Buenos" (Educación, Salud)
    const esRubroExentoBueno = (
        /UNIVERSIDAD|COLEGIO|COLEGIATURA|INSTITUTO|ESCUELA|EDUCACI[OÓ]N/i.test(nombreEmisor) ||
        taxes.desglosePorConcepto?.some((c: ConceptoDesglose) =>
            (c.descripcion && /Colegiatura|Servicio Educativo|Ense[ñn]anza/i.test(c.descripcion)) ||
            (c.claveProdServ && c.claveProdServ.startsWith("86")) // Servicios educativos
        ) ||
        /HOSPITAL|CLINICA|M[EÉ]DICO/i.test(nombreEmisor) ||
        taxes.desglosePorConcepto?.some((c: ConceptoDesglose) =>
            c.claveProdServ && c.claveProdServ.startsWith("85") // Servicios de salud
        )
    );

    // Identificadores de Consumo General (Riesgo en ObjetoImp=02)
    const esConsumoGeneral = (
        /WALMART|SORIANA|CHEDRAUI|COSTCO|OXXO|7-ELEVEN|TIENDA|MISCELANEA|RESTAURANTE|BAR|CAFE|DEPARTAMENTAL|S\.A\. DE C\.V\.|COMERCIAL/i.test(nombreEmisor) ||
        taxes.desglosePorConcepto?.some((c: ConceptoDesglose) =>
            c.claveProdServ && (
                c.claveProdServ.startsWith("50") || // Alimentos/Bebidas
                c.claveProdServ.startsWith("52") || // Cuidado doméstico
                c.claveProdServ.startsWith("53")    // Ropa/Accesorios
            )
        )
    );

    // Búsqueda de Riesgo IVA: ObjetoImp=02 con IVA 0%
    const tieneObjetoImp02IVA0 = taxes.desglosePorConcepto?.some((c: ConceptoDesglose) => {
        const esObjeto02 = c.objetoImp === "02";
        const tieneIVA0 = c.traslados?.some(t =>
            t.impuesto === "002" &&
            (t.tasa === "0" || t.tasa === "0.000000" || parseFloat(t.tasa) === 0)
        );
        return esObjeto02 && tieneIVA0;
    }) || false;

    // Búsqueda de conceptos bonificados (ObjetoImp=01 con descuento total)
    const tieneBonificadosTotalmente = taxes.desglosePorConcepto?.some((c: ConceptoDesglose) => {
        const esObjeto01 = c.objetoImp === "01";
        const esBonificadoTotal = Math.abs(c.descuento - c.importe) < 0.01 && c.importe > 0;
        return esObjeto01 && esBonificadoTotal;
    }) || false;

    // 3. LÓGICA DE PRIORIDADES (Orden: Errores Críticos > Totales > Riesgos > Informativos)

    // A. Errores Estructurales de Nómina o Pagos
    if (esNomina && nominaInfo && !nominaInfo.esValida) {
        return {
            resultado: "🔴 NO USABLE",
            comentarioFiscal: `ERROR EN NÓMINA: ${nominaInfo.errorMsg}`,
            nivelValidacion
        };
    }

    if (pagosInfo && pagosInfo.valido === "NO") {
        return {
            resultado: "🔴 NO USABLE",
            comentarioFiscal: `ERROR EN PAGOS: ${pagosInfo.errorMsg}`,
            nivelValidacion
        };
    }

    // B. Validación de Totales vs ECC12 (Combustibles)
    if (!validation.isValid && !tieneECC && !esNomina) {
        resultado = "🔴 NO USABLE";
        comentarioFiscal = `ERROR FISCAL: Total declarado no coincide con cálculo SAT. Diferencia de $${validation.diferencia.toFixed(2)}.`;
    } else if (tieneECC) {
        if (totalXML === 0 && validation.isValid) {
            // Total cero con ECC y validación correcta: no alertar — el complemento justifica el total cero
            resultado = "🟢 USABLE";
            comentarioFiscal = "CFDI con complemento de Estado de Cuenta de Combustibles y total cero. La información relevante de litros, importes e impuestos viene en el complemento. Si el SAT confirma VIGENTE, el total cero está justificado por el complemento.";
            nivelValidacion = "ECC12 - TOTAL CERO";
        } else if (!validation.isValid) {
            // Total no cero pero no cuadra — alerta
            resultado = "🟡 ALERTA";
            comentarioFiscal = `CFDI con complemento de Estado de Cuenta de Combustible. Diferencia de totales: $${validation.diferencia.toFixed(2)}. Revisar deducibilidad y acreditamiento de IVA conforme a política interna.`;
        } else {
            // Total no cero y cuadra — usable con info
            resultado = "🟢 USABLE";
            comentarioFiscal = "CFDI con complemento de Estado de Cuenta de Combustible. La información relevante de litros, importes e impuestos viene en el complemento. Revisar deducibilidad y acreditamiento de IVA conforme a política interna.";
        }
    }

    // AUDITORÍA FOCALIZADA EN NÓMINA HEURÍSTICA Y LIGERA
    if (esNomina && resultado !== "🔴 NO USABLE") {
        let isrEstimado = estimarISRHeuristicoMensual(nominaInfo.percepcionesGravadas, nominaInfo.diasPagados);
        let difISR = Math.abs(isrEstimado - nominaInfo.isrRetenido);
        
        let alertasFiscales: string[] = [];

        // 1. Diferencias estructurales matemáticas graves son los ÚNICOS motivos de error no-estructural en nómina
        const difTotales = validation.diferencia;
        if (difTotales > 1000) {
            resultado = "🔴 NO USABLE";
            nivelValidacion = "NÓMINA - ERROR GRAVE";
            comentarioFiscal = `ERROR FISCAL: Diferencia matemática anormal en nómina ($${difTotales.toFixed(2)}). Se detectan inconsistencias graves en estructura.`;
            return { resultado, comentarioFiscal, nivelValidacion };
        } 

        // 2. Validación Heurística de ISR
        if (difISR > 20 && nominaInfo.percepcionesGravadas > 0) { 
           alertasFiscales.push("Se detectan inconsistencias en ISR retenido que requieren revisión detallada contra estimación fiscal.");
        }

        // 3. Validación Heurística de Subsidio
        const ingresoMensualEstimado = (nominaInfo.percepcionesGravadas / nominaInfo.diasPagados) * 30.4;
        if (nominaInfo.subsidioCausado > 0 && ingresoMensualEstimado > 10000) {
            alertasFiscales.push("El subsidio aplicado podría no corresponder al nivel de ingreso mensual estimado (rango atípico).");
        }

        // 4. Validación Heurística Gravado vs Exento
        if (nominaInfo.percepcionesGravadas === 0 && (nominaInfo.percepcionesGravadas + nominaInfo.percepcionesExentas) > 0) {
            alertasFiscales.push("Percepciones clasificadas completamente como exentas. La clasificación fiscal de estas percepciones puede representar un riesgo de auditoría.");
        }

        if (alertasFiscales.length > 0) {
            resultado = "🟡 ALERTA";
            nivelValidacion = "NÓMINA - REVISIÓN";
            comentarioFiscal = "HALLAZGOS DE REVISIÓN EN NÓMINA:\n- " + alertasFiscales.join("\n- ");
        } else {
            resultado = "🟢 USABLE";
            nivelValidacion = "NÓMINA - VÁLIDA";
            comentarioFiscal = "Nómina congruente con estatus válido. Ausencia de indicadores de riesgo heurístico en cálculos de impuestos e ingresos.";
        }
    } else if (!esNomina && !tieneECC && validation.isValid) {
        // Caso Base Sano - Facturas/REP
        resultado = "🟢 USABLE";
        comentarioFiscal = "CFDI válido. Total correcto calculado por concepto considerando impuestos y retenciones. Sin inconsistencias relevantes detectadas.";
    }

    // ALERTA MAT-06: Egreso sin relacionados
    if (tipoCFDI === "E" && !xmlContent.includes("CfdiRelacionados") && resultado !== "🔴 NO USABLE") {
        resultado = "🟡 ALERTA";
        comentarioFiscal += (comentarioFiscal ? " " : "") + "[MAT-06] CFDI de Egreso sin CfdiRelacionados. Revisar soporte documental y confirmar si corresponde a nota de crédito, devolución, bonificación o egreso autónomo válido.";
    }

    // C. Clasificación de IVA (Exento vs Riesgo) — no aplica a nómina
    if (!esNomina && resultado !== "🔴 NO USABLE" && tieneObjetoImp02IVA0) {
        if (esRubroExentoBueno) {
            // Caso Exento "Bueno" (Educación/Salud)
            resultado = "🟢 USABLE";
            comentarioFiscal = "Servicio potencialmente exento (educación/salud). CFDI estructuralmente válido; sin observaciones fiscales relevantes sobre IVA.";
        } else if (esConsumoGeneral) {
            // Caso Riesgo (Supermercados/Retail)
            resultado = "🔴 NO USABLE (Riesgo IVA)";
            const notaRiesgo = "[CRÍTICO] ObjetoImp=02 con IVA 0 % en productos típicamente gravados. Riesgo de no poder acreditar IVA o de que la deducción sea rechazada en revisión.";
            comentarioFiscal = notaRiesgo + " " + (comentarioFiscal.includes("válido") ? "" : comentarioFiscal);
        }
    }

    // D. Comentario informativo sobre clasificación fiscal por ObjetoImp — no aplica a nómina
    const baseNoObjetoVal = taxes.baseNoObjeto ?? 0;
    const baseSinDesglose = taxes.baseObjetoSinDesglose ?? 0;
    const clasificacion = taxes.clasificacionFiscal ?? "";

    if (!esNomina && resultado !== "🔴 NO USABLE") {
        if (clasificacion === "NO_OBJETO" || baseNoObjetoVal > 0) {
            // ✅ REGLA SAT: ObjetoImp=01 → NO OBJETO DE IMPUESTO. No confundir con Exento.
            comentarioFiscal += (comentarioFiscal ? " " : "")
                + `[CFDI NO OBJETO] Todos los conceptos tienen ObjetoImp=01 (No objeto de impuesto), Base NO_OBJETO=$${baseNoObjetoVal.toFixed(2)}. IVA=$0. No es exento; simplemente no está sujeto al impuesto.`;
        }
        if (baseSinDesglose > 0) {
            comentarioFiscal += (comentarioFiscal ? " " : "")
                + `[ObjetoImp=03] Incluye conceptos objeto de impuesto pero sin desglose obligatorio, Base=$${baseSinDesglose.toFixed(2)}.`;
        }
        if (tieneBonificadosTotalmente) {
            const notaBonificado = "Incluye conceptos bonificados (ObjetoImp=01 con descuento total); revisar solo para efectos de control interno.";
            comentarioFiscal += (comentarioFiscal ? " " : "") + notaBonificado;
        }
    }

    // E. Ajustes por Carta Porte
    if (resultado === "🟢 USABLE" || resultado === "🟡 ALERTA") {
        if (requiereCartaPorte === "SI" && cartaPorteInfo.presente === "NO") {
            resultado = "🟡 ALERTA";
            comentarioFiscal += " ALERTA: Requiere complemento Carta Porte pero no se detectó.";
        } else if (cartaPorteInfo.presente === "SI" && cartaPorteInfo.completa === "NO") {
            resultado = "🟡 ALERTA";
            comentarioFiscal += " ALERTA: Carta Porte incompleta.";
        }
    }

    // F. EVALUACIÓN DE MATERIALIDAD (Razón de Negocio)
    if (giroEmpresa && taxes.desglosePorConcepto) {
        const materialidad = evaluarMaterialidadGasto(giroEmpresa, taxes.desglosePorConcepto, nombreEmisor || "");
        if (materialidad.tieneRiesgo) {
            comentarioFiscal += (comentarioFiscal ? " " : "") + materialidad.mensaje;
        }
    }

    // Ajustar nivelValidacion final para nómina según resultado
    if (esNomina) {
        if (resultado.includes("🟢")) nivelValidacion = "NÓMINA - VÁLIDA";
        else if (resultado.includes("🟡")) nivelValidacion = "NÓMINA - REVISIÓN";
        // 🔴 ya se asignó arriba en el early return estructural
    }

    return { resultado, comentarioFiscal, nivelValidacion };
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTEO CENTRAL DE ESTATUS SAT — función única, pura, reutilizada por la
// hoja "Resumen", la hoja "RESUMEN EJECUTIVO" y el Dashboard.
// ═══════════════════════════════════════════════════════════════════════════
// Corrección: "RESUMEN EJECUTIVO" contaba "SAT no confirmado" comparando
// contra el string genérico de respaldo 'ESTATUS SAT NO CONFIRMADO', que
// getSatExportFields() SOLO produce cuando el estatus viene vacío — algo que
// en la práctica nunca ocurre (estatusSAT siempre trae un valor concreto:
// Vigente/Cancelado/No Encontrado/Error Conexión/No verificado). Por eso ese
// contador siempre daba 0, aunque la hoja "Resumen" y "Diagnostico_CFDI" sí
// mostraran los mismos registros como "No validado SAT" correctamente.
//
// "SAT no confirmado" agrupa: No Encontrado, Error Conexión (incluye
// timeouts — el tipo EstatusSAT no distingue un timeout de otro fallo de
// conexión, ambos colapsan a "Error Conexión"), No verificado (pendiente), y
// como red de seguridad, cualquier fila cuyo "resultado" ya haya sido
// clasificado como "No validado SAT" por combinarResultadoFinal — cubre el
// caso en que 69-B tomó precedencia sobre "resultado" (p.ej. 🔴 NO USABLE
// por 69-B Definitivo) pero el SAT en sí sigue sin confirmarse: esa fila debe
// seguir contando aquí aunque su "resultado" ya no diga "No validado SAT".
//
// Los REP (Tipo P) NUNCA se consultan al SAT por diseño (Total=0.00) — no es
// un fallo de SAT, es una exclusión legítima. Se cuentan aparte
// (repExcluidos) y NUNCA se incluyen en noConfirmados, vigentes ni cancelados.
export interface ConteoEstatusSAT {
    total: number;
    vigentes: number;
    cancelados: number;
    noConfirmados: number;
    repExcluidos: number;
}

export function contarEstatusSAT(results: { tipoCFDI?: string; estatusSAT?: string; resultado?: string }[]): ConteoEstatusSAT {
    const esREP = (r: { tipoCFDI?: string }) => String(r.tipoCFDI || "").toUpperCase() === "P";
    const repExcluidos = results.filter(esREP).length;
    const evaluables = results.filter(r => !esREP(r));

    const vigentes = evaluables.filter(r => r.estatusSAT === "Vigente").length;
    const cancelados = evaluables.filter(r => r.estatusSAT === "Cancelado").length;
    const noConfirmados = evaluables.filter(r =>
        r.estatusSAT === "No Encontrado" ||
        r.estatusSAT === "Error Conexión" ||
        r.estatusSAT === "No verificado" ||
        r.resultado === "No validado SAT"
    ).length;

    return { total: results.length, vigentes, cancelados, noConfirmados, repExcluidos };
}

// ═══════════════════════════════════════════════════════════════════════════
// RELACIÓN FACTURA PPD ↔ COMPLEMENTO DE PAGO (REP) — extracción + reconciliación
// ═══════════════════════════════════════════════════════════════════════════

export interface PagoRelacionadoDetalle {
    uuidFacturaRelacionada: string;
    numParcialidad: number | null;
    impSaldoAnt: number | null;
    impPagado: number | null;
    impSaldoInsoluto: number | null;
    fechaPago: string;
    monedaP: string;
    tipoCambioP: number | null;
    monedaDR: string;
    equivalenciaDR: number | null;
}

const parsePagoNumAttr = (el: Element | null, name: string): number | null => {
    if (!el) return null;
    const v = el.getAttribute(name);
    if (v === null || v.trim() === "") return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
};

// Extrae, por cada nodo DoctoRelacionado del complemento Pagos, los datos que
// permiten reconciliar el pago contra la factura de origen (parcialidad,
// saldo anterior/insoluto, fecha, moneda). Tolerante a prefijos de namespace
// (pago10/pago20/sin prefijo), igual que el resto del motor. Solo tiene
// sentido llamarla sobre el XML de un CFDI Tipo P (REP).
export const extractPagoDetalles = (xmlDoc: XMLDocument | null): PagoRelacionadoDetalle[] => {
    if (!xmlDoc) return [];
    const todos = Array.from(xmlDoc.getElementsByTagName("*"));
    const doctos = todos.filter(n => (n.localName || n.nodeName) === "DoctoRelacionado");
    return doctos.map(dr => {
        let pago: Element | null = dr.parentElement;
        while (pago && (pago.localName || pago.nodeName) !== "Pago") {
            pago = pago.parentElement;
        }
        return {
            uuidFacturaRelacionada: String(dr.getAttribute("IdDocumento") || "").trim().toUpperCase(),
            numParcialidad: parsePagoNumAttr(dr, "NumParcialidad"),
            impSaldoAnt: parsePagoNumAttr(dr, "ImpSaldoAnt"),
            impPagado: parsePagoNumAttr(dr, "ImpPagado"),
            impSaldoInsoluto: parsePagoNumAttr(dr, "ImpSaldoInsoluto"),
            fechaPago: pago?.getAttribute("FechaPago") || "NO VIENE EN XML",
            monedaP: pago?.getAttribute("MonedaP") || "NO VIENE EN XML",
            tipoCambioP: parsePagoNumAttr(pago, "TipoCambioP"),
            monedaDR: dr.getAttribute("MonedaDR") || "NO VIENE EN XML",
            equivalenciaDR: parsePagoNumAttr(dr, "EquivalenciaDR"),
        };
    });
};

const UUID_FORMATO_VALIDO = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
const TOLERANCIA_SALDO = 0.01; // centavos: redondeo aceptable para considerar liquidada una factura
export const DIAS_MAX_COMPLEMENTO = 90; // ventana informativa: complemento emitido mucho después del CFDI de origen

// Parseo de fecha tolerante (ISO con hora, solo fecha, o fallback genérico) —
// única fuente de verdad para fechas de CFDI en el motor. fiscalRules.ts
// reutiliza esta misma función en vez de mantener su propia copia.
export function parseFechaCFDI(dateStr?: string | null): Date | null {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    if (!s || s === 'NO VIENE EN XML' || s === 'NO DISPONIBLE') return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(s + 'T00:00:00');
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

// ═══════════════════════════════════════════════════════════════════════════
// REGLA HISTÓRICA: ¿este documento requiere evidencia REP?
// ═══════════════════════════════════════════════════════════════════════════
// Fuentes:
// - SAT, "Comprobante de Recepción de Pagos" (portal oficial, ficha 92764):
//   describe el Complemento para Recepción de Pagos (REP) y su obligatoriedad
//   para CFDI con MetodoPago=PPD.
//   https://wwwmat.sat.gob.mx/consultas/92764/comprobante-de-recepcion-de-pagos
// - Criterio temporal (fecha de corte 01/09/2018), comunicado oficial SAT:
//   https://www.gob.mx/sat/prensa/com2018_045
// - Criterio aplicado: la obligación nace cuando se RECIBE el pago diferido o
//   en parcialidades (la fecha del nodo <Pago FechaPago=.../> del REP), NO en
//   la fecha de emisión del CFDI de origen. Un CFDI PPD emitido antes del
//   01/09/2018 cuyo pago se recibe después de esa fecha SÍ requiere REP para
//   ese pago — y, a la inversa, sin un REP no hay forma de conocer cuándo se
//   recibió el pago, así que la fecha de la factura NUNCA decide esto por sí
//   sola.
// Esta es la ÚNICA fuente de verdad para esa decisión: motor
// (reconciliarPagosPPD), alertas forenses (buildAlerts/PAGO-01), Dashboard,
// resúmenes y Excel la consultan; ninguno reimplementa la fecha de corte.
const FECHA_OBLIGATORIEDAD_REP = new Date('2018-09-01T00:00:00');

export type EstadoObligacionREP =
    | 'NO_APLICA'               // Tipo P, PUE, o método fuera de esta regla
    | 'NO_EXIGIBLE_HISTORICO'   // REP existe con FechaPago válida y anterior al corte — comprobado, no exigible en ese momento
    | 'REQUIERE_EVIDENCIA'      // REP existe con FechaPago válida y posterior (o igual) al corte — la obligación aplicó a ese pago
    | 'SIN_EVIDENCIA_PAGO'      // No hay REP: no se conoce la fecha de pago, nunca se infiere de la fecha de la factura
    | 'FECHA_PAGO_INSUFICIENTE'; // REP existe pero su FechaPago no es parseable

export interface ObligacionREPInput {
    tipoCFDI: string | undefined | null;
    metodoPago: string | undefined | null;
    /** Solo diagnóstico/trazabilidad — NUNCA decide la obligación por sí sola. */
    fechaFactura?: string | undefined | null;
    /** Fecha real del pago (nodo <Pago FechaPago=.../> del REP relacionado). */
    fechaPago: string | undefined | null;
    /** true si se localizó al menos un REP con evidencia de pago para este documento. */
    existeREP: boolean;
}

export interface ObligacionREPInfo {
    estado: EstadoObligacionREP;
    requiereEvidencia: boolean; // true SOLO cuando estado === 'REQUIERE_EVIDENCIA'
    mensaje: string;
}

export function evaluarObligacionREP(input: ObligacionREPInput): ObligacionREPInfo {
    const tipo = String(input.tipoCFDI || '').toUpperCase();
    const metodo = String(input.metodoPago || '').toUpperCase();

    if (tipo === 'P') {
        return { estado: 'NO_APLICA', requiereEvidencia: false, mensaje: 'CFDI Tipo P (REP): no requiere otro REP; es el propio comprobante de pago.' };
    }
    if (metodo === 'PUE') {
        return { estado: 'NO_APLICA', requiereEvidencia: false, mensaje: 'PUE: no requiere REP.' };
    }
    if (metodo !== 'PPD') {
        return { estado: 'NO_APLICA', requiereEvidencia: false, mensaje: 'Método de pago no sujeto a esta regla (no es PPD).' };
    }

    if (!input.existeREP) {
        // Sin REP no hay fecha de pago conocida: el pago pudo ocurrir en
        // cualquier momento, incluso después del 01/09/2018. NUNCA se
        // determina la obligación con la fecha de la factura, y nunca se
        // afirma "no exigible" ni "incumplimiento" sin esa evidencia.
        return { estado: 'SIN_EVIDENCIA_PAGO', requiereEvidencia: false, mensaje: 'Sin evidencia de pago en los XML cargados. Carga el complemento de pago para determinar si fue pagada total o parcialmente.' };
    }

    const fechaPago = parseFechaCFDI(input.fechaPago);
    if (!fechaPago) {
        return { estado: 'FECHA_PAGO_INSUFICIENTE', requiereEvidencia: false, mensaje: 'Requiere revisión: fecha de pago insuficiente.' };
    }

    if (fechaPago < FECHA_OBLIGATORIEDAD_REP) {
        return { estado: 'NO_EXIGIBLE_HISTORICO', requiereEvidencia: false, mensaje: 'REP no obligatorio por fecha histórica del pago (anterior al 01/09/2018).' };
    }

    return { estado: 'REQUIERE_EVIDENCIA', requiereEvidencia: true, mensaje: 'PPD con pago recibido desde el 01/09/2018: requiere REP.' };
}

// NOTA: NO_EXIGIBLE_HISTORICO NO es un estado de pago independiente — un
// documento con REP comprobado antes del 01/09/2018 sigue siendo LIQUIDADA/
// PARCIAL según el dinero reconciliado; la exención histórica es solo
// informativa y se expone vía el flag `pagoHistoricamenteExento` (ver
// ReconciliacionFactura), nunca sustituyendo el estado de pago real.
export type EstadoPagoFactura = 'PUE' | 'SIN_EVIDENCIA_REP' | 'PARCIAL' | 'LIQUIDADA' | 'REQUIERE_REVISION_MONEDA' | 'REQUIERE_REVISION_FECHA';

export interface ReconciliacionFactura {
    uuid: string;
    tipoCFDI: string;
    direccionCFDI?: string;
    metodoPago: string;
    estado: EstadoPagoFactura;
    totalFactura: number;
    totalPagado: number;
    saldoAnterior: number | null;
    saldoInsoluto: number | null;
    ultimaParcialidad: number | null;
    ultimaFechaPago: string | null;
    repRelacionados: string[];
    observacion: string;
    fueraDePeriodo?: boolean;
    /** true si el pago documentado (REP con FechaPago válida) es anterior al
     *  01/09/2018 — informativo: el REP no era obligatorio en ese momento,
     *  pero eso NO cambia el estado de pago (LIQUIDADA/PARCIAL sigue siendo
     *  el real, según el dinero reconciliado). Ver evaluarObligacionREP. */
    pagoHistoricamenteExento?: boolean;
}

export type EstadoREP = 'RELACIONADO' | 'SIN_FACTURA_RELACIONADA' | 'RECHAZADO_ERROR' | 'DUPLICADO';

export interface ReconciliacionREP {
    uuid: string;
    estado: EstadoREP;
    facturasRelacionadas: string[];
    observacion: string;
}

export interface ReconciliacionPagos {
    facturas: ReconciliacionFactura[];
    reps: ReconciliacionREP[];
}

// Reconcilia facturas PPD contra sus complementos de pago (REP) DENTRO del
// arreglo `results` recibido — ver limitación de persistencia entre cargas
// documentada junto a esta función en la auditoría (no reconcilia contra
// REP/facturas de sesiones o lotes que no estén en este mismo `results`).
//
// Reglas aplicadas (auditoría PPD↔REP):
// - PUE: no requiere REP — se marca pagada conforme a su método de pago.
// - PPD sin REP encontrado en `results`: "Sin evidencia de pago en los XML
//   cargados" (NUNCA "impagada" — no se afirma lo que no se puede probar).
// - PPD con REP que no liquida el total: "PARCIAL" + saldo insoluto (se
//   toma el ImpSaldoInsoluto de la parcialidad más alta si está disponible;
//   si no, se calcula total - suma de ImpPagado).
// - PPD con uno o varios REP que suman el total (o cuyo ImpSaldoInsoluto más
//   reciente es ~0): "LIQUIDADA".
// - Un REP duplicado (mismo UUID de REP repetido en `results`, p.ej. el mismo
//   archivo cargado dos veces) se cuenta UNA sola vez — nunca duplica el
//   importe pagado.
// - Un DoctoRelacionado con UUID mal formado se marca como error (no se usa
//   fecha/importe/RFC como sustituto del UUID).
// - Un REP cuyo UUID relacionado no está entre las facturas de `results` se
//   marca "REP sin factura relacionada en este análisis" — nunca se afirma
//   que la factura no existe en ningún lado.
// - Las Notas de Crédito (Tipo E) nunca contribuyen como pago: solo los
//   documentos Tipo P (REP) se acumulan en el saldo pagado.
// - Funciona igual para EMITIDO y RECIBIDO: el emparejamiento es por UUID,
//   no por RFC ni por dirección.
export function reconciliarPagosPPD(results: ValidationResult[]): ReconciliacionPagos {
    const esREP = (r: ValidationResult) => String(r.tipoCFDI || '').toUpperCase() === 'P';

    // Dedup de REP por UUID — un REP repetido nunca debe sumarse dos veces,
    // pero SÍ se reporta como "DUPLICADO" (REP cargados = relacionados +
    // huérfanos + rechazados + duplicados).
    const repVistos = new Set<string>();
    const repsUnicos: ValidationResult[] = [];
    const repsDuplicados: ReconciliacionREP[] = [];
    for (const r of results) {
        if (!esREP(r)) continue;
        const key = String(r.uuid || '').toUpperCase();
        if (key && repVistos.has(key)) {
            repsDuplicados.push({ uuid: r.uuid, estado: 'DUPLICADO', facturasRelacionadas: [], observacion: 'REP duplicado: mismo UUID cargado más de una vez; no se contabiliza dos veces.' });
            continue;
        }
        if (key) repVistos.add(key);
        repsUnicos.push(r);
    }

    const facturasPorUuid = new Map<string, ValidationResult>();
    results.forEach(r => {
        if (!esREP(r) && r.uuid) facturasPorUuid.set(String(r.uuid).toUpperCase(), r);
    });

    interface Acumulado {
        total: number;
        ultimaParcialidad: number;
        ultimaFecha: string;
        ultimoSaldoAnterior: number | null;
        ultimoSaldoInsoluto: number | null;
        repUuids: Set<string>;
        monedaIndeterminable: boolean; // true si algún pago no pudo convertirse con seguridad
        fueraDePeriodo: boolean; // true si algún REP llegó > DIAS_MAX_COMPLEMENTO después de la factura
    }
    const pagosPorFactura = new Map<string, Acumulado>();
    const reps: ReconciliacionREP[] = [];

    for (const rep of repsUnicos) {
        const detalles = rep.pagosRelacionados || [];
        if (detalles.length === 0) {
            reps.push({ uuid: rep.uuid, estado: 'RECHAZADO_ERROR', facturasRelacionadas: [], observacion: 'REP sin nodos DoctoRelacionado detectables en el XML.' });
            continue;
        }

        let algunaRelacionada = false;
        let algunaInvalida = false;
        const facturasDeEsteRep: string[] = [];

        for (const d of detalles) {
            const uuidRel = d.uuidFacturaRelacionada;
            if (!uuidRel || !UUID_FORMATO_VALIDO.test(uuidRel)) {
                algunaInvalida = true;
                continue; // nunca se sustituye por fecha/importe/RFC
            }
            const factura = facturasPorUuid.get(uuidRel);
            if (!factura) continue; // se resuelve abajo como "sin factura relacionada en este análisis"

            algunaRelacionada = true;
            facturasDeEsteRep.push(uuidRel);

            // ── Conversión de moneda: NUNCA se aproxima en silencio. ──
            // Casos cubiertos:
            //  a) misma moneda (DR == factura): importe tal cual;
            //  b) MonedaDR distinta con EquivalenciaDR > 0 válida: se convierte;
            //  c) EquivalenciaDR ausente, cero o inválida cuando las monedas
            //     difieren: NO se convierte — se marca monedaIndeterminable;
            //  d) cadena de conversión no soportada (p.ej. Pago en una tercera
            //     moneda distinta tanto de la factura como de MXN, sin dato
            //     directo de equivalencia): se trata igual que (c) — no se
            //     inventa un cruce de tipos de cambio.
            const monedaFactura = String(factura.moneda || 'MXN').toUpperCase();
            const monedaDR = String(d.monedaDR || monedaFactura).toUpperCase();
            let importe = d.impPagado ?? 0;
            let indeterminable = false;
            if (monedaDR !== monedaFactura) {
                const equivalencia = d.equivalenciaDR;
                if (equivalencia && Number.isFinite(equivalencia) && equivalencia > 0) {
                    importe = importe * equivalencia;
                } else {
                    indeterminable = true;
                }
            }

            const fechaFacturaDate = parseFechaCFDI(factura.fechaEmision);
            const fechaPagoDate = parseFechaCFDI(d.fechaPago);
            const fueraDePeriodo = !!(fechaFacturaDate && fechaPagoDate &&
                Math.floor((fechaPagoDate.getTime() - fechaFacturaDate.getTime()) / (1000 * 60 * 60 * 24)) > DIAS_MAX_COMPLEMENTO);

            const acc: Acumulado = pagosPorFactura.get(uuidRel) || {
                total: 0, ultimaParcialidad: 0, ultimaFecha: '', ultimoSaldoAnterior: null, ultimoSaldoInsoluto: null,
                repUuids: new Set<string>(), monedaIndeterminable: false, fueraDePeriodo: false,
            };
            if (!indeterminable) acc.total += importe;
            acc.monedaIndeterminable = acc.monedaIndeterminable || indeterminable;
            acc.fueraDePeriodo = acc.fueraDePeriodo || fueraDePeriodo;
            acc.repUuids.add(rep.uuid);
            if ((d.numParcialidad ?? 0) >= acc.ultimaParcialidad) {
                acc.ultimaParcialidad = d.numParcialidad ?? acc.ultimaParcialidad;
                acc.ultimaFecha = d.fechaPago;
                acc.ultimoSaldoAnterior = d.impSaldoAnt;
                acc.ultimoSaldoInsoluto = d.impSaldoInsoluto;
            }
            pagosPorFactura.set(uuidRel, acc);
        }

        if (algunaRelacionada) {
            reps.push({ uuid: rep.uuid, estado: 'RELACIONADO', facturasRelacionadas: facturasDeEsteRep, observacion: '' });
        } else if (algunaInvalida) {
            reps.push({ uuid: rep.uuid, estado: 'RECHAZADO_ERROR', facturasRelacionadas: [], observacion: 'UUID de documento relacionado con formato inválido.' });
        } else {
            reps.push({ uuid: rep.uuid, estado: 'SIN_FACTURA_RELACIONADA', facturasRelacionadas: [], observacion: 'REP sin factura relacionada en este análisis.' });
        }
    }

    const facturas: ReconciliacionFactura[] = [];
    for (const r of results) {
        if (esREP(r)) continue;
        const metodo = String(r.metodoPago || '').toUpperCase();
        const uuid = String(r.uuid || '').toUpperCase();

        if (metodo === 'PUE') {
            facturas.push({
                uuid: r.uuid, tipoCFDI: r.tipoCFDI, direccionCFDI: r.direccionCFDI, metodoPago: 'PUE',
                estado: 'PUE', totalFactura: r.total || 0, totalPagado: r.total || 0,
                saldoAnterior: r.total || 0, saldoInsoluto: 0, ultimaParcialidad: null, ultimaFechaPago: null,
                repRelacionados: [], observacion: 'PUE: no requiere REP para considerarse pagada conforme a su método de pago.',
            });
            continue;
        }

        if (metodo !== 'PPD') continue; // fuera de alcance (Nómina, Traslado, etc.)

        const acc = pagosPorFactura.get(uuid);
        const total = r.total || 0;

        if (!acc || acc.repUuids.size === 0) {
            // Sin REP no hay fecha de pago conocida: NUNCA se decide con la
            // fecha de la factura — ver evaluarObligacionREP. Nunca se afirma
            // "no exigible" ni "incumplimiento" sin esa evidencia.
            const obligacion = evaluarObligacionREP({
                tipoCFDI: r.tipoCFDI, metodoPago: r.metodoPago,
                fechaFactura: r.fechaEmision, fechaPago: null, existeREP: false,
            });
            facturas.push({
                uuid: r.uuid, tipoCFDI: r.tipoCFDI, direccionCFDI: r.direccionCFDI, metodoPago: 'PPD',
                estado: 'SIN_EVIDENCIA_REP', totalFactura: total, totalPagado: 0,
                saldoAnterior: null, saldoInsoluto: null, ultimaParcialidad: null, ultimaFechaPago: null,
                repRelacionados: [], observacion: obligacion.mensaje,
            });
            continue;
        }

        // Nunca se presenta como liquidada/parcial una factura cuya conversión
        // de moneda no pudo determinarse con seguridad — no se inventan saldos.
        if (acc.monedaIndeterminable) {
            facturas.push({
                uuid: r.uuid, tipoCFDI: r.tipoCFDI, direccionCFDI: r.direccionCFDI, metodoPago: 'PPD',
                estado: 'REQUIERE_REVISION_MONEDA', totalFactura: total, totalPagado: Math.round(acc.total * 100) / 100,
                saldoAnterior: acc.ultimoSaldoAnterior, saldoInsoluto: null,
                ultimaParcialidad: acc.ultimaParcialidad || null, ultimaFechaPago: acc.ultimaFecha || null,
                repRelacionados: Array.from(acc.repUuids),
                observacion: 'Requiere revisión por conversión de moneda.',
            });
            continue;
        }

        // REP presente: se evalúa la obligación con la fecha REAL del pago
        // (no la de la factura). Si esa fecha no es parseable, se marca para
        // revisión sin descartar el dinero ya reconciliado (ImpPagado no
        // depende de FechaPago). Si es histórica, es solo informativo: el
        // dinero reconciliado (LIQUIDADA/PARCIAL) sigue siendo el real.
        const obligacion = evaluarObligacionREP({
            tipoCFDI: r.tipoCFDI, metodoPago: r.metodoPago,
            fechaFactura: r.fechaEmision, fechaPago: acc.ultimaFecha, existeREP: true,
        });

        if (obligacion.estado === 'FECHA_PAGO_INSUFICIENTE') {
            facturas.push({
                uuid: r.uuid, tipoCFDI: r.tipoCFDI, direccionCFDI: r.direccionCFDI, metodoPago: 'PPD',
                estado: 'REQUIERE_REVISION_FECHA', totalFactura: total, totalPagado: Math.round(acc.total * 100) / 100,
                saldoAnterior: acc.ultimoSaldoAnterior, saldoInsoluto: null,
                ultimaParcialidad: acc.ultimaParcialidad || null, ultimaFechaPago: acc.ultimaFecha || null,
                repRelacionados: Array.from(acc.repUuids),
                observacion: obligacion.mensaje,
            });
            continue;
        }

        const saldo = acc.ultimoSaldoInsoluto !== null ? acc.ultimoSaldoInsoluto : Math.max(0, total - acc.total);
        const liquidada = saldo <= TOLERANCIA_SALDO || acc.total >= (total - TOLERANCIA_SALDO);
        const notaPeriodo = acc.fueraDePeriodo ? ` Complemento recibido más de ${DIAS_MAX_COMPLEMENTO} días después de la factura — revisar razón de negocio.` : '';
        const pagoHistoricamenteExento = obligacion.estado === 'NO_EXIGIBLE_HISTORICO';
        // Texto exacto pedido: evitar "exento" (se puede confundir con una
        // exención fiscal) — esto es solo informativo sobre CUÁNDO se recibió
        // el pago, no una exención de ningún tipo.
        const notaHistorica = pagoHistoricamenteExento ? ' Pago recibido antes de la obligatoriedad general del REP — informativo.' : '';
        facturas.push({
            uuid: r.uuid, tipoCFDI: r.tipoCFDI, direccionCFDI: r.direccionCFDI, metodoPago: 'PPD',
            estado: liquidada ? 'LIQUIDADA' : 'PARCIAL',
            totalFactura: total, totalPagado: Math.round(acc.total * 100) / 100,
            saldoAnterior: acc.ultimoSaldoAnterior !== null ? Math.round(acc.ultimoSaldoAnterior * 100) / 100 : null,
            saldoInsoluto: Math.round(Math.max(0, saldo) * 100) / 100,
            ultimaParcialidad: acc.ultimaParcialidad || null,
            ultimaFechaPago: acc.ultimaFecha || null,
            repRelacionados: Array.from(acc.repUuids),
            observacion: (liquidada ? 'Pagada mediante uno o varios REP.' : 'Pagada parcialmente; saldo insoluto pendiente.') + notaPeriodo + notaHistorica,
            fueraDePeriodo: acc.fueraDePeriodo,
            pagoHistoricamenteExento,
        });
    }

    return { facturas, reps: [...reps, ...repsDuplicados] };
}

// Función de estado productiva usada por el Dashboard (ver Dashboard.tsx,
// handler principal de validación) para combinar un lote recién validado con
// el acumulado ya presente en pantalla: (1) deduplica por UUID — una carga
// sucesiva del mismo REP/factura NUNCA se agrega dos veces; (2) ejecuta la
// conciliación central UNA sola vez sobre el acumulado COMPLETO, de modo que
// una factura PPD cargada en un lote anterior se actualice retroactivamente
// cuando su REP llega en un lote posterior (y viceversa). Se exporta para que
// las pruebas de integración monten este MISMO flujo — no una función pura
// aislada — tal como lo exige la auditoría de cargas sucesivas.
export function mergeAndReconcileResults(
    previos: ValidationResult[],
    nuevos: ValidationResult[]
): { combinado: ValidationResult[]; agregados: number; omitidosPorDuplicado: number } {
    const existentes = new Set(previos.map(r => String(r.uuid || '').toUpperCase()));
    const nuevosUnicos = nuevos.filter(r => !existentes.has(String(r.uuid || '').toUpperCase()));
    const combinadoBruto = [...previos, ...nuevosUnicos];
    return {
        combinado: aplicarConciliacionPagos(combinadoBruto),
        agregados: nuevosUnicos.length,
        omitidosPorDuplicado: nuevos.length - nuevosUnicos.length,
    };
}

// Aplica el resultado de reconciliarPagosPPD (fuente central) sobre cada
// ValidationResult, incluyendo los campos legados paymentComplementStatus /
// paymentMethodStatus / ivaCreditabilityStatus / fiscalRiskLevel para que
// consumidores antiguos (Dashboard, Excel, fiscalRules) sigan funcionando sin
// mantener una segunda regla de negocio independiente. No muta los objetos
// recibidos — retorna un arreglo nuevo (necesario para el re-render de React).
export function aplicarConciliacionPagos(results: ValidationResult[]): ValidationResult[] {
    const reconciliacion = reconciliarPagosPPD(results);
    const facturaPorUuid = new Map<string, ReconciliacionFactura>();
    for (const f of reconciliacion.facturas) facturaPorUuid.set(String(f.uuid || '').toUpperCase(), f);
    const repPorUuid = new Map<string, ReconciliacionREP>();
    for (const rep of reconciliacion.reps) repPorUuid.set(String(rep.uuid || '').toUpperCase(), rep);

    const REASONS_GESTIONADAS_AQUI = new Set([
        'PPD sin complemento detectado',
        'PPD con complemento presente pero inválido',
        'REVISAR_FECHA',
        'REVISAR_MONEDA',
        'COMPLEMENTO_FUERA_DE_PERIODO',
        'SIN HALLAZGOS FISCALES',
    ]);

    return results.map((r) => {
        const uuid = String(r.uuid || '').toUpperCase();
        const esRep = String(r.tipoCFDI || '').toUpperCase() === 'P';

        if (esRep) {
            const repInfo = repPorUuid.get(uuid);
            if (!repInfo) return r;
            const legacyStatus = repInfo.estado === 'RELACIONADO' ? 'COMPLETO'
                : repInfo.estado === 'DUPLICADO' ? 'DUPLICADO'
                : 'UUID_RELACIONADO_NO_ENCONTRADO';
            return {
                ...r,
                paymentComplementStatus: legacyStatus,
                pagosRelacionadosEstado: repInfo.estado,
                pagosRelacionadosObservacion: repInfo.observacion,
            };
        }

        const facturaInfo = facturaPorUuid.get(uuid);
        if (!facturaInfo) return r; // fuera de alcance (Nómina, Traslado, Notas de Crédito, etc.)

        const reasons = (r.fiscalRiskReason || '')
            .split(' | ')
            .filter(x => x && !REASONS_GESTIONADAS_AQUI.has(x));

        let paymentComplementStatus: string;
        let paymentMethodStatus: string | undefined = r.paymentMethodStatus;
        let ivaCreditabilityStatus = r.ivaCreditabilityStatus;
        const pagosValidoNo = String(r.pagosValido || '').toUpperCase() === 'NO';

        switch (facturaInfo.estado) {
            case 'PUE':
                paymentComplementStatus = 'NO APLICA';
                break;
            case 'SIN_EVIDENCIA_REP':
                paymentComplementStatus = 'SIN_COMPLEMENTO';
                paymentMethodStatus = 'PPD_SIN_COMPLEMENTO';
                reasons.push('PPD sin complemento detectado');
                break;
            case 'REQUIERE_REVISION_FECHA':
                paymentComplementStatus = 'REVISAR_FECHA';
                paymentMethodStatus = 'PPD_REVISAR_COMPLEMENTO';
                reasons.push('REVISAR_FECHA');
                break;
            case 'REQUIERE_REVISION_MONEDA':
                paymentComplementStatus = 'REVISAR_MONEDA';
                paymentMethodStatus = 'PPD_REVISAR_COMPLEMENTO';
                reasons.push('REVISAR_MONEDA');
                break;
            case 'PARCIAL':
            case 'LIQUIDADA':
            default:
                paymentComplementStatus = facturaInfo.fueraDePeriodo ? 'COMPLEMENTO_FUERA_DE_PERIODO' : 'COMPLETO';
                paymentMethodStatus = pagosValidoNo ? 'PPD_REVISAR_COMPLEMENTO' : 'PPD_CON_COMPLEMENTO';
                if (facturaInfo.fueraDePeriodo) reasons.push('COMPLEMENTO_FUERA_DE_PERIODO');
                if (r.direccionCFDI !== 'EMITIDO' && !pagosValidoNo && (r.ivaTraslado || 0) > 0 && r.isValid) {
                    ivaCreditabilityStatus = 'ACREDITABLE';
                }
                break;
        }

        const esNoUsable = String(r.resultado || '').includes('NO USABLE');
        const isCritical = ivaCreditabilityStatus === 'NO_ACREDITABLE';
        const fiscalRiskLevel: ValidationResult['fiscalRiskLevel'] =
            (isCritical || esNoUsable) ? 'ROJO' : (reasons.length > 0 ? 'AMARILLO' : 'VERDE');

        return {
            ...r,
            paymentComplementStatus,
            paymentMethodStatus,
            ivaCreditabilityStatus,
            fiscalRiskLevel,
            fiscalRiskReason: reasons.join(' | ') || 'SIN HALLAZGOS FISCALES',
            pagosRelacionadosEstado: facturaInfo.estado,
            pagosRelacionadosTotalPagado: facturaInfo.totalPagado,
            pagosRelacionadosSaldoInsoluto: facturaInfo.saldoInsoluto,
            pagosRelacionadosObservacion: facturaInfo.observacion,
            pagosRelacionadosHistoricamenteExento: facturaInfo.pagoHistoricamenteExento || false,
        };
    });
}
