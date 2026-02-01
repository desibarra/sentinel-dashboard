
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UploadZone, { UploadedFile } from "@/components/UploadZone";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { FileText, Download, Trash2, Sun, Moon, DollarSign, CheckCircle2, AlertCircle, XCircle, ArrowUpDown, ArrowUp, ArrowDown, Code, Copy } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
    getSortedRowModel,
    getFilteredRowModel,
    SortingState,
    ColumnFiltersState,
} from "@tanstack/react-table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const formatXML = (xml: string) => {
    let formatted = '';
    let pad = 0;
    const tokens = xml.split(/>\s*</);
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (i !== 0) token = '<' + token;
        if (i !== tokens.length - 1) token = token + '>';
        let indent = 0;
        if (token.match(/^<\/\w/)) {
            if (pad !== 0) pad -= 1;
        } else if (token.match(/^<\w[^>]*[^\/]>.*$/)) {
            indent = 1;
        } else {
            indent = 0;
        }
        const padding = '  '.repeat(pad);
        formatted += padding + token + '\n';
        pad += indent;
    }
    return formatted.trim();
};

// Interfaces for our specific Audit logic
interface PaymentRelation {
    idDocumento: string; // UUID of the related invoice
    monedaDR: string;
    metodoDePagoDR: string;
    numParcialidad: string;
    impSaldoAnt: number;
    impPagado: number;
    impSaldoInsoluto: number;
    serie?: string;
    folio?: string;
    // New fields for auditing
    fechaPago?: string; // Date of the payment complement
    uuidPago?: string; // UUID of the payment complement
}

interface PaymentDoc {
    uuid: string;
    fecha: string;
    moneda: string;
    montoTotal: number;
    relacionados: PaymentRelation[];
    xmlContent: string;
    fileName: string;
}

interface InvoiceDoc {
    uuid: string;
    serie: string;
    folio: string;
    fecha: string;
    moneda: string;
    total: number;
    metodoPago: string; // PUE vs PPD
    xmlContent: string;
    fileName: string;
    receptorNombre: string;
    receptorRFC: string;

    // Calculated fields
    pagosRelacionados: PaymentRelation[];
    saldoCalculado: number;
    montoPagadoCalculado: number; // Sum of impPagado from related documents
    estadoPago: "Pagado" | "Parcial" | "Pendiente";
}

export default function PaymentAudit() {
    const { theme, toggleTheme } = useTheme();
    const [invoices, setInvoices] = useState<InvoiceDoc[]>([]);
    const [payments, setPayments] = useState<PaymentDoc[]>([]);
    const [loading, setLoading] = useState(false);
    const [processedCount, setProcessedCount] = useState({ current: 0, total: 0 });
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [viewXml, setViewXml] = useState<{ content: string, name: string } | null>(null);

    // Custom parser for audit needs
    const parseFiles = async (files: UploadedFile[]) => {
        setLoading(true);
        setProcessedCount({ current: 0, total: files.length });

        const newInvoices: InvoiceDoc[] = [];
        const newPayments: PaymentDoc[] = [];
        const processedUUIDs = new Set<string>(); // Check duplicates in current batch

        // Add existing UUIDs to the set to avoid re-adding duplicates if re-uploaded or cross-checked
        invoices.forEach(inv => processedUUIDs.add(inv.uuid.toLowerCase()));
        payments.forEach(pay => processedUUIDs.add(pay.uuid.toLowerCase()));

        const parser = new DOMParser();

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.content) continue;

            try {
                const xmlDoc = parser.parseFromString(file.content, "text/xml");
                // check errors
                if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
                    console.error("Error XML mal formado:", file.name);
                    continue;
                }
                const comprobante = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0] || xmlDoc.getElementsByTagName("Comprobante")[0];

                if (!comprobante) {
                    console.warn("No se encontró nodo Comprobante en:", file.name);
                    continue;
                }

                // Get UUID early for duplicate check
                const timbre = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
                const uuid = timbre?.getAttribute("UUID")?.toUpperCase() || "";

                if (!uuid || processedUUIDs.has(uuid)) {
                    // Duplicate in batch, skip
                    continue;
                }

                // Check against existing UUIDs (simple check)
                if (invoices.some(inv => inv.uuid === uuid) || payments.some(pay => pay.uuid === uuid)) {
                    // Already loaded
                    continue;
                }

                processedUUIDs.add(uuid);

                const tipoDeComprobante = comprobante.getAttribute("TipoDeComprobante");
                console.log(`Procesando ${file.name}: Tipo=${tipoDeComprobante}, UUID=${uuid}`);
                const fecha = comprobante.getAttribute("Fecha") || "";
                const serie = comprobante.getAttribute("Serie") || "";
                const folio = comprobante.getAttribute("Folio") || "";
                const moneda = comprobante.getAttribute("Moneda") || "MXN";
                const total = parseFloat(comprobante.getAttribute("Total") || "0");

                if (tipoDeComprobante === "I" || tipoDeComprobante === "E") {
                    if (tipoDeComprobante === "I") {
                        // Extract receptor information
                        const receptorNode = xmlDoc.getElementsByTagName("cfdi:Receptor")[0] || xmlDoc.getElementsByTagName("Receptor")[0];
                        const receptorNombre = receptorNode?.getAttribute("Nombre") || "";
                        const receptorRFC = receptorNode?.getAttribute("Rfc") || "";

                        newInvoices.push({
                            uuid,
                            serie,
                            folio,
                            fecha,
                            moneda,
                            total,
                            metodoPago: comprobante.getAttribute("MetodoPago") || "",
                            xmlContent: file.content,
                            fileName: file.name,
                            receptorNombre,
                            receptorRFC,
                            pagosRelacionados: [],
                            saldoCalculado: total,
                            montoPagadoCalculado: 0,
                            estadoPago: "Pendiente"
                        });
                    }
                } else if (tipoDeComprobante === "P") {
                    // Payment Complement
                    const pagosNode = xmlDoc.getElementsByTagName("pago10:Pagos")[0] || xmlDoc.getElementsByTagName("pago20:Pagos")[0] || xmlDoc.getElementsByTagName("Pagos")[0];

                    if (pagosNode) {
                        const pagos = pagosNode.getElementsByTagName("pago10:Pago");
                        const pagos20 = pagosNode.getElementsByTagName("pago20:Pago");
                        const genericPagos = pagosNode.getElementsByTagName("Pago");

                        const allPagoNodes = [...Array.from(pagos), ...Array.from(pagos20), ...Array.from(genericPagos)];
                        const paymentRelations: PaymentRelation[] = [];
                        let montoTotalPago = 0;

                        for (const pago of allPagoNodes) {
                            montoTotalPago += parseFloat(pago.getAttribute("Monto") || "0");
                            const fechaPago = pago.getAttribute("FechaPago") || fecha;

                            const doctos = pago.getElementsByTagName("pago10:DoctoRelacionado");
                            const doctos20 = pago.getElementsByTagName("pago20:DoctoRelacionado");
                            const doctosGeneric = pago.getElementsByTagName("DoctoRelacionado");
                            const allDoctos = [...Array.from(doctos), ...Array.from(doctos20), ...Array.from(doctosGeneric)];

                            for (const doc of allDoctos) {
                                paymentRelations.push({
                                    idDocumento: (doc.getAttribute("IdDocumento") || "").toUpperCase(),
                                    monedaDR: doc.getAttribute("MonedaDR") || "",
                                    metodoDePagoDR: doc.getAttribute("MetodoDePagoDR") || "",
                                    numParcialidad: doc.getAttribute("NumParcialidad") || "",
                                    impSaldoAnt: parseFloat(doc.getAttribute("ImpSaldoAnt") || "0"),
                                    impPagado: parseFloat(doc.getAttribute("ImpPagado") || "0"),
                                    impSaldoInsoluto: parseFloat(doc.getAttribute("ImpSaldoInsoluto") || "0"),
                                    serie: doc.getAttribute("Serie") || "",
                                    folio: doc.getAttribute("Folio") || "",
                                    fechaPago: fechaPago,
                                    uuidPago: uuid
                                });
                            }
                        }

                        newPayments.push({
                            uuid,
                            fecha,
                            moneda,
                            montoTotal: montoTotalPago,
                            relacionados: paymentRelations,
                            xmlContent: file.content,
                            fileName: file.name
                        });
                    }
                } else {
                    console.warn(`Tipo de comprobante no manejado (${tipoDeComprobante}) en: ${file.name}`);
                }
            } catch (e) {
                console.error("Error parsing file " + file.name, e);
            }

            setProcessedCount({ current: i + 1, total: files.length });
        }

        // MATCHING LOGIC (Using strict ImpSaldoInsoluto logic when possible)
        const combinedInvoices = [...invoices, ...newInvoices];
        const combinedPayments = [...payments, ...newPayments];

        // Reset state
        const processedInvoices = combinedInvoices.map(inv => ({
            ...inv,
            pagosRelacionados: [] as PaymentRelation[],
            saldoCalculado: inv.total,
            montoPagadoCalculado: 0,
            estadoPago: "Pendiente" as "Pendiente" | "Pagado" | "Parcial"
        }));

        // Flatten all payment relations from all loaded payments
        const allRelations: PaymentRelation[] = [];
        combinedPayments.forEach(pay => {
            allRelations.push(...pay.relacionados);
        });

        // Assign relations to invoices
        processedInvoices.forEach(inv => {
            // Find all payments related to this invoice
            const relations = allRelations.filter(rel => rel.idDocumento === inv.uuid);

            // Sort by Date (descending) to find the LATEST payment
            // If dates are equal (same day), assume newer implies less balance? Or sort by ImpSaldoInsoluto ascending (safer)
            relations.sort((a, b) => {
                const dateA = new Date(a.fechaPago || "");
                const dateB = new Date(b.fechaPago || "");
                if (dateA.getTime() !== dateB.getTime()) {
                    return dateB.getTime() - dateA.getTime(); // Newest first
                }
                // If same date, the one with lower ImpSaldoInsoluto is likely the later one
                return a.impSaldoInsoluto - b.impSaldoInsoluto;
            });

            inv.pagosRelacionados = relations;

            // Sum of payments evidence loaded in this session
            const totalPaidEvidence = relations.reduce((acc, curr) => acc + curr.impPagado, 0);
            inv.montoPagadoCalculado = totalPaidEvidence;

            // Balance Logic:
            // If we have payments, the "Real Balance" is the ImpSaldoInsoluto of the LATEST payment.
            // Why? Because historical payments might be missing from the load, but the latest XML tells the truth about the balance at that moment.
            if (relations.length > 0) {
                // Latest payment is index 0 after sort
                inv.saldoCalculado = relations[0].impSaldoInsoluto;
            } else {
                // No payments loaded -> Balance is Total
                inv.saldoCalculado = inv.total;
            }

            // Status Logic
            if (inv.saldoCalculado <= 0.10) { // Tolerance
                inv.estadoPago = "Pagado";
                inv.saldoCalculado = 0;
            } else if (inv.saldoCalculado < inv.total - 0.10) {
                // If existing balance is significantly less than total
                inv.estadoPago = "Parcial";
            } else {
                inv.estadoPago = "Pendiente";
            }
        });

        setInvoices(processedInvoices);
        setPayments(combinedPayments);
        setLoading(false);

        console.log("Resumen Final:", {
            nuevasFacturas: newInvoices.length,
            nuevosPagos: newPayments.length,
            totalFacturas: processedInvoices.length,
            totalPagos: combinedPayments.length
        });

        if (newInvoices.length === 0 && newPayments.length > 0 && invoices.length === 0) {
            toast.warning(`Se cargaron ${newPayments.length} pagos pero 0 facturas. Recuerda cargar los XMLs de las facturas (Tipo I) para ver la conciliación.`);
        } else {
            toast.success(`Procesados: ${newInvoices.length} Facturas, ${newPayments.length} Pagos`);
        }
    };

    const handleClearData = () => {
        if (confirm("¿Limpiar todos los datos?")) {
            setInvoices([]);
            setPayments([]);
        }
    };

    const handleExportExcel = () => {
        const data = invoices.map(inv => ({
            "UUID Factura": inv.uuid,
            "Serie": inv.serie,
            "Folio": inv.folio,
            "Fecha Emisión": inv.fecha,
            "Cliente (Receptor)": inv.receptorNombre,
            "RFC Cliente": inv.receptorRFC,
            "Moneda": inv.moneda,
            "Total Factura": inv.total,
            "Método Pago": inv.metodoPago,
            "Estado Pago": inv.estadoPago,
            "Saldo Pendiente (S. Insoluto)": inv.saldoCalculado,
            "Monto Pagado (Evidencia)": inv.montoPagadoCalculado,
            "Pagos Relacionados": inv.pagosRelacionados.map(p => `$${p.impPagado} (${p.numParcialidad})`).join(", "),
            "UUIDs Complementos Pago": inv.pagosRelacionados.map(p => p.uuidPago).filter(Boolean).join(", "),
            "Ultima Fecha Pago": inv.pagosRelacionados.length > 0 ? (inv.pagosRelacionados[0].fechaPago || "") : ""
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Auditoría Pagos");
        XLSX.writeFile(wb, "Reporte_Auditoria_Pagos.xlsx");
        toast.success("Excel generado exitosamente");
    };

    const handleExportCSV = () => {
        // Simple CSV export
        const headers = ['UUID Factura', 'Folio', 'Total', 'Monto Pagado', 'Saldo Pendiente', 'Estado'];
        const rows = invoices.map(f => [
            f.uuid,
            `${f.serie}${f.folio}`,
            f.total.toFixed(2),
            f.montoPagadoCalculado.toFixed(2),
            f.saldoCalculado.toFixed(2),
            f.estadoPago
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `auditoria_pagos_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("CSV generado exitosamente");
    };

    // Stats

    const totalFacturado = invoices.reduce((acc, curr) => acc + curr.total, 0);
    const totalPendiente = invoices.reduce((acc, curr) => acc + curr.saldoCalculado, 0);
    const totalAmortizado = totalFacturado - totalPendiente;

    const columnHelper = createColumnHelper<InvoiceDoc>();

    const columns = [
        columnHelper.accessor("uuid", {
            header: "UUID",
            cell: (info) => (
                <span className="font-mono text-xs block max-w-[150px] truncate" title={info.getValue()}>
                    {info.getValue()}
                </span>
            ),
            size: 150,
        }),
        columnHelper.accessor((row) => `${row.serie}${row.folio}`, {
            id: "folio",
            header: "Folio",
            cell: (info) => info.getValue(),
            size: 100,
        }),
        columnHelper.accessor("fecha", {
            header: "Fecha",
            cell: (info) => {
                const fecha = info.getValue();
                if (!fecha) return "N/A";
                const date = new Date(fecha);
                return date.toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                });
            },
            size: 110,
            enableColumnFilter: true,
        }),
        columnHelper.accessor("receptorNombre", {
            header: "Cliente",
            cell: (info) => (
                <span className="text-slate-900 dark:text-white text-xs block max-w-[200px] truncate" title={info.getValue()}>
                    {info.getValue() || "N/A"}
                </span>
            ),
            size: 200,
            enableColumnFilter: true,
        }),
        columnHelper.accessor("total", {
            header: "Total",
            cell: (info) => <span className="font-bold text-slate-900 dark:text-white">${info.getValue().toFixed(2)}</span>,
            size: 100,
        }),
        columnHelper.accessor((row) => row.total - row.saldoCalculado, {
            id: "amortizado",
            header: "Amortizado",
            cell: (info) => <span className="text-green-600">${info.getValue().toFixed(2)}</span>,
            size: 100,
        }),
        columnHelper.accessor("saldoCalculado", {
            header: "Saldo",
            cell: (info) => <span className="text-red-600">${info.getValue().toFixed(2)}</span>,
            size: 100,
        }),
        columnHelper.accessor("estadoPago", {
            header: "Estado",
            cell: (info) => {
                const val = info.getValue();
                if (val === "Pagado") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Pagado</Badge>;
                if (val === "Parcial") return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Parcial</Badge>;
                return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Pendiente</Badge>;
            },
            size: 100,
        }),
        columnHelper.accessor("pagosRelacionados", {
            header: "Pagos (Evidencia)",
            cell: (info) => {
                const pagos = info.getValue();
                if (pagos.length === 0) return <span className="text-slate-400 text-xs">Sin evidencia</span>;
                return (
                    <ul className="list-disc pl-4 text-xs">
                        {pagos.map((p, idx) => (
                            <li key={idx}>
                                ${p.impPagado.toFixed(2)} (Parc. {p.numParcialidad}) - {p.fechaPago}
                            </li>
                        ))}
                    </ul>
                );
            },
            size: 250,
        }),
        columnHelper.display({
            id: 'actions',
            header: 'Acciones',
            cell: (info) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewXml({
                        content: info.row.original.xmlContent,
                        name: info.row.original.fileName
                    })}
                    className="h-8 w-8 p-0"
                    title="Ver XML"
                >
                    <Code className="w-4 h-4 text-slate-500 hover:text-blue-600" />
                </Button>
            ),
            size: 80,
            enableSorting: false,
        }),
    ];

    const table = useReactTable({
        data: invoices,
        columns,
        state: {
            sorting,
            columnFilters,
        },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getCoreRowModel: getCoreRowModel(),
        columnResizeMode: "onChange",
        defaultColumn: {
            size: 150, // default column size
            minSize: 50,
            maxSize: 500,
        },
    });

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8 transition-colors duration-200">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Auditoría de Pagos</h1>
                        <p className="text-slate-600 dark:text-slate-400">Cruce automático de Facturas vs Complementos de Pago</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/">
                            <Button variant="outline" size="icon" title="Volver al Dashboard">
                                <FileText className="w-4 h-4" />
                            </Button>
                        </Link>
                        <Button onClick={toggleTheme} variant="outline" size="icon">
                            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </Button>
                        {invoices.length > 0 && (
                            <>
                                <Button onClick={handleClearData} variant="destructive">
                                    <Trash2 className="w-4 h-4 mr-2" /> Limpiar
                                </Button>
                                <Button onClick={handleExportExcel}>
                                    <Download className="w-4 h-4 mr-2" /> Excel
                                </Button>
                                <Button onClick={handleExportCSV} variant="outline">
                                    <FileText className="w-4 h-4 mr-2" /> CSV
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Upload */}
                <div className="mb-8">
                    <UploadZone
                        onFilesReady={parseFiles}
                        isValidating={loading}
                        hasValidatedResults={invoices.length > 0}
                    />
                    {loading && (
                        <div className="text-center mt-2 text-sm text-slate-500">
                            Procesando {processedCount.current} de {processedCount.total}...
                        </div>
                    )}
                </div>

                {/* Stats */}
                {invoices.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <Card className="dark:bg-slate-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Total Facturas</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{invoices.length}</div>
                                <p className="text-xs text-slate-500">Documentos Tipo I</p>
                            </CardContent>
                        </Card>
                        <Card className="dark:bg-slate-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Total Facturado</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">${totalFacturado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                            </CardContent>
                        </Card>
                        <Card className="dark:bg-slate-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Amortizado (SAT)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">${totalAmortizado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                                <p className="text-xs text-slate-500">Según Saldos Insolutos</p>
                            </CardContent>
                        </Card>
                        <Card className="dark:bg-slate-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Saldo Pendiente</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">${totalPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Tables */}
                {invoices.length > 0 && (
                    <Card className="dark:bg-slate-800">
                        <CardHeader>
                            <CardTitle>Detalle de Conciliación</CardTitle>
                            <CardDescription>Comparativa Facturas vs Pagos detectados</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table
                                    className="w-full text-sm text-left"
                                    style={{ width: table.getTotalSize() }}
                                >
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                                        {table.getHeaderGroups().map((headerGroup) => (
                                            <tr key={headerGroup.id}>
                                                {headerGroup.headers.map((header) => {
                                                    const canSort = header.column.getCanSort();
                                                    return (
                                                        <th
                                                            key={header.id}
                                                            className="px-6 py-3 relative group select-none"
                                                            style={{ width: header.getSize() }}
                                                        >
                                                            <div
                                                                className={`flex items-center gap-2 ${canSort ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400' : ''}`}
                                                                onClick={header.column.getToggleSortingHandler()}
                                                            >
                                                                {header.isPlaceholder
                                                                    ? null
                                                                    : flexRender(
                                                                        header.column.columnDef.header,
                                                                        header.getContext()
                                                                    )}
                                                                {canSort && (
                                                                    <div className="w-4 h-4">
                                                                        {{
                                                                            asc: <ArrowUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
                                                                            desc: <ArrowDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
                                                                        }[header.column.getIsSorted() as string] ?? (
                                                                                <ArrowUpDown className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" />
                                                                            )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div
                                                                onMouseDown={header.getResizeHandler()}
                                                                onTouchStart={header.getResizeHandler()}
                                                                className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity ${header.column.getIsResizing()
                                                                    ? "bg-blue-500 opacity-100"
                                                                    : ""
                                                                    }`}
                                                                style={{
                                                                    transform: header.column.getIsResizing() ? `translateX(${table.getState().columnSizingInfo.deltaOffset}px)` : '',
                                                                }}
                                                            />
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                        {/* Filter Row */}
                                        {table.getHeaderGroups().map((headerGroup) => (
                                            <tr key={`filter-${headerGroup.id}`}>
                                                {headerGroup.headers.map((header) => (
                                                    <th key={header.id} className="px-2 py-2">
                                                        {header.column.getCanFilter() ? (
                                                            <Input
                                                                type="text"
                                                                value={(header.column.getFilterValue() ?? '') as string}
                                                                onChange={(e) => header.column.setFilterValue(e.target.value)}
                                                                placeholder={`Filtrar...`}
                                                                className="h-8 text-xs"
                                                            />
                                                        ) : null}
                                                    </th>
                                                ))}
                                            </tr>
                                        ))}
                                    </thead>
                                    <tbody>
                                        {table.getRowModel().rows.map((row) => (
                                            <tr
                                                key={row.id}
                                                className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                                            >
                                                {row.getVisibleCells().map((cell) => (
                                                    <td
                                                        key={cell.id}
                                                        className="px-6 py-4"
                                                        style={{ width: cell.column.getSize() }}
                                                    >
                                                        {flexRender(
                                                            cell.column.columnDef.cell,
                                                            cell.getContext()
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* XML Viewer Modal */}
            <Dialog open={!!viewXml} onOpenChange={(open) => !open && setViewXml(null)}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col gap-0 p-0">
                    <DialogHeader className="p-6 pb-2 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-t-lg">
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Visor XML
                        </DialogTitle>
                        <DialogDescription className="font-mono text-xs text-slate-500 truncate max-w-xl">
                            {viewXml?.name}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden bg-[#1e1e1e] relative">
                        <ScrollArea className="h-full w-full">
                            <pre className="p-4 text-xs font-mono text-gray-300 leading-relaxed tab-4">
                                <code>{viewXml ? formatXML(viewXml.content) : ''}</code>
                            </pre>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </div>

                    <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-lg flex justify-between items-center">
                        <div className="text-xs text-slate-500">
                            {viewXml ? (viewXml.content.length / 1024).toFixed(2) : 0} KB
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (viewXml) {
                                        navigator.clipboard.writeText(viewXml.content);
                                        toast.success("XML copiado al portapapeles");
                                    }
                                }}
                            >
                                <Copy className="w-4 h-4 mr-2" /> Copiar
                            </Button>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                    if (viewXml) {
                                        const blob = new Blob([viewXml.content], { type: "text/xml" });
                                        const url = URL.createObjectURL(blob);
                                        const link = document.createElement("a");
                                        link.href = url;
                                        link.download = viewXml.name || "comprobante.xml";
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    }
                                }}
                            >
                                <Download className="w-4 h-4 mr-2" /> Descargar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
