// ===== STATE =====
let rawData = [];
let currentPilar = 'gente';
let filterRegional = 'all';
let filterCD = 'all';
let charts = {};

// ===== DOM REFS =====
const $ = id => document.getElementById(id);
const pilarSelect = $('pilarSelect');
const regionalSelect = $('regionalSelect');
const cdSelect = $('cdSelect');
const tabs = document.querySelectorAll('#mainTabs li');
const views = document.querySelectorAll('.view');


// ===== COLORS =====
const COLORS = {
    teal: '#1a8a7d', tealLight: '#2ec4b6', blue: '#1b6a8a',
    green: '#27ae60', red: '#e74c3c', yellow: '#f1c40f',
    orange: '#e67e22', dark: '#34495e',
    regionalColors: { Sur:'#1a8a7d', Norte:'#1b6a8a', Centro:'#2ec4b6', Andes:'#f1c40f' }
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    // Disable Chart.js animations globally to prevent buggy render on tab switch
    Chart.defaults.animation = false;
    Chart.defaults.maintainAspectRatio = false;
    
    pilarSelect.addEventListener('change', e => { 
        currentPilar = e.target.value; 
        // No longer resetting filterRegional/filterCD to 'all' here
        loadData(); 
    });
    regionalSelect.addEventListener('change', e => {
        filterRegional = e.target.value;
        filterCD = 'all';
        updateCDOptions();
        render();
    });
    cdSelect.addEventListener('change', e => { filterCD = e.target.value; render(); });
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t)));
    loadData();
});

function switchTab(tab) {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    views.forEach(v => v.classList.remove('active'));
    $('view-' + tab.dataset.view).classList.add('active');
    // Force chart resize
    setTimeout(() => Object.values(charts).forEach(c => c.resize && c.resize()), 50);
}

async function loadData() {
    try {
        const r = await fetch(`data/${currentPilar}.json`);
        const raw = await r.json();
        
        // Senior Audit: Deduplicate by (identificacion, modulo) - keeping highest note
        const deduplicated = {};
        raw.forEach(d => {
            const key = `${d.identificacion || d.nombre}_${d.modulo}`;
            if (!deduplicated[key] || d.nota > deduplicated[key].nota) {
                deduplicated[key] = d;
            }
        });
        rawData = Object.values(deduplicated);

        updateRegionalOptions();
        updateCDOptions();
        render();
    } catch(e) { console.error('Error:', e); }
}

function updateRegionalOptions() {
    const regs = [...new Set(rawData.map(d => d.regional))].sort();
    regionalSelect.innerHTML = '<option value="all">Todas</option>' + regs.map(r => `<option value="${r}">${r}</option>`).join('');
    
    // Validate if the current filterRegional is still valid in the new pilar data
    if (filterRegional !== 'all' && !regs.includes(filterRegional)) {
        filterRegional = 'all';
    }
    regionalSelect.value = filterRegional;
}

function updateCDOptions() {
    const filteredForCD = rawData.filter(d => filterRegional === 'all' || d.regional === filterRegional);
    const cds = [...new Set(filteredForCD.filter(d => d.cd && d.cd !== 'No Asignado').map(d => d.cd))].sort();
    cdSelect.innerHTML = '<option value="all">Todos los CDs</option>' + cds.map(c => `<option value="${c}">${c}</option>`).join('');
    
    // Validate if the current filterCD is still valid in the new context
    if (filterCD !== 'all' && !cds.includes(filterCD)) {
        filterCD = 'all';
    }
    cdSelect.value = filterCD;
}

function getData() {
    return rawData.filter(d => {
        const matchReg = filterRegional === 'all' || d.regional === filterRegional;
        const matchCD = filterCD === 'all' || d.cd === filterCD;
        return matchReg && matchCD;
    });
}
function groupBy(arr, key) {
    return arr.reduce((r, v) => { (r[v[key]] = r[v[key]] || []).push(v); return r; }, {});
}

function getEstado(pct) {
    if (pct >= 96) return { label: 'Óptimo', cls: 'badge-optimo' };
    if (pct >= 90) return { label: 'Aceptable', cls: 'badge-aceptable' };
    if (pct >= 80) return { label: 'En Riesgo', cls: 'badge-riesgo' };
    return { label: 'Crítico', cls: 'badge-critico' };
}

function getHeatClass(pct) {
    if (pct >= 96) return 'heat-green';
    if (pct >= 76) return 'heat-yellow';
    if (pct >= 60) return 'heat-orange';
    return 'heat-red';
}

function getQClass(pct) {
    if (pct <= 75) return 'q-card-red';
    if (pct <= 95) return 'q-card-yellow';
    return 'q-card-green';
}

function makeOrUpdate(id, config) {
    if (charts[id]) { charts[id].destroy(); }
    // Force no animation on every chart
    config.options = config.options || {};
    config.options.animation = false;
    config.options.responsive = true;
    config.options.maintainAspectRatio = false;
    charts[id] = new Chart($(id), config);
}

const pilarNames = { seguridad:'Seguridad', gente:'People', flota:'Flota', gestion:'Gestión', reparto:'Reparto' };

// ===== MAIN RENDER =====
function render() {
    const data = getData();
    const total = data.length;
    const aprobados = data.filter(d => d.aprobado).length;
    const reprobados = total - aprobados;
    const pctAprob = total ? (aprobados / total * 100) : 0;
    const notaProm = total ? data.reduce((s, d) => s + d.nota, 0) / total : 0;
    const modulos = [...new Set(data.map(d => d.modulo))];
    const regionales = [...new Set(data.map(d => d.regional))];
    const centros = [...new Set(data.filter(d => d.cd && d.cd !== 'No Asignado').map(d => d.cd))];

    // Calculate Margin of Error (95% confidence, p=0.5)
    const marginOfError = total ? (0.98 / Math.sqrt(total) * 100).toFixed(2) : 0;
    const nFormatted = total.toLocaleString();

    // Update header
    $('header-subtitle').innerHTML = `
        Pilar ${pilarNames[currentPilar]} · Enero-Abril 2026 · ${modulos.length} Módulos · ${centros.length} Centros de Distribución
        <span class="margin-error">N=${nFormatted} ±${marginOfError}%</span>
    `;
    $('badge-cumplimiento').textContent = `${pctAprob.toFixed(1)}% Cumplimiento`;

    // KPIs
    $('kpi-participaciones').textContent = total.toLocaleString();
    $('kpi-modulos-count').textContent = `${modulos.length} módulos`;
    $('kpi-cumplimiento').textContent = `${pctAprob.toFixed(1)}%`;
    $('kpi-aprobados-count').textContent = `${aprobados.toLocaleString()} aprobados`;
    $('kpi-nota').textContent = notaProm.toFixed(1);
    $('kpi-reprobados').textContent = reprobados.toLocaleString();
    $('kpi-reprobados-pct').textContent = `${(total ? reprobados/total*100 : 0).toFixed(1)}% del total`;
    $('kpi-centros').textContent = centros.length;
    $('kpi-regionales-count').textContent = `${regionales.length} Regionales · 1 Pilar`;

    renderGeneral(data, modulos);
    renderCDs(data, modulos);
    renderModulos(data, modulos);
    renderPreguntas(data);
    renderCargos(data);
    renderRendimiento(data, modulos);
    renderSatisfaccion(data, modulos);
}

// ===== VISTA GENERAL =====
function renderGeneral(data, modulos) {
    const modGroup = groupBy(data, 'modulo');
    const mNames = modulos.map(m => m.length > 25 ? m.substring(0, 22) + '...' : m);
    const mAprob = modulos.map(m => { const d = modGroup[m]; return (d.filter(x => x.aprobado).length / d.length * 100).toFixed(1); });
    const mNota = modulos.map(m => { const d = modGroup[m]; return (d.reduce((s, x) => s + x.nota, 0) / d.length).toFixed(1); });

    makeOrUpdate('chart-general-modulos', {
        type: 'bar',
        data: {
            labels: mNames,
            datasets: [
                { label: '% Aprobación', data: mAprob, backgroundColor: COLORS.teal, borderRadius: 4 },
                { label: 'Nota Promedio', data: mNota, backgroundColor: COLORS.blue, borderRadius: 4 }
            ]
        },
        options: { responsive: true, plugins: { legend: { position: 'top' }, datalabels: { display: false } }, scales: { y: { beginAtZero: true, max: 110 } } }
    });

    const apr = data.filter(d => d.aprobado).length;
    makeOrUpdate('chart-general-donut', {
        type: 'doughnut',
        data: {
            labels: ['Aprobados ✅', 'Reprobados ⚠'],
            datasets: [{ data: [apr, data.length - apr], backgroundColor: [COLORS.teal, COLORS.red], borderWidth: 0 }]
        },
        options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom' }, datalabels: { display: false } } }
    });

    // Regional bars
    const regGroup = groupBy(data, 'regional');
    const regs = Object.keys(regGroup).sort((a, b) => {
        const pA = regGroup[a].filter(x => x.aprobado).length / regGroup[a].length;
        const pB = regGroup[b].filter(x => x.aprobado).length / regGroup[b].length;
        return pA - pB;
    });
    const regAprob = regs.map(r => (regGroup[r].filter(x => x.aprobado).length / regGroup[r].length * 100).toFixed(1));
    const regNota = regs.map(r => (regGroup[r].reduce((s, x) => s + x.nota, 0) / regGroup[r].length).toFixed(1));
    const regColors = regs.map(r => COLORS.regionalColors[r] || COLORS.teal);
    const regCounts = regs.map(r => regGroup[r].length);

    makeOrUpdate('chart-general-regional', {
        type: 'bar',
        data: { labels: regs, datasets: [{ label: '% Aprobación', data: regAprob, backgroundColor: regColors, borderRadius: 4 }] },
        options: {
            indexAxis: 'y', responsive: true,
            plugins: {
                legend: { display: false },
                datalabels: { anchor: 'end', align: 'end', font: { weight: 'bold', size: 11 }, formatter: v => v + '%', color: '#333' }
            },
            scales: { x: { max: 101 } }
        },
        plugins: [ChartDataLabels]
    });

    makeOrUpdate('chart-general-regional-nota', {
        type: 'bar',
        data: { labels: regs, datasets: [{ label: 'Nota Promedio', data: regNota, backgroundColor: regColors, borderRadius: 4 }] },
        options: {
            indexAxis: 'y', responsive: true,
            plugins: { legend: { display: false }, datalabels: { display: false } },
            scales: { x: { min: 55, max: 101 } }
        }
    });

    // Top 10 CDs con más reprobados
    const cdGroup = groupBy(data.filter(d => d.cd && d.cd !== 'No Asignado'), 'cd');
    let cdsList = Object.keys(cdGroup).map(cd => {
        const items = cdGroup[cd]; const p = items.length;
        const a = items.filter(x => x.aprobado).length; const r = p - a;
        const n = items.reduce((s, x) => s + x.nota, 0) / p; const pA = a / p * 100;
        const e = getEstado(pA);
        return { cd, reg: items[0].regional, part: p, nota: n, pctA: pA, rep: r, estado: e };
    }).sort((a, b) => b.rep - a.rep).slice(0, 10);

    const tbody = document.querySelector('#table-top-reprobados tbody');
    tbody.innerHTML = cdsList.map((c, i) => `<tr>
        <td>${i + 1}</td><td>${c.cd}</td><td>${c.reg}</td><td>${c.part}</td>
        <td>${c.nota.toFixed(2)}</td><td>${c.pctA.toFixed(1)}%</td>
        <td class="${c.rep > 0 ? 'text-red' : ''}">${c.rep}</td>
        <td><span class="badge ${c.estado.cls}">${c.estado.label}</span></td>
    </tr>`).join('');
}

// ===== COMPARATIVA CDS =====
function renderCDs(data, modulos) {
    const cdGroup = groupBy(data.filter(d => d.cd && d.cd !== 'No Asignado'), 'cd');
    let cdsList = Object.keys(cdGroup).map(cd => {
        const items = cdGroup[cd]; const p = items.length;
        const a = items.filter(x => x.aprobado).length; const r = p - a;
        const n = items.reduce((s, x) => s + x.nota, 0) / p; const pA = a / p * 100;
        return { cd, reg: items[0].regional, part: p, nota: n, pctA: pA, rep: r, estado: getEstado(pA) };
    }).sort((a, b) => b.pctA - a.pctA);

    const labels = cdsList.map(c => c.cd);
    const aprobData = cdsList.map(c => c.pctA.toFixed(1));
    const notaData = cdsList.map(c => c.nota.toFixed(1));
    const barColors = cdsList.map(c => COLORS.regionalColors[c.reg] || COLORS.teal);

    makeOrUpdate('chart-cds-aprob', {
        type: 'bar',
        data: { labels, datasets: [{ data: aprobData, backgroundColor: barColors, borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, datalabels: { display: false } }, scales: { x: { min: 65, max: 101 } } }
    });

    makeOrUpdate('chart-cds-nota', {
        type: 'bar',
        data: { labels, datasets: [{ data: notaData, backgroundColor: barColors.map(() => COLORS.blue), borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, datalabels: { display: false } }, scales: { x: { min: 55, max: 101 } } }
    });

    // Heatmap Regional x Modulo
    const regGroup = groupBy(data, 'regional');
    const regNames = Object.keys(regGroup).sort();
    let heatHtml = '<table class="heatmap-table"><thead><tr><th>Regional / CD</th>';
    modulos.forEach(m => heatHtml += `<th>${m.length > 18 ? m.substring(0, 15) + '...' : m}</th>`);
    heatHtml += '<th>Global</th></tr></thead><tbody>';
    regNames.forEach(reg => {
        const rData = regGroup[reg];
        const globalPct = rData.filter(x => x.aprobado).length / rData.length * 100;
        heatHtml += `<tr><td>${reg}</td>`;
        modulos.forEach(m => {
            const mData = rData.filter(x => x.modulo === m);
            const pct = mData.length ? (mData.filter(x => x.aprobado).length / mData.length * 100) : 0;
            heatHtml += `<td class="${getHeatClass(pct)}">${pct.toFixed(1)}%</td>`;
        });
        heatHtml += `<td class="${getHeatClass(globalPct)} heat-bold">${globalPct.toFixed(1)}%</td></tr>`;
    });
    heatHtml += '</tbody></table>';
    $('heatmap-container').innerHTML = heatHtml;

    // Ranking table
    const tbody = document.querySelector('#table-ranking-cds tbody');
    tbody.innerHTML = cdsList.map((c, i) => `<tr>
        <td>${i + 1}</td><td>${c.cd}</td><td>${c.reg}</td><td>${c.part}</td>
        <td>${c.nota.toFixed(2)}</td><td>${c.pctA.toFixed(1)}%</td>
        <td class="${c.rep > 0 ? 'text-red' : ''}">${c.rep}</td>
        <td><span class="badge ${c.estado.cls}">${c.estado.label}</span></td>
    </tr>`).join('');
}

// ===== POR MÓDULO =====
function renderModulos(data, modulos) {
    const modGroup = groupBy(data, 'modulo');
    // KPI per module
    let kpiHtml = '';
    modulos.forEach((m, i) => {
        const d = modGroup[m]; const pct = (d.filter(x => x.aprobado).length / d.length * 100);
        const nota = d.reduce((s, x) => s + x.nota, 0) / d.length;
        const borders = ['kpi-primary', 'kpi-green', 'kpi-blue', 'kpi-red', 'kpi-dark'];
        kpiHtml += `<div class="kpi-card ${borders[i % borders.length]}">
            <h2>${pct.toFixed(1)}%</h2>
            <p>${m.length > 30 ? m.substring(0, 27) + '...' : m}</p>
            <small>${d.length} participantes · ${nota.toFixed(1)} prom.</small>
        </div>`;
    });
    $('modulo-kpi-row').innerHTML = kpiHtml;

    // Bar chart
    const mNames = modulos.map(m => m.length > 25 ? m.substring(0, 22) + '...' : m);
    const mAprob = modulos.map(m => (modGroup[m].filter(x => x.aprobado).length / modGroup[m].length * 100).toFixed(1));
    const mNota = modulos.map(m => (modGroup[m].reduce((s, x) => s + x.nota, 0) / modGroup[m].length).toFixed(1));

    makeOrUpdate('chart-modulo-bar', {
        type: 'bar',
        data: { labels: mNames, datasets: [
            { label: '% Aprobación', data: mAprob, backgroundColor: COLORS.teal, borderRadius: 4 },
            { label: 'Nota Promedio', data: mNota, backgroundColor: COLORS.blue, borderRadius: 4 }
        ] },
        options: { responsive: true, plugins: { legend: { position: 'top' }, datalabels: { display: false } }, scales: { y: { beginAtZero: true, max: 110 } } }
    });

    // Heatmap modules
    const regGroup = groupBy(data, 'regional');
    const regNames = Object.keys(regGroup).sort();
    let hHtml = '<table class="heatmap-table"><thead><tr><th>Regional / CD</th>';
    modulos.forEach(m => hHtml += `<th>${m.length > 18 ? m.substring(0, 15) + '...' : m}</th>`);
    hHtml += '<th>Global</th></tr></thead><tbody>';
    regNames.forEach(reg => {
        const rData = regGroup[reg];
        const gPct = rData.filter(x => x.aprobado).length / rData.length * 100;
        hHtml += `<tr><td>${reg}</td>`;
        modulos.forEach(m => {
            const mData = rData.filter(x => x.modulo === m);
            const pct = mData.length ? (mData.filter(x => x.aprobado).length / mData.length * 100) : 0;
            hHtml += `<td class="${getHeatClass(pct)}">${pct.toFixed(1)}%</td>`;
        });
        hHtml += `<td class="${getHeatClass(gPct)} heat-bold">${gPct.toFixed(1)}%</td></tr>`;
    });
    hHtml += '</tbody></table>';
    $('heatmap-modulos-container').innerHTML = hHtml;

    // Distribution stacked bar
    const distLabels = []; const d100 = []; const d80 = []; const d60 = []; const d40 = [];
    modulos.forEach(m => {
        distLabels.push(m.length > 20 ? m.substring(0, 17) + '...' : m);
        const items = modGroup[m];
        d100.push(items.filter(x => x.nota === 100).length);
        d80.push(items.filter(x => x.nota >= 80 && x.nota < 100).length);
        d60.push(items.filter(x => x.nota >= 60 && x.nota < 80).length);
        d40.push(items.filter(x => x.nota < 60).length);
    });

    makeOrUpdate('chart-modulo-dist', {
        type: 'bar',
        data: { labels: distLabels, datasets: [
            { label: '100 pts', data: d100, backgroundColor: COLORS.teal },
            { label: '80 pts', data: d80, backgroundColor: COLORS.blue },
            { label: '60 pts', data: d60, backgroundColor: COLORS.tealLight },
            { label: '≤40 pts', data: d40, backgroundColor: COLORS.red }
        ] },
        options: { responsive: true, plugins: { legend: { position: 'top' }, datalabels: { display: false } }, scales: { x: { stacked: true }, y: { stacked: true } } }
    });
}

// ===== ANÁLISIS PREGUNTAS =====
function renderPreguntas(data) {
    // Count failures per question
    const qFails = {};
    const qTotals = {};
    data.forEach(d => {
        d.preguntas_totales.forEach(q => { qTotals[q] = (qTotals[q] || 0) + 1; });
        d.preguntas_falladas.forEach(q => { qFails[q] = (qFails[q] || 0) + 1; });
    });

    // FIX: Iterate over ALL questions (qTotals) instead of only failed ones (qFails)
    let qList = Object.keys(qTotals).map(q => {
        const fails = qFails[q] || 0; 
        const total = qTotals[q] || 1;
        const pctError = fails / total * 100;
        // Find which module this question belongs to
        const entry = data.find(d => d.preguntas_totales.includes(q));
        const modulo = entry ? entry.modulo : 'N/A';
        return { q, modulo, fails, total, pctError, pctAcierto: 100 - pctError };
    }).sort((a, b) => b.pctError - a.pctError);

    // Top 10 chart
    const top10 = qList.slice(0, 10);
    const topColors = top10.map((_, i) => i < 2 ? COLORS.red : i < 5 ? COLORS.orange : COLORS.yellow);
    makeOrUpdate('chart-preguntas-top10', {
        type: 'bar',
        data: { labels: top10.map(q => q.q.length > 40 ? q.q.substring(0, 37) + '...' : q.q), datasets: [{ data: top10.map(q => q.pctError.toFixed(1)), backgroundColor: topColors, borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, datalabels: { display: false } }, scales: { x: { max: 40 } } }
    });

    // Fails by module donut
    const modFails = {};
    qList.forEach(q => { modFails[q.modulo] = (modFails[q.modulo] || 0) + q.fails; });
    const mfKeys = Object.keys(modFails);
    const donutColors = [COLORS.yellow, COLORS.red, COLORS.blue, COLORS.teal, COLORS.orange, COLORS.dark, '#9b59b6', '#1abc9c'];
    makeOrUpdate('chart-preguntas-modulo-donut', {
        type: 'doughnut',
        data: { labels: mfKeys.map(k => k.length > 25 ? k.substring(0, 22) + '...' : k), datasets: [{ data: mfKeys.map(k => modFails[k]), backgroundColor: donutColors.slice(0, mfKeys.length), borderWidth: 0 }] },
        options: { responsive: true, cutout: '55%', plugins: { legend: { position: 'right', labels: { font: { size: 10 } } }, datalabels: { display: false } } }
    });

    // Top 5 bar
    const top5 = qList.slice(0, 5);
    const t5Colors = [COLORS.teal, COLORS.blue, COLORS.yellow, COLORS.orange, COLORS.red];
    makeOrUpdate('chart-preguntas-top5-bar', {
        type: 'bar',
        data: { labels: top5.map(q => q.q.length > 30 ? q.q.substring(0, 27) + '...' : q.q), datasets: [{ data: top5.map(q => q.fails), backgroundColor: t5Colors, borderRadius: 4 }] },
        options: {
            indexAxis: 'y', responsive: true,
            plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'end', font: { weight: 'bold' }, color: '#333' } },
        },
        plugins: [ChartDataLabels]
    });

    // Table
    const getPriority = pct => {
        if (pct > 20) return { label: 'Crítica', cls: 'badge-critico' };
        if (pct > 10) return { label: 'Atención', cls: 'badge-riesgo' };
        return { label: 'Normal', cls: 'badge-aceptable' };
    };
    const tbody = document.querySelector('#table-preguntas tbody');
    tbody.innerHTML = qList.slice(0, 20).map((q, i) => {
        const p = getPriority(q.pctError);
        return `<tr>
            <td>${i + 1}</td><td>${q.modulo.length > 25 ? q.modulo.substring(0, 22) + '...' : q.modulo}</td>
            <td>${q.q.length > 50 ? q.q.substring(0, 47) + '...' : q.q}</td>
            <td>${q.pctAcierto.toFixed(1)}%</td>
            <td class="text-red">${q.pctError.toFixed(1)}%</td>
            <td>${q.fails}</td><td>${q.total}</td>
            <td><span class="badge ${p.cls}">${p.label}</span></td>
        </tr>`;
    }).join('');
}

// ===== POR CARGO =====
function renderCargos(data) {
    const cGroup = groupBy(data.filter(d => d.cargo && d.cargo !== 'No Especificado'), 'cargo');
    let cList = Object.keys(cGroup).map(c => {
        const items = cGroup[c]; const p = items.length;
        const a = items.filter(x => x.aprobado).length; const r = p - a;
        const n = items.reduce((s, x) => s + x.nota, 0) / p; const pA = a / p * 100;
        return { cargo: c, part: p, nota: n, pctA: pA, rep: r, estado: getEstado(pA) };
    }).sort((a, b) => a.pctA - b.pctA);

    const top = cList.slice(0, 15);
    const cColors = top.map((c, i) => c.pctA < 90 ? COLORS.yellow : c.pctA < 95 ? COLORS.tealLight : COLORS.teal);

    makeOrUpdate('chart-cargo-aprob', {
        type: 'bar',
        data: { labels: top.map(c => c.cargo), datasets: [{ data: top.map(c => c.pctA.toFixed(1)), backgroundColor: cColors, borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, datalabels: { display: false } }, scales: { x: { min: 85, max: 101 } } }
    });

    makeOrUpdate('chart-cargo-nota', {
        type: 'bar',
        data: { labels: top.map(c => c.cargo), datasets: [{ data: top.map(c => c.nota.toFixed(1)), backgroundColor: COLORS.blue, borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, datalabels: { display: false } }, scales: { x: { min: 80, max: 101 } } }
    });

    // Sort by participations desc for the table
    cList.sort((a, b) => b.pctA - a.pctA);
    const tbody = document.querySelector('#table-cargos tbody');
    tbody.innerHTML = cList.map(c => `<tr>
        <td>${c.cargo}</td><td>${c.part}</td><td>${c.nota.toFixed(1)}</td>
        <td>${c.pctA.toFixed(1)}%</td>
        <td class="${c.rep > 0 ? 'text-red' : 'text-green'}">${c.rep}</td>
        <td><span class="badge ${c.estado.cls}">${c.estado.label}</span></td>
    </tr>`).join('');
}

// ===== RENDIMIENTO PERSONAL =====
function renderRendimiento(data, modulos) {
    const cdName = filterCD !== 'all' ? filterCD : (filterRegional !== 'all' ? `Regional ${filterRegional}` : 'Todos los CDs');
    const pctAprob = data.length ? (data.filter(d => d.aprobado).length / data.length * 100) : 0;
    const notaProm = data.length ? (data.reduce((s, d) => s + d.nota, 0) / data.length) : 0;

    // Banner
    $('rend-cd-name').textContent = cdName;
    const regInfo = filterRegional !== 'all' ? `Regional ${filterRegional}` : 'Todas las Regionales';
    $('rend-cd-info').textContent = `${regInfo} · ${data.length} participaciones · ${modulos.length} módulos`;
    $('rend-cumpl').innerHTML = `${pctAprob.toFixed(1)}%<small>Cumplimiento · Nota prom. ${notaProm.toFixed(1)}</small>`;

    // Unique collaborators by Identificación/Nombre
    const byPerson = {};
    data.forEach(d => {
        const id = d.identificacion || d.nombre;
        if (!byPerson[id]) {
            byPerson[id] = {
                nombre: d.nombre,
                identificacion: d.identificacion,
                cargo: d.cargo,
                cd: d.cd,
                modulosTomados: 0,
                aprobados: 0,
                sumaNotas: 0,
                modulosAReforzar: []
            };
        }
        byPerson[id].modulosTomados++;
        byPerson[id].sumaNotas += d.nota;
        if (d.aprobado) {
            byPerson[id].aprobados++;
        } else {
            byPerson[id].modulosAReforzar.push(d.modulo);
        }
    });

    const personasList = Object.values(byPerson);
    const totalPersonas = personasList.length;
    const aptos = personasList.filter(p => p.modulosAReforzar.length === 0);
    const aReforzar = personasList.filter(p => p.modulosAReforzar.length > 0);

    $('rend-total').textContent = totalPersonas.toLocaleString();
    $('rend-aptos').textContent = aptos.length.toLocaleString();
    $('rend-aptos-pct').textContent = `${(totalPersonas ? aptos.length/totalPersonas*100 : 0).toFixed(1)}% aprobó todos sus módulos`;
    $('rend-reforzar').textContent = aReforzar.length.toLocaleString();
    $('rend-reforzar-pct').textContent = `${(totalPersonas ? aReforzar.length/totalPersonas*100 : 0).toFixed(1)}% con al menos 1 reprobado`;

    // Question analysis for this filtered data
    const qF = {}, qT = {};
    data.forEach(d => {
        d.preguntas_totales.forEach(q => { qT[q] = (qT[q] || 0) + 1; });
        d.preguntas_falladas.forEach(q => { qF[q] = (qF[q] || 0) + 1; });
    });

    let qList = Object.keys(qT).map(q => {
        const fails = qF[q] || 0;
        const total = qT[q];
        const pctError = fails / total * 100;
        const entry = data.find(d => d.preguntas_totales.includes(q));
        const modulo = entry ? entry.modulo : 'N/A';
        return { q, modulo, fails, total, pctError, pctAcierto: 100 - pctError };
    }).sort((a, b) => b.pctError - a.pctError);

    // Top 5 Difficult (lowest acierto first)
    const top5Diff = qList.filter(q => q.fails > 0).slice(0, 5);
    const diffColors = [COLORS.red, COLORS.orange, COLORS.yellow, '#f39c12', '#e67e22'];
    makeOrUpdate('chart-rend-dificiles', {
        type: 'bar',
        data: {
            labels: top5Diff.map(q => q.q.length > 35 ? q.q.substring(0, 32) + '...' : q.q),
            datasets: [{ 
                label: '% acierto',
                data: top5Diff.map(q => q.pctAcierto.toFixed(1)), 
                backgroundColor: diffColors, 
                borderRadius: 4,
                barThickness: 24 
            }]
        },
        options: {
            indexAxis: 'y',
            plugins: { 
                legend: { display: false }, 
                datalabels: { display: false }, // Hide datalabels to keep clean, show in tooltip and cards
                tooltip: {
                    callbacks: {
                        title: (ctx) => top5Diff[ctx[0].dataIndex].q,
                        label: (ctx) => ` ${ctx.raw}% acierto`
                    }
                }
            },
            scales: { x: { min: 0, max: 100, title: { display: false } } }
        }
    });

    // Populate Top 5 Diff Cards
    const diffCardsHtml = top5Diff.map((q, i) => `
        <div class="q-card-thin ${getQClass(q.pctAcierto)}">
            <div class="q-number">${i+1}</div>
            <div class="q-card-content">
                <strong>${q.q}</strong>
                <small>${q.modulo.substring(0,30)}... - ${q.fails} fallos de ${q.total}</small>
            </div>
            <div class="q-pct">${q.pctAcierto.toFixed(1)}%</div>
        </div>
    `).join('');
    $('cards-rend-dificiles').innerHTML = diffCardsHtml;

    // Top 5 Easiest
    const top5Easy = [...qList].sort((a, b) => a.pctError - b.pctError).slice(0, 5);
    makeOrUpdate('chart-rend-faciles', {
        type: 'bar',
        data: {
            labels: top5Easy.map(q => q.q.length > 35 ? q.q.substring(0, 32) + '...' : q.q),
            datasets: [{ 
                label: '% acierto',
                data: top5Easy.map(q => q.pctAcierto.toFixed(1)), 
                backgroundColor: COLORS.teal, 
                borderRadius: 4,
                barThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            plugins: { 
                legend: { display: false }, 
                datalabels: { display: false }, // Hide datalabels to keep clean, show in cards
                tooltip: {
                    callbacks: {
                        title: (ctx) => top5Easy[ctx[0].dataIndex].q,
                        label: (ctx) => ` ${ctx.raw}% acierto`
                    }
                }
            },
            scales: { x: { min: 80, max: 105 } } // give it some room since it's 100% mostly
        }
    });

    // Populate Top 5 Easy Cards
    const easyCardsHtml = top5Easy.map((q, i) => `
        <div class="q-card-thin ${getQClass(q.pctAcierto)}">
            <div class="q-number">${i+1}</div>
            <div class="q-card-content">
                <strong>${q.q}</strong>
                <small>${q.modulo.substring(0,30)}... - solo ${q.fails} fallos de ${q.total}</small>
            </div>
            <div class="q-pct">${q.pctAcierto.toFixed(0)}%</div>
        </div>
    `).join('');
    $('cards-rend-faciles').innerHTML = easyCardsHtml;

    // Apto vs Reforzar Donut
    makeOrUpdate('chart-rend-apto-donut', {
        type: 'doughnut',
        data: {
            labels: ['Personal Apto ✅', 'Personal a Reforzar ⚠'],
            datasets: [{
                data: [aptos.length, aReforzar.length],
                backgroundColor: [COLORS.teal, COLORS.red],
                borderWidth: 2
            }]
        },
        options: {
            cutout: '60%',
            plugins: {
                legend: { position: 'bottom' },
                datalabels: { 
                    display: true,
                    color: '#fff',
                    font: { weight: 'bold', size: 14 },
                    formatter: (v, ctx) => {
                        if (v === 0) return '';
                        const total = ctx.dataset.data.reduce((a,b)=>a+b, 0);
                        return Math.round(v/total*100) + '%';
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a,b)=>a+b, 0);
                            const pct = Math.round(ctx.raw/total*100);
                            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Reprobados por modulo
    const repXMod = {};
    aReforzar.forEach(p => {
        p.modulosAReforzar.forEach(m => {
            repXMod[m] = (repXMod[m] || 0) + 1;
        });
    });
    // Ensure all modulos are present
    modulos.forEach(m => { if(!repXMod[m]) repXMod[m] = 0; });
    const repXModArr = Object.entries(repXMod).sort((a, b) => b[1] - a[1]);

    $('title-rend-reprobados').textContent = `REPROBADOS POR MÓDULO — ${cdName.toUpperCase()}`;
    makeOrUpdate('chart-rend-reprobados-modulo', {
        type: 'bar',
        data: {
            labels: repXModArr.map(m => m[0].substring(0, 20)),
            datasets: [{
                data: repXModArr.map(m => m[1]),
                backgroundColor: COLORS.red,
                borderRadius: 4,
                barThickness: 16
            }]
        },
        options: {
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                datalabels: { anchor: 'end', align: 'left', color: '#fff', font: { weight: 'bold' } }
            },
            scales: { x: { beginAtZero: true } }
        }
    });

    // Warning banner
    const banner = $('rend-warning-banner');
    if (aReforzar.length > 0) {
        banner.style.display = 'block';
        $('rend-warning-text').textContent = `${aReforzar.length} colaboradores en ${cdName} necesitan refuerzo. ${aptos.length} colaboradores ya están aptos (${(aptos.length/totalPersonas*100).toFixed(1)}%). Revisa el detalle a continuación.`;
    } else {
        banner.style.display = 'none';
    }

    // Table
    const tbody = document.querySelector('#table-rend-personal tbody');
    tbody.innerHTML = aReforzar.map(p => {
        const notaPromedio = p.sumaNotas / p.modulosTomados;
        const modBadges = p.modulosAReforzar.map(m => `<span class="badge badge-riesgo">${m.substring(0,18)}...</span>`).join(' ');
        return `<tr>
            <td style="font-weight:600;">${p.nombre}</td>
            <td>${p.cargo}</td>
            <td>${p.cd}</td>
            <td>${p.modulosTomados}</td>
            <td>${p.aprobados}</td>
            <td>${notaPromedio.toFixed(1)}</td>
            <td>${modBadges}</td>
        </tr>`;
    }).join('');
}

// ===== EVALUACIÓN ENTRENAMIENTO (SATISFACCIÓN) =====
function renderSatisfaccion(data, modulos) {
    const respuestas = data.filter(d => d.satisfaccion !== null && d.satisfaccion !== undefined);
    const totalResp = respuestas.length;

    if (totalResp === 0) {
        $('sat-promedio').textContent = '—/10';
        $('sat-total-resp').textContent = '0 respuestas recibidas';
        $('sat-excelente').textContent = '—%';
        $('sat-mejorar').textContent = '—%';
        makeOrUpdate('chart-sat-distribucion', { type: 'bar', data: { labels: [], datasets: [] } });
        makeOrUpdate('chart-sat-modulos', { type: 'bar', data: { labels: [], datasets: [] } });
        document.querySelector('#table-sat-modulos tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay datos de satisfacción disponibles</td></tr>';
        return;
    }

    const sumaSat = respuestas.reduce((acc, d) => acc + d.satisfaccion, 0);
    const promSat = sumaSat / totalResp;

    // Categorization
    const excelentes = respuestas.filter(d => d.satisfaccion >= 9);
    const aceptables = respuestas.filter(d => d.satisfaccion >= 7 && d.satisfaccion <= 8);
    const mejorar = respuestas.filter(d => d.satisfaccion <= 6);

    const pctExc = (excelentes.length / totalResp) * 100;
    const pctMej = (mejorar.length / totalResp) * 100;

    $('sat-promedio').textContent = `${promSat.toFixed(1)}/10`;
    $('sat-total-resp').textContent = `${totalResp.toLocaleString()} respuestas recibidas`;
    
    $('sat-excelente').textContent = `${pctExc.toFixed(1)}%`;
    $('sat-excelente-count').textContent = `${excelentes.length.toLocaleString()} promotores`;
    
    $('sat-mejorar').textContent = `${pctMej.toFixed(1)}%`;
    $('sat-mejorar-count').textContent = `${mejorar.length.toLocaleString()} detractores`;

    // Distribution Chart (1 to 10)
    const distCounts = Array(11).fill(0);
    respuestas.forEach(d => {
        const val = Math.round(d.satisfaccion);
        if (val >= 0 && val <= 10) distCounts[val]++;
    });

    const distColors = distCounts.map((_, i) => i >= 9 ? COLORS.teal : (i >= 7 ? COLORS.yellow : COLORS.red));
    makeOrUpdate('chart-sat-distribucion', {
        type: 'bar',
        data: {
            labels: ['0','1','2','3','4','5','6','7','8','9','10'],
            datasets: [{
                data: distCounts,
                backgroundColor: distColors,
                borderRadius: 4
            }]
        },
        options: {
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'top', font: { weight: 'bold' },
                    formatter: (v) => v > 0 ? v : ''
                }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // Per module analysis
    const satMod = {};
    respuestas.forEach(d => {
        if (!satMod[d.modulo]) satMod[d.modulo] = { total: 0, sum: 0, exc: 0, acc: 0, mej: 0 };
        satMod[d.modulo].total++;
        satMod[d.modulo].sum += d.satisfaccion;
        if (d.satisfaccion >= 9) satMod[d.modulo].exc++;
        else if (d.satisfaccion >= 7) satMod[d.modulo].acc++;
        else satMod[d.modulo].mej++;
    });

    const satModArr = Object.entries(satMod).map(([modulo, stats]) => {
        const avg = stats.sum / stats.total;
        return {
            modulo,
            respuestas: stats.total,
            promedio: avg,
            pctExc: (stats.exc / stats.total) * 100,
            pctAcc: (stats.acc / stats.total) * 100,
            pctMej: (stats.mej / stats.total) * 100
        };
    }).sort((a, b) => b.promedio - a.promedio);

    // Chart: Sat Modulos
    makeOrUpdate('chart-sat-modulos', {
        type: 'bar',
        data: {
            labels: satModArr.map(m => m.modulo.substring(0, 20) + '...'),
            datasets: [{
                data: satModArr.map(m => m.promedio.toFixed(1)),
                backgroundColor: COLORS.teal,
                borderRadius: 4,
                barThickness: 32
            }]
        },
        options: {
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'bottom', color: '#fff', font: { weight: 'bold' }
                }
            },
            scales: { y: { min: 0, max: 10 } }
        }
    });

    // Table: Sat Modulos
    const tbody = document.querySelector('#table-sat-modulos tbody');
    tbody.innerHTML = satModArr.map(m => {
        return `<tr>
            <td style="font-weight:600;">${m.modulo}</td>
            <td>${m.respuestas.toLocaleString()}</td>
            <td>${m.promedio.toFixed(1)}/10</td>
            <td class="text-green">${m.pctExc.toFixed(1)}%</td>
            <td style="color:#f39c12;">${m.pctAcc.toFixed(1)}%</td>
            <td class="text-red">${m.pctMej.toFixed(1)}%</td>
        </tr>`;
    }).join('');
}
