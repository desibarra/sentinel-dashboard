import { describe, it, expect } from 'vitest';
import { zipSync, strToU8, strFromU8 } from 'fflate';
import { extractXmlFromZip, isXmlName, isZipName, readBytes, sourcesFromDataTransfer, sourcesFromFileList, zipIsEncrypted } from '../lib/xmlIntake';

// Árbol simulado de la File and Directory Entries API (lo que entrega el navegador al arrastrar una carpeta).
type Tree = { [name: string]: string | Tree };
const entryOf = (name: string, node: string | Tree, parent = ''): any => {
  const fullPath = `${parent}/${name}`;
  if (typeof node === 'string') {
    return { isFile: true, isDirectory: false, name, fullPath, file: (ok: (f: File) => void) => ok(new File([node], name)) };
  }
  const children = Object.entries(node).map(([child, value]) => entryOf(child, value, fullPath));
  return {
    isFile: false, isDirectory: true, name, fullPath,
    // Como Chrome: entrega los hijos en bloques (aquí de 2) y luego un bloque vacío.
    createReader: () => {
      let offset = 0;
      return { readEntries: (ok: (e: any[]) => void) => { const batch = children.slice(offset, offset + 2); offset += batch.length; ok(batch); } };
    },
  };
};
const dataTransfer = (roots: Tree) => {
  const entries = Object.entries(roots).map(([name, node]) => entryOf(name, node));
  return { items: entries.map(entry => ({ kind: 'file', webkitGetAsEntry: () => entry })), files: [] } as unknown as DataTransfer;
};

describe('entrada de carpetas y subcarpetas', () => {
  it('reconoce .xml sin importar mayúsculas e ignora otras extensiones', () => {
    expect(['a.xml', 'B.XML', 'c.Xml'].every(isXmlName)).toBe(true);
    expect(['a.pdf', 'b.txt', 'xml', 'a.xml.bak', 'a.zip'].some(isXmlName)).toBe(false);
  });

  it('recorre carpetas arrastradas a 3 niveles, incluidos directorios con más hijos que un bloque', async () => {
    const { sources, unreadable } = await sourcesFromDataTransfer(dataTransfer({
      TVA: {
        '2026': {
          '07': { emitidos: { 'a.xml': '<a/>', 'b.XML': '<b/>', 'c.xml': '<c/>' }, recibidos: { 'd.xml': '<d/>', 'factura.pdf': '%PDF' } },
          'notas.txt': 'x',
        },
        'e.xml': '<e/>',
      },
      'suelto.xml': '<s/>',
    }));
    expect(unreadable).toEqual([]);
    expect(sources.map(s => s.path).sort()).toEqual([
      'TVA/2026/07/emitidos/a.xml', 'TVA/2026/07/emitidos/b.XML', 'TVA/2026/07/emitidos/c.xml',
      'TVA/2026/07/recibidos/d.xml', 'TVA/2026/07/recibidos/factura.pdf', 'TVA/2026/notas.txt', 'TVA/e.xml', 'suelto.xml',
    ]);
    const b = sources.find(s => s.path.endsWith('b.XML'))!.file;
    expect(await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsText(b); })).toBe('<b/>');
  });

  it('sin la API de entradas usa los archivos planos del arrastre', async () => {
    const file = new File(['<x/>'], 'x.xml');
    const { sources } = await sourcesFromDataTransfer({ items: [], files: [file] } as unknown as DataTransfer);
    expect(sources).toEqual([{ file, path: 'x.xml' }]);
  });

  it('conserva la ruta relativa del selector de carpeta', () => {
    const file = new File(['<x/>'], 'x.xml');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'TVA/2026/x.xml' });
    expect(sourcesFromFileList([file])[0].path).toBe('TVA/2026/x.xml');
  });
});

describe('entrada de ZIP', () => {
  const zip = (files: Record<string, string | Uint8Array>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, typeof data === 'string' ? strToU8(data) : data])));
  // Marca el bit de cifrado (bit 0 del general purpose flag) en encabezados locales y directorio central.
  const encrypt = (bytes: Uint8Array) => {
    const out = bytes.slice();
    for (let i = 0; i + 8 < out.length; i++) {
      const sig = out[i] | (out[i + 1] << 8) | (out[i + 2] << 16) | (out[i + 3] << 24);
      if (sig === 0x04034b50) out[i + 6] |= 1;
      if (sig === 0x02014b50) out[i + 8] |= 1;
    }
    return out;
  };

  it('lee los XML del ZIP y de sus subcarpetas internas, e ignora lo demás', async () => {
    const result = await extractXmlFromZip(zip({ 'a.xml': '<a/>', 'mes/07/B.XML': '<b/>', 'mes/07/factura.pdf': '%PDF', 'mes/': new Uint8Array() }), 'sat.zip');
    expect(result.opened).toEqual(['sat.zip']);
    expect(result.xmls.map(x => x.path)).toEqual(['sat.zip/a.xml', 'sat.zip/mes/07/B.XML']);
    expect(strFromU8(result.xmls[1].bytes)).toBe('<b/>');
    expect(result.ignoredNonXml).toBe(1);
    expect(result.failed).toEqual([]);
  });

  it('abre un ZIP dentro del ZIP un nivel más y reporta los más profundos', async () => {
    const deepest = zip({ 'z.xml': '<z/>' });
    const inner = zip({ 'c.xml': '<c/>', 'mas.zip': deepest });
    const result = await extractXmlFromZip(zip({ 'a.xml': '<a/>', 'interno.zip': inner }), 'sat.zip');
    expect(result.opened).toEqual(['sat.zip', 'sat.zip/interno.zip']);
    expect(result.xmls.map(x => x.path)).toEqual(['sat.zip/a.xml', 'sat.zip/interno.zip/c.xml']);
    expect(result.ignoredNested).toEqual(['sat.zip/interno.zip/mas.zip']);
  });

  it('un ZIP dañado o con contraseña no rompe la carga y queda reportado', async () => {
    const good = zip({ 'a.xml': '<a/>' });
    const damaged = await extractXmlFromZip(good.slice(0, 30), 'dañado.zip');
    expect(damaged.xmls).toEqual([]);
    expect(damaged.failed[0]).toMatchObject({ path: 'dañado.zip' });
    expect(damaged.failed[0].reason).toMatch(/dañado o ilegible/);

    expect(zipIsEncrypted(good)).toBe(false);
    const locked = await extractXmlFromZip(encrypt(good), 'clave.zip');
    expect(locked.failed).toEqual([{ path: 'clave.zip', reason: 'ZIP protegido con contraseña' }]);
    expect(locked.opened).toEqual([]);
  });

  it('un ZIP dentro de una carpeta arrastrada se reconoce como ZIP', async () => {
    const zipBytes = zip({ 'a.xml': '<a/>' });
    const dt = { items: [{ kind: 'file', webkitGetAsEntry: () => entryOf('carpeta', { 'descarga.ZIP': '' }) }], files: [] } as unknown as DataTransfer;
    const { sources } = await sourcesFromDataTransfer(dt);
    expect(sources.map(s => s.path)).toEqual(['carpeta/descarga.ZIP']);
    expect(isZipName(sources[0].file.name)).toBe(true);
    expect((await extractXmlFromZip(zipBytes, sources[0].path)).xmls.map(x => x.path)).toEqual(['carpeta/descarga.ZIP/a.xml']);
  });

  it('lee bytes de archivos aun sin Blob.arrayBuffer', async () => {
    expect(strFromU8(await readBytes(new File(['<a/>'], 'a.xml')))).toBe('<a/>');
  });
});
