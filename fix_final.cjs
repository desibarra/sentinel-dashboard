const fs = require('fs');
let c = fs.readFileSync('client/src/lib/excelExporter.ts', 'utf8');

c = c.replace(/Resumen_CP_Homologado/g, 'Resumen_Carta_Porte_Homologado');

c = c.replace('Estatus_Carta_Porte_Homologado: uuidMap.get', 'Estatus_Complemento_Carta_Porte_Homologado: uuidMap.get');
c = c.replace('Version_Carta_Porte_Homologado: uuidMap.get', 'Version_Complemento_Carta_Porte_Homologado: uuidMap.get');
c = c.replace('Requiere_Carta_Porte: r.requiereCartaPorte', 'Requiere_Complemento_Carta_Porte: r.requiereCartaPorte');
c = c.replace('Carta_Porte_Presente: getCartaPortePresente', 'Complemento_Carta_Porte_Presente: getCartaPortePresente');
c = c.replace('Carta_Porte_Completa: r.cartaPorteCompleta', 'Complemento_Carta_Porte_Completo: r.cartaPorteCompleta');
c = c.replace('Version_Carta_Porte: detail?.version', 'Version_Complemento_Carta_Porte: detail?.version');

const trazabilidadSearch = "          'Tiene Complemento Carta Porte relacionado': node.isPrincipal ? (node.tieneCPPrincipal ? 'SI' : 'NO') : 'NO APLICA',";
const trazabilidadReplace = "          'Tiene Complemento Carta Porte relacionado': node.isPrincipal ? (node.tieneCPPrincipal ? 'SI' : 'NO') : (pref.parentTieneCP ? 'SI' : (pref.parentTipoCFDI === 'E' || pref.parentTipoCFDI === 'P' ? 'NO APLICA POR TIPO CFDI PRINCIPAL' : 'NO')),";
c = c.replace(trazabilidadSearch, trazabilidadReplace);

const estatusRelSearch =     } else {
      node.estatusCP = 'CP_XML_RELACIONADO';
    };
const estatusRelReplace =     } else {
      const parentHasCP = node.parentRefs.some((p: any) => p.parentTieneCP);
      const parentIsEP = node.parentRefs.some((p: any) => p.parentTipoCFDI === 'E' || p.parentTipoCFDI === 'P');
      
      if (parentHasCP) {
        node.estatusCP = 'UUID_RELACIONADO_EN_CFDI_CON_COMPLEMENTO_CP';
      } else if (parentIsEP) {
        node.estatusCP = 'UUID_RELACIONADO_EN_CFDI_NO_APLICA_POR_TIPO_CFDI';
      } else {
        node.estatusCP = 'UUID_RELACIONADO_EN_CFDI_SIN_COMPLEMENTO_CP';
      }
    };
c = c.replace(estatusRelSearch, estatusRelReplace);

fs.writeFileSync('client/src/lib/excelExporter.ts', c, 'utf8');
