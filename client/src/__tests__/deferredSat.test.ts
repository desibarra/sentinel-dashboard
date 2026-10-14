import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useXMLValidator } from '../hooks/useXMLValidator';
import { checkCFDIStatusSAT } from '../utils/satStatusValidator';

vi.mock('../utils/satStatusValidator', () => ({ checkCFDIStatusSAT: vi.fn() }));
const satMock = vi.mocked(checkCFDIStatusSAT);

// @ts-ignore
global.IS_REACT_ACT_ENVIRONMENT = true;

const xml = readFileSync(resolve(__dirname, '../../../tests/fixtures/demo-xmls/01_FACTURA_CORRECTA.xml'), 'utf8');
const uuid = /UUID="([^"]+)"/.exec(xml)![1];

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, length: 0 } as Storage;
};

async function validate(options?: { deferSat?: boolean }): Promise<any> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const result = await new Promise<any>((done, fail) => {
    function Harness() {
      const { validateXMLFiles } = useXMLValidator();
      React.useEffect(() => {
        validateXMLFiles([{ id: '1', name: 'a.xml', size: xml.length, status: 'pending', content: xml }], 'Transporte', 'IATD70020G77', () => {}, options)
          .then(rows => done(rows[0]), fail);
      }, []);
      return null;
    }
    act(() => root.render(React.createElement(Harness)));
  });
  act(() => root.unmount());
  container.remove();
  return result;
}

describe('análisis local sin esperar al SAT', () => {
  beforeEach(() => {
    satMock.mockReset();
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('deferSat no consulta al SAT y deja el CFDI como "No validado SAT" (pendiente de la consulta en segundo plano)', async () => {
    const row = await validate({ deferSat: true });
    expect(satMock).not.toHaveBeenCalled();
    expect(row.estatusSAT).toBe('No verificado');
    expect(row.resultado).toBe('No validado SAT');
    expect(row.resultadoMotor).toBeTruthy(); // la clasificación local queda lista para recomponer con el SAT
  });

  it('deferSat usa la caché SAT si ya hay un estatus definitivo', async () => {
    localStorage.setItem(`cfdi-status-${uuid}`, JSON.stringify({ estado: 'Vigente', validatedAt: new Date().toISOString() }));
    const row = await validate({ deferSat: true });
    expect(satMock).not.toHaveBeenCalled();
    expect(row.estatusSAT).toBe('Vigente');
  });

  it('solo guarda en caché estatus definitivos: un error de conexión se vuelve a intentar', async () => {
    satMock.mockResolvedValue({ estado: 'Error Conexión', esCancelable: 'N/A', estatusCancelacion: 'N/A', codigoEstatus: 'N/A', validatedAt: new Date() });
    await validate();
    expect(localStorage.getItem(`cfdi-status-${uuid}`)).toBeNull();
    satMock.mockResolvedValue({ estado: 'Vigente', esCancelable: 'N/A', estatusCancelacion: '', codigoEstatus: 'S', validatedAt: new Date() });
    expect((await validate()).estatusSAT).toBe('Vigente');
    expect(satMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(`cfdi-status-${uuid}`)!).estado).toBe('Vigente');
  });
});
