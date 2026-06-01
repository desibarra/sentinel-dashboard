const fs = require('fs');
let c = fs.readFileSync('client/src/pages/Dashboard.tsx', 'utf8');

if (!c.includes("import * as XLSX from 'xlsx';")) {
  c = c.replace('import { exportToExcel } from "@/lib/excelExporter";', 'import * as XLSX from \\'xlsx\\';\nimport { exportToExcel } from "@/lib/excelExporter";');
}

if (!c.includes("const [oneFactureData, setOneFactureData] = useState<string[]>([])")) {
  c = c.replace(/  const \[clasificados, setClasificados\] = useState<ValidationResultExtended\[\]>\(\[\]\);/g, 
  "  const [clasificados, setClasificados] = useState<ValidationResultExtended[]>([]);\n  const [oneFactureData, setOneFactureData] = useState<string[]>([]);\n  const [oneFactureFileName, setOneFactureFileName] = useState<string>('');");
}

if (!c.includes("const handleOneFactureUpload")) {
  const handler = 
  const handleOneFactureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOneFactureFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws);
      
      if (json.length === 0) {
        toast.error("El archivo de OneFacture está vacío.");
        return;
      }

      const keys = Object.keys(json[0]);
      let uuidKey = '';
      const targetHeaders = ['UUID', 'FOLIO FISCAL', 'FOLIOFISCAL', 'UUID CFDI', 'UUID_CFDI', 'TIMBRE UUID'];
      
      for (const k of keys) {
        const normK = k.replace(/[{}]/g, '').trim().toUpperCase();
        if (targetHeaders.includes(normK)) {
          uuidKey = k;
          break;
        }
      }

      if (!uuidKey) {
        toast.error("No se encontró la columna UUID en el archivo OneFacture.");
        return;
      }

      const extractedUUIDs: string[] = [];
      json.forEach(row => {
        if (row[uuidKey]) {
          extractedUUIDs.push(String(row[uuidKey]));
        }
      });

      setOneFactureData(extractedUUIDs);
      toast.success(\Excel OneFacture cargado: \ filas procesadas.\);
    } catch (error) {
      console.error(error);
      toast.error("Error leyendo el archivo OneFacture.");
    }
  };

  const handleExportToExcel = () => {;
  c = c.replace('  const handleExportToExcel = () => {', handler);
}

c = c.replace('exportToExcel(clasificados);', 'exportToExcel(clasificados, undefined, oneFactureData);');

const uiReplacement = <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    id="onefacture-upload"
                    onChange={handleOneFactureUpload}
                  />
                  <label
                    htmlFor="onefacture-upload"
                    className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3 rounded-md"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Cargar OneFacture
                  </label>
                  {oneFactureFileName && (
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={oneFactureFileName}>
                      {oneFactureFileName}
                    </span>
                  )}
                </div>
              <Button;

c = c.replace(/              <Button[^>]*onClick={handleExportToExcel}/g, uiReplacement + "\n                onClick={handleExportToExcel}");

fs.writeFileSync('client/src/pages/Dashboard.tsx', c, 'utf8');
