import { describe, it, expect } from 'vitest';
import { isXmlName, sourcesFromDataTransfer, sourcesFromFileList } from '../lib/xmlIntake';

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
