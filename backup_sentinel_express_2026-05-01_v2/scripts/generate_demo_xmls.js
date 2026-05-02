import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEMO_DIR = path.join(__dirname, '..', 'demo-xmls');

if (!fs.existsSync(DEMO_DIR)) {
    fs.mkdirSync(DEMO_DIR);
}

const generateXML = (filename, data) => {
    // Escapar entidades XML básicas si es necesario, pero aquí los datos son controlados
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd" Version="4.0" Serie="DEMO" Folio="${data.folio || '001'}" Fecha="2026-03-04T12:00:00" Sello="---" FormaPago="03" NoCertificado="00001000000504465950" Certificado="---" SubTotal="${data.subtotal.toFixed(2)}" Moneda="MXN" Total="${data.total.toFixed(2)}" TipoDeComprobante="${data.tipo || 'I'}" Exportacion="01" MetodoPago="PUE" LugarExpedicion="45000">
    <cfdi:Emisor Rfc="${data.emisorRfc}" Nombre="${data.emisorNombre}" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="IATD70020G77" Nombre="EMPRESA SA DE CV" DomicilioFiscalReceptor="32310" RegimenFiscalReceptor="603" UsoCFDI="G03"/>
    <cfdi:Conceptos>
        <cfdi:Concepto ClaveProdServ="${data.claveProdServ || '84111506'}" NoIdentificacion="7501030034" Cantidad="1.00" ClaveUnidad="E48" Unidad="Unidad de servicio" Descripcion="${data.descripcion}" ValorUnitario="${data.importeUnitario.toFixed(2)}" Importe="${data.importeUnitario.toFixed(2)}" ObjetoImp="02">
            <cfdi:Impuestos>
                <cfdi:Traslados>
                    <cfdi:Traslado Base="${data.importeUnitario.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${(data.importeUnitario * 0.16).toFixed(2)}"/>
                </cfdi:Traslados>
            </cfdi:Impuestos>
        </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="${(data.importeUnitario * 0.16).toFixed(2)}">
        <cfdi:Traslados>
            <cfdi:Traslado Base="${data.importeUnitario.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${(data.importeUnitario * 0.16).toFixed(2)}"/>
        </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${data.uuid}" FechaTimbrado="2026-03-04T12:05:00" RfcProvCertif="SAT970701NN3" SelloCFD="---" NoCertificadoSAT="00001000000504465028" SelloSAT="---"/>
        ${data.extraComplemento || ''}
    </cfdi:Complemento>
</cfdi:Comprobante>`;

    fs.writeFileSync(path.join(DEMO_DIR, filename), xml);
    console.log(`✅ Generado: ${filename}`);
};

const demoData = [
    {
        filename: '01_FACTURA_CORRECTA.xml',
        uuid: '550E8400-E29B-41D4-A716-446655440000',
        emisorRfc: 'MME921204H52',
        emisorNombre: 'MANTENIMIENTO MECANICO ESPECIALIZADO SA DE CV',
        subtotal: 1000.00,
        total: 1160.00,
        importeUnitario: 1000.00,
        descripcion: 'MANTENIMIENTO PREVENTIVO DE FLOTA SEPTIEMBRE',
        claveProdServ: '78181500'
    },
    {
        filename: '02_ALERTA_EFOS_LISTA_NEGRA.xml',
        uuid: '550E8400-E29B-41D4-A716-446655440001',
        emisorRfc: 'AAA120730823',
        emisorNombre: 'ASESORES Y ADMINISTRADORES AGRICOLAS S DE RL DE CV',
        subtotal: 50000.00,
        total: 58000.00,
        importeUnitario: 50000.00,
        descripcion: 'CONSULTORIA ESTRATEGICA EMPRESARIAL',
        claveProdServ: '80101500'
    },
    {
        filename: '03_ALERTA_FALTA_CARTA_PORTE.xml',
        uuid: '550E8400-E29B-41D4-A716-446655440002',
        emisorRfc: 'TME960709LR2',
        emisorNombre: 'TRANSPORTES MEXICANOS ESPECIALIZADOS SA DE CV',
        subtotal: 12000.00,
        total: 13920.00,
        importeUnitario: 12000.00,
        descripcion: 'FLETE DE MERCANCIA RUTA CDMX - GUADALAJARA 450KM',
        claveProdServ: '78101802'
    },
    {
        filename: '04_FACTURA_CON_CARTA_PORTE_OK.xml',
        uuid: '550E8400-E29B-41D4-A716-446655440003',
        emisorRfc: 'TME960709LR2',
        emisorNombre: 'TRANSPORTES MEXICANOS ESPECIALIZADOS SA DE CV',
        subtotal: 15000.00,
        total: 17400.00,
        importeUnitario: 15000.00,
        descripcion: 'SERVICIO DE TRANSPORTE DE CARGA TERCERIZADO',
        claveProdServ: '78101802',
        extraComplemento: `
        <cartaporte31:CartaPorte xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31" Version="3.1" IdCCP="CCC550E8-8400-41D4-A716-446655440003" TranspInternac="No" TotalDistRec="450">
            <cartaporte31:Ubicaciones>
                <cartaporte31:Ubicacion TipoUbicacion="Origen" IDUbicacion="OR000001" RFCRemitenteDestinatario="MME921204H52" FechaHoraSalidaLlegada="2026-03-04T10:00:00"/>
                <cartaporte31:Ubicacion TipoUbicacion="Destino" IDUbicacion="DE000001" RFCRemitenteDestinatario="UACJ700101TXA" FechaHoraSalidaLlegada="2026-03-04T18:00:00" DistanciaRecorrida="450"/>
            </cartaporte31:Ubicaciones>
            <cartaporte31:Mercancias PesoBrutoTotal="1500" UnidadPeso="KGM" NumTotalMercancias="1">
                <cartaporte31:Mercancia BienesTransp="50111500" Cantidad="1500" ClaveUnidad="KGM" PesoEnKg="1500"/>
                <cartaporte31:Autotransporte PermSCT="TPAF01" NumPermisoSCT="123456789">
                    <cartaporte31:IdentificacionVehicular ConfigVehicular="T3S2" Placa="22AA22" AnioModeloVM="2022"/>
                    <cartaporte31:Seguros AseguraRespCivil="AXA SEGUROS" PolizaRespCivil="987654321"/>
                </cartaporte31:Autotransporte>
            </cartaporte31:Mercancias>
            <cartaporte31:FiguraTransporte>
                <cartaporte31:TiposFigura TipoFigura="01" RFCFigura="AAAA620217U54" NumLicencia="1234567890"/>
            </cartaporte31:FiguraTransporte>
        </cartaporte31:CartaPorte>`
    },
    {
        filename: '05_ERROR_TOTALES_DESCUADRE.xml',
        uuid: '550E8400-E29B-41D4-A716-446655440004',
        emisorRfc: 'COM010101ABC',
        emisorNombre: 'COMERCIALIZADORA DE PRUEBAS SA DE CV',
        subtotal: 1000.00,
        total: 1500.00,
        importeUnitario: 1000.00,
        descripcion: 'ARTICULOS DE OFICINA VARIOS',
        claveProdServ: '44121708'
    }
];

demoData.forEach(data => generateXML(data.filename, data));

console.log('\n🚀 Paquete de demostración listo en el directorio: demo-xmls/');
