import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export const startMainTour = () => {
    const driverObj = driver({
        showProgress: true,
        steps: [
            {
                element: '#company-selector',
                popover: {
                    title: 'Selección de Empresa',
                    description: 'Comienza seleccionando o dando de alta la razón social que vas a auditar hoy.',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '#upload-zone',
                popover: {
                    title: 'Carga de XML',
                    description: 'Arrastra aquí tus archivos XML. Sentinel procesará miles en segundos sin enviarlos a la nube.',
                    side: "bottom",
                    align: 'center'
                }
            },
            {
                element: '#stats-cards',
                popover: {
                    title: 'Resultados Rápidos',
                    description: 'Aquí verás el resumen de usabilidad: cuántas facturas son deducibles y cuáles tienen riesgos.',
                    side: "bottom",
                    align: 'center'
                }
            },
            {
                element: '#export-excel',
                popover: {
                    title: 'Evidencia de Auditoría',
                    description: 'Genera tu papel de trabajo en Excel con 53 columnas de diagnóstico detallado.',
                    side: "left",
                    align: 'center'
                }
            },
            {
                element: '#help-center-btn',
                popover: {
                    title: 'Manual Integrado',
                    description: 'Si tienes dudas fiscales o técnicas, consulta nuestro Manual del Sistema aquí mismo.',
                    side: "bottom",
                    align: 'end'
                }
            },
        ]
    });

    driverObj.drive();
};
