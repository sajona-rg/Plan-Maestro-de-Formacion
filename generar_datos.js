import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const actPath = process.cwd();
const publicDataPath = path.join(actPath, 'public', 'data');

if (!fs.existsSync(publicDataPath)) {
    fs.mkdirSync(publicDataPath, { recursive: true });
}

// ===== CONFIGURACIÓN =====
const REGIONALES = ['Andes', 'Norte', 'Centro', 'Sur'];
const DEMOGRAPHIC_KEYS = [
    'ID', 'Hora de inicio', 'Hora de finalización', 'Correo electrónico',
    'Nombre', 'Total de puntos', 'Comentarios del cuestionario',
    'Hora de la última modificación', '¿A qué regional pertenece?',
    'Andes', 'Norte', 'Centro', 'Sur',
    'Tipo de entrenamiento', 'Primer nombre y apellido',
    'Identificación', 'QR Safety 360'
];

// Palabras clave para excluir preguntas no-evaluativas (encuestas de satisfacción)
const SATISFACTION_KEYWORDS = [
    'satisfecho', 'satisfacción', 'satisfaccion',
    'entrenamiento recibido', 'entrenador, material'
];

function isSatisfactionQuestion(questionText) {
    const lower = questionText.toLowerCase();
    return SATISFACTION_KEYWORDS.some(kw => lower.includes(kw));
}

function isDemographic(key) {
    const lower = key.toLowerCase();
    return DEMOGRAPHIC_KEYS.some(dk => dk.toLowerCase() === lower)
        || lower.includes('cargo')
        || lower.includes('operador');
}

function isQuestion(key) {
    return !isDemographic(key)
        && !key.startsWith('Puntos:')
        && !key.startsWith('Comentarios:');
}

/**
 * Determina si una pregunta es evaluativa (tiene puntaje asignado en al menos
 * una fila del dataset). Las preguntas donde "Puntos: X" es null para TODAS
 * las filas son preguntas de encuesta, NO evaluativas.
 */
function findGradedQuestions(rows, questionKeys) {
    const graded = new Set();
    for (const q of questionKeys) {
        const puntosKey = `Puntos: ${q}`;
        // Es evaluativa si al menos una fila tiene un valor numérico (incluido 0)
        const hasNumericPuntos = rows.some(r => typeof r[puntosKey] === 'number');
        if (hasNumericPuntos) {
            graded.add(q);
        }
    }
    return graded;
}

/**
 * Deduplica filas por Identificación dentro de un módulo,
 * quedándose con la entrada más reciente (último ID o última hora).
 */
function deduplicateRows(rows) {
    const byIdent = {};
    rows.forEach(row => {
        const ident = row['Identificación'];
        if (!ident || ident === null) {
            // Sin identificación → no se puede deduplicar, se mantiene
            const tempKey = `__noident_${row['ID']}`;
            byIdent[tempKey] = row;
            return;
        }
        const identStr = ident.toString().trim();
        if (!byIdent[identStr]) {
            byIdent[identStr] = row;
        } else {
            // Quedarse con el ID más alto (más reciente)
            const existingID = parseInt(byIdent[identStr]['ID']) || 0;
            const currentID = parseInt(row['ID']) || 0;
            if (currentID > existingID) {
                byIdent[identStr] = row;
            }
        }
    });
    return Object.values(byIdent);
}

try {
    const pillars = fs.readdirSync(actPath).filter(f =>
        fs.statSync(path.join(actPath, f)).isDirectory() && f.includes('pilar')
    );

    for (const pillar of pillars) {
        console.log(`\n=== Procesando Pilar: ${pillar} ===`);
        const pillarPath = path.join(actPath, pillar);
        const files = fs.readdirSync(pillarPath).filter(f => f.endsWith('.xlsx'));

        const pillarData = [];

        for (const file of files) {
            const moduloName = file.replace('.xlsx', '').replace(/\s*\(\d+\)\s*$/, '').trim();
            console.log(`\nLeyendo: ${file}`);
            const filePath = path.join(pillarPath, file);

            try {
                const workbook = xlsx.readFile(filePath);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const allRows = xlsx.utils.sheet_to_json(sheet, { defval: null });

                console.log(`  Filas totales en Excel: ${allRows.length}`);

                // Deduplicar por Identificación
                const rows = deduplicateRows(allRows);
                console.log(`  Filas únicas (deduplicadas): ${rows.length}`);

                // Detectar las columnas que son preguntas
                const allKeys = Object.keys(allRows[0] || {});
                const questionKeys = allKeys.filter(isQuestion);

                // Filtrar: solo preguntas evaluativas (que tengan puntaje numérico)
                // y que NO sean de satisfacción
                const gradedSet = findGradedQuestions(allRows, questionKeys);
                const evaluativeQuestions = questionKeys.filter(q =>
                    gradedSet.has(q) && !isSatisfactionQuestion(q)
                );

                const satisfactionQs = questionKeys.filter(q => isSatisfactionQuestion(q));
                const nonGradedQs = questionKeys.filter(q => !gradedSet.has(q) && !isSatisfactionQuestion(q));

                console.log(`  Preguntas evaluativas: ${evaluativeQuestions.length}`);
                if (satisfactionQs.length > 0)
                    console.log(`  Preguntas de satisfacción (excluidas): ${satisfactionQs.length}`);
                if (nonGradedQs.length > 0)
                    console.log(`  Preguntas sin puntaje (excluidas): ${nonGradedQs.length}`);

                rows.forEach(row => {
                    const totalPuntos = row['Total de puntos'];
                    const nota = parseFloat(totalPuntos) || 0;
                    const aprobado = nota >= 80;

                    const regional = row['¿A qué regional pertenece?'] || 'Sin Regional';

                    let cd = 'No Asignado';
                    if (regional !== 'Sin Regional' && row[regional]) {
                        cd = row[regional];
                    }

                    let cargo = 'No Especificado';
                    const cargoKeys = allKeys.filter(k => {
                        const lower = k.toLowerCase();
                        return lower.includes('cargo')
                            && !lower.startsWith('puntos:')
                            && !lower.startsWith('comentarios:');
                    });
                    for (const ck of cargoKeys) {
                        if (row[ck] !== null && row[ck] !== undefined) {
                            cargo = row[ck].toString().trim();
                            break;
                        }
                    }

                    const nombreRaw = row['Primer nombre y apellido'] || row['Nombre'] || 'Usuario Anónimo';
                    const nombre = nombreRaw.toString().trim();
                    const correo = (row['Correo electrónico'] || 'sin-correo@lis.com').toString().trim();
                    const identificacion = (row['Identificación'] || row['ID'] || '').toString().trim();

                    // Analizar solo preguntas evaluativas
                    const preguntas_totales = [];
                    const preguntas_falladas = [];

                    evaluativeQuestions.forEach(q => {
                        preguntas_totales.push(q);
                        const puntosKey = `Puntos: ${q}`;
                        const puntos = row[puntosKey];
                        // Falló si los puntos son exactamente 0
                        if (puntos === 0 || puntos === '0') {
                            preguntas_falladas.push(q);
                        }
                    });
                    let satisfaccion = null;
                    if (satisfactionQs.length > 0) {
                        // Tomamos la primera pregunta de satisfacción encontrada
                        const val = row[satisfactionQs[0]];
                        if (val !== null && val !== undefined && val !== '') {
                            const parsed = parseFloat(val);
                            if (!isNaN(parsed)) {
                                satisfaccion = parsed;
                            }
                        }
                    }

                    pillarData.push({
                        modulo: moduloName,
                        regional,
                        cd,
                        cargo,
                        nombre,
                        correo,
                        identificacion,
                        nota,
                        satisfaccion,
                        aprobado,
                        preguntas_falladas,
                        preguntas_totales
                    });
                });
            } catch (err) {
                console.error(`  ❌ Error: ${err.message}`);
            }
        }

        const outName = pillar.replace('apartado pilar de ', '').trim();
        const outPath = path.join(publicDataPath, `${outName}.json`);
        fs.writeFileSync(outPath, JSON.stringify(pillarData));
        console.log(`\n✅ Guardado: ${outName}.json (${pillarData.length} registros únicos)`);
    }

    console.log('\n🎉 Procesamiento completo!');
} catch (e) {
    console.error("Error global:", e);
}
