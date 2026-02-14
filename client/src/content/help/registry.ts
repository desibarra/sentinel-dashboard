export interface HelpCategory {
    id: string;
    title: string;
    icon: string;
    articles: HelpArticle[];
}

export interface HelpArticle {
    id: string;
    title: string;
    description: string;
    type: 'fiscal' | 'tecnico' | 'operativo' | 'legal';
    contentPath: string;
}

export const HELP_REGISTRY: HelpCategory[] = [
    {
        id: 'general',
        title: 'Introducción General',
        icon: 'Info',
        articles: [
            {
                id: 'que-es-sentinel',
                title: '¿Qué es Sentinel Express?',
                description: 'Visión general de la plataforma y su propósito.',
                type: 'operativo',
                contentPath: 'introduccion.md'
            },
            {
                id: 'flujo-general',
                title: 'Flujo General del Sistema',
                description: 'Cómo transitan los datos desde la carga hasta el reporte.',
                type: 'tecnico',
                contentPath: 'flujo-general.md'
            }
        ]
    },
    {
        id: 'guia-rapida',
        title: 'Guía Rápida (Quick Start)',
        icon: 'Zap',
        articles: [
            {
                id: 'guia-rapida',
                title: 'Guía Rápida',
                description: 'Aprende a usar Sentinel en 2 minutos.',
                type: 'operativo',
                contentPath: 'como-cargar-xml.md'
            },
            {
                id: 'flujo-diario',
                title: 'Flujo Diario Recomendado',
                description: 'Optimiza tu proceso contable hoy.',
                type: 'operativo',
                contentPath: 'flujo-diario.md'
            },
            {
                id: 'interpretacion-resultados',
                title: 'Interpretación de Resultados',
                description: 'Significado de los semáforos fiscales.',
                type: 'fiscal',
                contentPath: 'interpretacion-resultados.md'
            }
        ]
    },
    {
        id: 'modulos',
        title: 'Guía por Módulo',
        icon: 'Package',
        articles: [
            {
                id: 'modulo-cfdi',
                title: 'Módulo CFDI 4.0',
                description: 'Validaciones específicas de ingreso y egreso.',
                type: 'fiscal',
                contentPath: 'modulo-cfdi.md'
            },
            {
                id: 'modulo-nomina',
                title: 'Módulo de Nómina 1.2',
                description: 'Auditoría de recibos de pago de salarios.',
                type: 'fiscal',
                contentPath: 'modulo-nomina.md'
            },
            {
                id: 'modulo-carta-porte',
                title: 'Módulo Carta Porte 3.1',
                description: 'Validación de traslados y servicios de transporte.',
                type: 'legal',
                contentPath: 'modulo-carta-porte.md'
            }
        ]
    },
    {
        id: 'auditoria',
        title: 'Evidencia y Auditoría',
        icon: 'ShieldCheck',
        articles: [
            {
                id: 'excel-papel-trabajo',
                title: 'Excel como Papel de Trabajo',
                description: 'Uso del reporte para defensa fiscal.',
                type: 'legal',
                contentPath: 'excel-auditoria.md'
            },
            {
                id: 'buenas-practicas',
                title: 'Buenas Prácticas',
                description: 'Recomendaciones para un cumplimiento óptimo.',
                type: 'fiscal',
                contentPath: 'buenas-practicas.md'
            }
        ]
    },
    {
        id: 'recursos',
        title: 'Recursos Adicionales',
        icon: 'Library',
        articles: [
            {
                id: 'glosario-fiscal',
                title: 'Glosario Fiscal SAT',
                description: 'Términos clave para entender la facturación.',
                type: 'legal',
                contentPath: 'glosario.md'
            },
            {
                id: 'faq',
                title: 'Preguntas Frecuentes',
                description: 'Dudas comunes resueltas.',
                type: 'operativo',
                contentPath: 'faq.md'
            }
        ]
    }
];
