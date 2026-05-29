
import { BlacklistValidation } from "@/utils/blacklistValidator";
import { evaluarMaterialidadGasto } from "./materialityRules";

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
        resultado = "🟡 ALERTA";
        comentarioFiscal = "CFDI con complemento de Estado de Cuenta de Combustible. La información relevante de litros, importes e impuestos viene en el complemento. Revisar deducibilidad y acreditamiento de IVA conforme a política interna.";
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
