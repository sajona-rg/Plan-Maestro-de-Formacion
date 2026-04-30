const fs = require('fs');
const path = require('path');

const PILARS = ['seguridad', 'gente', 'flota', 'gestion', 'reparto'];
const dataDir = path.join(__dirname, '..', 'data');

console.log('--- HOLISTIC DATA AUDIT ---');

const allData = [];
const stats = {};

PILARS.forEach(p => {
    const filePath = path.join(dataDir, `${p}.json`);
    if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        stats[p] = {
            total: data.length,
            modules: [...new Set(data.map(d => d.modulo))].length,
            regionals: [...new Set(data.map(d => d.regional))].length,
            cds: [...new Set(data.map(d => d.cd))].length,
            missingIdent: data.filter(d => !d.identificacion).length
        };
        allData.push(...data.map(d => ({ ...d, pilarSource: p })));
    } else {
        console.error(`Missing file: ${p}.json`);
    }
});

console.table(stats);

// Check overlap
const modulePillars = {};
allData.forEach(d => {
    if (!modulePillars[d.modulo]) modulePillars[d.modulo] = new Set();
    modulePillars[d.modulo].add(d.pilarSource);
});

const overlappingModules = Object.keys(modulePillars).filter(m => modulePillars[m].size > 1);
if (overlappingModules.length > 0) {
    console.warn('\n[!] Modules present in multiple pillars:');
    overlappingModules.forEach(m => {
        console.log(` - ${m}: [${Array.from(modulePillars[m]).join(', ')}]`);
    });
} else {
    console.log('\n[✓] No module name overlaps found across pillars.');
}

// Check Regionals
const allRegs = [...new Set(allData.map(d => d.regional))];
console.log('\nAll Regionals found:', allRegs.join(', '));

// Check CDs
const allCDs = [...new Set(allData.filter(d => d.cd && d.cd !== 'No Asignado').map(d => d.cd))];
console.log('Total Unique CDs:', allCDs.length);

// Deduplication simulation
const deduplicated = {};
allData.forEach(d => {
    const key = `${d.identificacion || d.nombre}_${d.modulo}`;
    if (!deduplicated[key] || d.nota > deduplicated[key].nota) {
        deduplicated[key] = d;
    }
});

const dedupCount = Object.values(deduplicated).length;
console.log(`\nConsolidated Audit:`);
console.log(`- Total Records (raw): ${allData.length}`);
console.log(`- Total Records (deduplicated): ${dedupCount}`);
console.log(`- Data Loss (duplicates): ${allData.length - dedupCount} (${((allData.length - dedupCount)/allData.length*100).toFixed(1)}%)`);

if (allData.length === dedupCount) {
    console.log('[✓] Clean merge: No duplicates across pillars.');
} else {
    console.log('[i] Normal deduplication: Some workers repeated modules or appear in multiple pillars.');
}
