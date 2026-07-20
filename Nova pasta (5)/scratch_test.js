const XLSX = require('xlsx');

// Create a workbook that mimics the user's data
const wb = XLSX.utils.book_new();

const ws_data = [
    ["Fluxo de Caixa", null, null, null, null, null],
    ["Data Pagto", "Parc", "Descrição", "SITUAÇÃO", "Despesas", "Receitas", "NEO", "amazon"],
    [45811, null, "Salário", null, "1.550,00", "1.550,00", null, null],
    [null, null, "mae", null, "2.955,48", "4.505,48", null, null],
    [null, null, "riachuelo", null, "(106,00)", "4.399,48", null, null],
    [null, null, "mercado pago", null, "1.919,00", "2.480,48", null, null],
    [null, null, "roupas", null, "(140,00)", "2.340,48", "84,98", "23,75"],
];

const ws = XLSX.utils.aoa_to_sheet(ws_data);
XLSX.utils.book_append_sheet(wb, ws, "despesas Junho 2026");

const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log("Raw rows:");
console.dir(rows);

let previewData = [];

for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    
    // Ignorar linhas vazias ou curtas demais
    if (!row || row.length < 5) {
        console.log(`Skipped row ${i} because length < 5. Length:`, row ? row.length : 'null');
        continue;
    }
    
    let dataCell = row[0]; // Col A (Data)
    let descCell = row[2]; // Col C (Descrição)
    let valCell = row[4];  // Col E (Despesas/Receitas)

    console.log(`Row ${i} Cells -> A:`, dataCell, `C:`, descCell, `E:`, valCell);

    // Se não tem descrição ou valor, pula (pode ser subtotal)
    if (!descCell || valCell === undefined || valCell === null || valCell === '') {
        console.log(`Skipped row ${i} because missing desc or val.`);
        continue;
    }

    if (String(descCell).toLowerCase().includes('total')) {
        console.log(`Skipped row ${i} because it's a total.`);
        continue;
    }
    
    previewData.push({descCell, valCell});
}

console.log("Found:", previewData.length);
