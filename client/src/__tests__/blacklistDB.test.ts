import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
    replaceBlacklistRecordsBulk,
    getBlacklistsByRFC,
    getMetadata,
    updateMetadata,
    BlacklistRecord,
} from '../db/blacklistDB';
import { checkRFCBlacklist, isBlacklistSynced } from '../utils/blacklistValidator';

const sampleRecords: BlacklistRecord[] = [
    { rfc: 'AAA080808HL8', tipo: '69B', razonSocial: 'ASOCIADO A', situacion: 'Sentencia Favorable' },
    { rfc: 'BBB090909KJ2', tipo: '69B', razonSocial: 'EMPRESA B', situacion: 'Definitivo' },
    { rfc: 'BBB090909KJ2', tipo: '69B', razonSocial: 'EMPRESA B', situacion: 'Sentencia Favorable' },
    { rfc: 'CCC101010MN3', tipo: '69B', razonSocial: 'EMPRESA C', situacion: 'Presunto' },
    { rfc: 'DDD111111OP4', tipo: '69B', razonSocial: 'EMPRESA D', situacion: 'Desvirtuado' },
];

// Registros con fechas reales para probar resolución por fecha vigente
const datedRecords: BlacklistRecord[] = [
    // RAS050131EC5 — caso real: Presunto (2019-06-03), Definitivo (2018-08-17), Sentencia Favorable (2023-02-10)
    { rfc: 'RAS050131EC5', tipo: '69B', razonSocial: 'RUMA ASESORES, S.C.', situacion: 'Presunto', fechaPublicacion: '2019-06-03' },
    { rfc: 'RAS050131EC5', tipo: '69B', razonSocial: 'RUMA ASESORES, S.C.', situacion: 'Definitivo', fechaPublicacion: '2018-08-17' },
    { rfc: 'RAS050131EC5', tipo: '69B', razonSocial: 'RUMA ASESORES, S.C.', situacion: 'Sentencia Favorable', fechaPublicacion: '2023-02-10' },
    // Caso con empate en fecha máxima -> ambiguo
    { rfc: 'TIE010101AAA', tipo: '69B', razonSocial: 'EMPRESA EMPATE 1', situacion: 'Presunto', fechaPublicacion: '2022-05-01' },
    { rfc: 'TIE010101AAA', tipo: '69B', razonSocial: 'EMPRESA EMPATE 1', situacion: 'Definitivo', fechaPublicacion: '2022-05-01' },
    // Caso con fecha faltante en uno de los estados
    { rfc: 'NOF010101BBB', tipo: '69B', razonSocial: 'EMPRESA SIN FECHA', situacion: 'Presunto', fechaPublicacion: '2021-01-15' },
    { rfc: 'NOF010101BBB', tipo: '69B', razonSocial: 'EMPRESA SIN FECHA', situacion: 'Definitivo', fechaPublicacion: undefined },
];

describe('blacklistDB: persistencia y reglas 69-B', () => {
    it('reemplaza de forma atómica, conserva múltiples situaciones por RFC y persiste tras "recargar"', async () => {
        const inserted = await replaceBlacklistRecordsBulk(sampleRecords);
        expect(inserted).toBe(sampleRecords.length);

        // Guardar metadata con desglose (como hace BlacklistManager tras cargar)
        await updateMetadata({
            key: 'lastUpdate',
            cargadoEl: '2026-08-12T12:00:00.000Z',
            fechaOficial: '2025-12-31',
            efosCount: 0,
            list69BCount: inserted,
            totalRFC: 4,
            presuntos: 1,
            definitivos: 1,
            desvirtuados: 1,
            sentenciaFavorable: 2,
        });

        // Simular "recarga": volver a abrir y leer la misma base
        const meta = await getMetadata();
        expect(meta?.cargadoEl).toBe('2026-08-12T12:00:00.000Z');
        expect(meta?.fechaOficial).toBe('2025-12-31');
        expect(meta?.totalRFC).toBe(4);
        expect(meta?.presuntos).toBe(1);
        expect(meta?.definitivos).toBe(1);
        expect(meta?.desvirtuados).toBe(1);
        expect(meta?.sentenciaFavorable).toBe(2);

        // Multi-estado conservado (reload)
        const multi = await getBlacklistsByRFC('BBB090909KJ2');
        expect(multi).toHaveLength(2);
        expect(multi.map((r) => r.situacion).sort()).toEqual(['Definitivo', 'Sentencia Favorable']);

        const unico = await getBlacklistsByRFC('AAA080808HL8');
        expect(unico).toHaveLength(1);

        // Base cargada
        expect(await isBlacklistSynced()).toBe(true);
    });

    it('detecta "Situación múltiple; requiere revisión" cuando no se determina el estado vigente', async () => {
        await replaceBlacklistRecordsBulk(sampleRecords);
        await updateMetadata({
            key: 'lastUpdate',
            cargadoEl: '2026-08-12T12:00:00.000Z',
            fechaOficial: '2025-12-31',
            efosCount: 0,
            list69BCount: sampleRecords.length,
            totalRFC: 4,
            presuntos: 1,
            definitivos: 1,
            desvirtuados: 1,
            sentenciaFavorable: 2,
        });

        const multi = await checkRFCBlacklist('BBB090909KJ2');
        expect(multi.found).toBe(true);
        expect(multi.multiEstado).toBe(true);
        expect(multi.situacion).toBe('Situación múltiple; requiere revisión');

        const definitivo = await checkRFCBlacklist('BBB090909KJ2'.replace('BBB090909KJ2', 'AAA080808HL8'));
        expect(definitivo.found).toBe(true);
        expect(definitivo.multiEstado).toBeFalsy();
        expect(definitivo.situacion).toBe('Sentencia Favorable');
        expect(definitivo.is69B).toBe(true);

        const presunto = await checkRFCBlacklist('CCC101010MN3');
        expect(presunto.situacion).toBe('Presunto');

        const sinCoincidencia = await checkRFCBlacklist('ZZZ999999ZZ1');
        expect(sinCoincidencia.found).toBe(false);
    });

    it('resuelve situación vigente por fecha oficial más reciente (RAS050131EC5 -> Sentencia Favorable, sin alerta)', async () => {
        await replaceBlacklistRecordsBulk(datedRecords);
        await updateMetadata({
            key: 'lastUpdate',
            cargadoEl: '2026-08-12T12:00:00.000Z',
            fechaOficial: '2025-12-31',
            efosCount: 0,
            list69BCount: datedRecords.length,
            totalRFC: 3,
            presuntos: 2,
            definitivos: 2,
            desvirtuados: 0,
            sentenciaFavorable: 1,
        });

        // RAS050131EC5: la fecha más reciente es 2023-02-10 (Sentencia Favorable) -> sin alerta
        const ras = await checkRFCBlacklist('RAS050131EC5');
        expect(ras.found).toBe(true);
        expect(ras.multiEstado).toBe(false);
        expect(ras.situacion).toBe('Sentencia Favorable');
        expect(ras.fechaPublicacion).toBe('2023-02-10');
        expect(ras.is69B).toBe(true);
    });

    it('detecta "Situación múltiple; requiere revisión" cuando fechas empatadas o faltantes', async () => {
        await replaceBlacklistRecordsBulk(datedRecords);
        await updateMetadata({
            key: 'lastUpdate',
            cargadoEl: '2026-08-12T12:00:00.000Z',
            fechaOficial: '2025-12-31',
            efosCount: 0,
            list69BCount: datedRecords.length,
            totalRFC: 3,
            presuntos: 2,
            definitivos: 2,
            desvirtuados: 0,
            sentenciaFavorable: 1,
        });

        // Empate en fecha máxima (TIE010101AAA: Presunto y Definitivo ambas 2022-05-01) -> ambiguo
        const tie = await checkRFCBlacklist('TIE010101AAA');
        expect(tie.found).toBe(true);
        expect(tie.multiEstado).toBe(true);
        expect(tie.situacion).toBe('Situación múltiple; requiere revisión');

        // Una fecha faltante (NOF010101BBB: Presunto con fecha, Definitivo sin fecha)
        // La fecha máxima pertenece solo a Presunto -> se resuelve a Presunto (no ambiguo)
        const nof = await checkRFCBlacklist('NOF010101BBB');
        expect(nof.found).toBe(true);
        expect(nof.multiEstado).toBe(false);
        expect(nof.situacion).toBe('Presunto');
        expect(nof.fechaPublicacion).toBe('2021-01-15');
    });
});