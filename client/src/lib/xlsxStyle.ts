import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

// SheetJS Community solo escribe formatos numéricos (cell.z), anchos y
// autofiltro: ignora cell.s y los paneles inmovilizados. Este módulo da
// formato profesional al XLSX ya serializado: reescribe styles.xml y marca
// celdas (encabezado, secciones, severidad) sin tocar ningún valor.

export type CellStyle = 'section' | 'alta' | 'mediaAlta' | 'ok';
/** Por hoja (en orden de SheetNames): celdas con estilo especial, en coordenadas 0-indexadas de datos (fila 0 = encabezado). */
export type SheetStylePlan = { cells: { r: number; c: number; style: CellStyle }[]; sectionRows: number[] };

export const MONEY_FORMAT = '#,##0.00';
export const INTEGER_FORMAT = '#,##0';
export const RATE_FORMAT = '#,##0.0000';

const INTEGER_HEADER = /^(CFDI|Cantidad|No_cuantificables|Pagos|Num_|NumParcialidad|Ultima_Parcialidad)|_sin_tipo_de_cambio$|^Importes_sin/i;
const RATE_HEADER = /Tipo_?Cambio|Equivalencia/i;

/** Formato numérico de una celda según su encabezado (y, en hojas Indicador/Valor, según el indicador). */
export function numberFormatFor(header: string, value: number, rowLabel = ''): string {
  if (rowLabel) return /MXN/.test(rowLabel) ? MONEY_FORMAT : Number.isInteger(value) ? INTEGER_FORMAT : MONEY_FORMAT;
  if (RATE_HEADER.test(header)) return RATE_FORMAT;
  if (INTEGER_HEADER.test(header)) return INTEGER_FORMAT;
  return MONEY_FORMAT;
}

const NAVY = 'FF1F3864';
const BORDER = 'FFBFBFBF';

const countTag = (xml: string, tag: string) => Number(new RegExp(`<${tag} count="(\\d+)"`).exec(xml)?.[1] || 0);
const appendTo = (xml: string, tag: string, items: string[]) => {
  const count = countTag(xml, tag);
  return xml
    .replace(new RegExp(`<${tag} count="\\d+"`), `<${tag} count="${count + items.length}"`)
    .replace(`</${tag}>`, `${items.join('')}</${tag}>`);
};

/** Reescribe styles.xml; devuelve los índices de los estilos nuevos. */
function rewriteStyles(xml: string) {
  const fonts = countTag(xml, 'fonts');
  const fills = countTag(xml, 'fills');
  const borders = countTag(xml, 'borders');
  const xfs = countTag(xml, 'cellXfs');
  // Fuente base 10 pt en todo el libro.
  xml = xml.replace(/<font><sz val="12"\/>/, '<font><sz val="10"/>');
  xml = appendTo(xml, 'fonts', [
    `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="11"/><color rgb="${NAVY}"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="10"/><color rgb="FF9C0006"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="10"/><color rgb="FF9C5700"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><sz val="10"/><color rgb="FF006100"/><name val="Calibri"/><family val="2"/></font>`,
  ]);
  const fill = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  xml = appendTo(xml, 'fills', [fill(NAVY), fill('FFD9E1F2'), fill('FFFFC7CE'), fill('FFFFEB9C'), fill('FFC6EFCE')]);
  xml = appendTo(xml, 'borders', [
    `<border><left style="thin"><color rgb="${BORDER}"/></left><right style="thin"><color rgb="${BORDER}"/></right><top style="thin"><color rgb="${BORDER}"/></top><bottom style="thin"><color rgb="${BORDER}"/></bottom><diagonal/></border>`,
  ]);
  // Bordes finos en todas las celdas existentes, conservando su formato numérico.
  xml = xml.replace(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/, (block, inner: string) =>
    block.replace(inner, inner.replace(/<xf ([^>]*?)borderId="\d+"([^>]*?)(\/?)>/g, (_m, a, b, close) =>
      `<xf ${a}borderId="${borders}"${b.includes('applyBorder') ? b : `${b} applyBorder="1"`}${close}>`)));
  const xf = (font: number, fillId: number, align: string) =>
    `<xf numFmtId="0" fontId="${font}" fillId="${fillId}" borderId="${borders}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment ${align}/></xf>`;
  xml = appendTo(xml, 'cellXfs', [
    xf(fonts, fills, 'horizontal="center" vertical="center" wrapText="1"'),
    xf(fonts + 1, fills + 1, 'vertical="center"'),
    xf(fonts + 2, fills + 2, 'vertical="center"'),
    xf(fonts + 3, fills + 3, 'vertical="center"'),
    xf(fonts + 4, fills + 4, 'vertical="center"'),
  ]);
  return { xml, ids: { header: xfs, section: xfs + 1, alta: xfs + 2, mediaAlta: xfs + 3, ok: xfs + 4 } };
}
type StyleIds = ReturnType<typeof rewriteStyles>['ids'];

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)![0];
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};
const setStyle = (cellTag: string, style: number) =>
  cellTag.replace(/ s="\d+"/, '').replace(/^<c /, `<c s="${style}" `);

function styleSheet(xml: string, plan: SheetStylePlan | undefined, ids: StyleIds) {
  const special = new Map<string, number>();
  plan?.cells.forEach(cell => special.set(`${cell.r}|${cell.c}`, ids[cell.style]));
  const sections = new Set(plan?.sectionRows || []);
  xml = xml.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (row, num: string, attrs: string, inner: string) => {
    const r = Number(num) - 1;
    if (r === 0) return `<row r="${num}"${attrs} ht="30" customHeight="1">${inner.replace(/<c [^>]*?(?=\/?>)/g, tag => setStyle(tag, ids.header))}</row>`;
    if (!sections.has(r) && !special.size) return row;
    const styled = inner.replace(/<c [^>]*?(?=\/?>)/g, tag => {
      if (sections.has(r)) return setStyle(tag, ids.section);
      const ref = / r="([A-Z]+)\d+"/.exec(tag)?.[1];
      const style = ref ? special.get(`${r}|${colIndex(ref)}`) : undefined;
      return style === undefined ? tag : setStyle(tag, style);
    });
    return `<row r="${num}"${attrs}>${styled}</row>`;
  });
  // Encabezado fijo al desplazarse.
  return xml.replace(/<sheetView workbookViewId="0"\/>/,
    '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>');
}

/** Aplica el formato a un XLSX serializado por SheetJS. `plans` va en el orden de SheetNames. */
export function styleXlsx(bytes: Uint8Array, plans: (SheetStylePlan | undefined)[]): Uint8Array {
  const files = unzipSync(bytes);
  const { xml, ids } = rewriteStyles(strFromU8(files['xl/styles.xml']));
  files['xl/styles.xml'] = strToU8(xml);
  plans.forEach((plan, i) => {
    const path = `xl/worksheets/sheet${i + 1}.xml`;
    if (files[path]) files[path] = strToU8(styleSheet(strFromU8(files[path]), plan, ids));
  });
  return zipSync(files, { level: 6 });
}
