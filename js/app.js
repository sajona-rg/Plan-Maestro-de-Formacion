// ===== STATE =====
let rawData = [];
let currentPilar = 'gente';
const PILARS = ['seguridad', 'gente', 'flota', 'gestion', 'reparto'];
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
    // Register the datalabels plugin globally
    Chart.register(ChartDataLabels);

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
    cdSelect.addEventListener('change', e => { 
        filterCD = e.target.value;
        // Auto-set regional if a specific CD is selected
        if (filterCD !== 'all') {
            const item = rawData.find(d => d.cd === filterCD);
            if (item && filterRegional !== item.regional) {
                filterRegional = item.regional;
                regionalSelect.value = filterRegional;
                updateCDOptions();
            }
        }
        render(); 
    });
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
        let raw;
        if (currentPilar === 'all') {
            // Load all pillars in parallel
            const promises = PILARS.map(p => fetch(`data/${p}.json`).then(r => r.json()));
            const results = await Promise.all(promises);
            raw = results.flat();
        } else {
            const r = await fetch(`data/${currentPilar}.json`);
            raw = await r.json();
        }
        
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
    const cdsByRegion = {};
    const filteredForCD = rawData.filter(d => filterRegional === 'all' || d.regional === filterRegional);
    
    filteredForCD.forEach(d => {
        if (d.cd && d.cd !== 'No Asignado') {
            if (!cdsByRegion[d.regional]) cdsByRegion[d.regional] = new Set();
            cdsByRegion[d.regional].add(d.cd);
        }
    });

    let html = '<option value="all">Todos los CDs</option>';
    const sortedRegions = Object.keys(cdsByRegion).sort();
    
    sortedRegions.forEach(reg => {
        const cds = Array.from(cdsByRegion[reg]).sort();
        html += `<optgroup label="Regional ${reg}">`;
        cds.forEach(c => {
            html += `<option value="${c}">${c}</option>`;
        });
        html += `</optgroup>`;
    });
    
    cdSelect.innerHTML = html;
    
    // Validate if the current filterCD is still valid in the new context
    const allCds = [...new Set(filteredForCD.map(d => d.cd))];
    if (filterCD !== 'all' && !allCds.includes(filterCD)) {
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

const pilarNames = { 
    all: 'Consolidado Nacional',
    seguridad: 'Seguridad', 
    gente: 'People', 
    flota: 'Flota', 
    gestion: 'Gestión', 
    reparto: 'Reparto' 
};
const BAR_HEIGHT = 28; // Min height per bar for scrollable charts
const COL_WIDTH = 65;  // Balanced width per group for horizontal scroll

function adjustChartHeight(canvasId, itemCount) {
    const wrapper = $(`wrap-${canvasId.replace('chart-', '')}`);
    if (!wrapper) return;
    // Special height for stacked bars or charts with long multiline labels
    let rowHeight = BAR_HEIGHT + 10;
    if (canvasId.includes('modulo-dist')) rowHeight = 35;
    if (canvasId.includes('rend-dificiles') || canvasId.includes('rend-faciles')) rowHeight = 55;
    if (canvasId.includes('preguntas-top10') || canvasId.includes('preguntas-top5')) rowHeight = 60; // Taller for long question text
    
    const padding = 40; // axes and legends room
    const calculatedHeight = (itemCount * rowHeight) + padding;
    
    // Set height (parent .chart-scroll-wrap will handle max-height and scroll)
    wrapper.style.height = `${Math.max(calculatedHeight, 200)}px`;
}

function adjustChartWidth(canvasId, itemCount) {
    const wrapper = $(`wrap-${canvasId.replace('chart-', '')}`);
    if (!wrapper) return;
    
    // Dynamic spacing: provide more room when there are many bars to avoid label overlap
    let spacing = COL_WIDTH; // default 65
    if (itemCount > 10) spacing = 95;
    else if (itemCount > 6) spacing = 80;
    
    const minWidth = itemCount * spacing;
    wrapper.style.width = `${Math.max(minWidth, 600)}px`;
}

function splitLabel(label, limit = 40) {
    if (!label) return '';
    if (label.length <= limit) return label;
    const words = label.split(' ');
    const lines = [];
    let currentLine = '';
    words.forEach(w => {
        if ((currentLine + w).length > limit) {
            lines.push(currentLine.trim());
            currentLine = w + ' ';
        } else {
            currentLine += w + ' ';
        }
    });
    if (currentLine) lines.push(currentLine.trim());
    return lines;
}

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
    const pilarLabel = currentPilar === 'all' ? 'Consolidado Nacional' : `Pilar ${pilarNames[currentPilar]}`;
    $('header-subtitle').innerHTML = `
        ${pilarLabel} · Enero-Abril 2026 · ${modulos.length} Módulos · ${centros.length} Centros de Distribución
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
    const activePillarsCount = currentPilar === 'all' ? PILARS.length : 1;
    $('kpi-regionales-count').textContent = `${regionales.length} Regionales · ${activePillarsCount} Pilar${activePillarsCount > 1 ? 'es' : ''}`;

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

    adjustChartWidth('chart-general-modulos', mNames.length);
    makeOrUpdate('chart-general-modulos', {
        type: 'bar',
        data: {
            labels: mNames,
            datasets: [
                { label: '% Aprobación', data: mAprob, backgroundColor: COLORS.teal, borderRadius: 4 },
                { label: 'Nota Promedio', data: mNota, backgroundColor: COLORS.blue, borderRadius: 4 }
            ]
        },
        options: { 
            responsive: true, 
            plugins: { 
                legend: { position: 'top' }, 
                datalabels: { 
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    offset: -2,
                    font: { weight: 'bold', size: modulos.length > 10 ? 9 : 10 },
                    color: (ctx) => ctx.dataset.label.includes('%') ? COLORS.teal : COLORS.blue,
                    formatter: (v, ctx) => ctx.dataset.label.includes('%') ? v + '%' : v
                } 
            }, 
            scales: { y: { beginAtZero: true, max: 115 } } 
        }
    });

    const apr = data.filter(d => d.aprobado).length;
    const rep = data.length - apr;
    const total = data.length;
    
    // Visual Floor for small slices
    const minVal = total * 0.05; // 5% minimum visual slice
    const renderData = [
        apr > 0 ? Math.max(apr, minVal) : 0,
        rep > 0 ? Math.max(rep, minVal) : 0
    ];

    makeOrUpdate('chart-general-donut', {
        type: 'doughnut',
        data: {
            labels: ['Aprobados ✅', 'Reprobados ⚠'],
            datasets: [{ 
                data: renderData, 
                realData: [apr, rep],
                backgroundColor: [COLORS.teal, COLORS.red], 
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: { 
            responsive: true, 
            cutout: '60%', 
            plugins: { 
                legend: { position: 'bottom' }, 
                datalabels: { 
                    display: true,
                    color: '#fff',
                    font: { weight: 'bold', size: 12 },
                    formatter: (v, ctx) => {
                        const val = ctx.dataset.realData[ctx.dataIndex];
                        const pctRaw = (val / total * 100);
                        if (pctRaw <= 0) return '';
                        if (pctRaw < 0.95) return '<1%';
                        return Math.round(pctRaw) + '%';
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.dataset.realData[ctx.dataIndex];
                            const pct = (val / total * 100).toFixed(1);
                            return ` ${ctx.label}: ${val} (${pct}%)`;
                        }
                    }
                }
            } 
        }
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
                datalabels: { 
                    anchor: 'end', 
                    align: (ctx) => (ctx.dataset.data[ctx.dataIndex] > 90 ? 'left' : 'right'), 
                    offset: 4,
                    font: { weight: 'bold', size: 10 }, 
                    formatter: v => v + '%', 
                    color: (ctx) => (ctx.dataset.data[ctx.dataIndex] > 90 ? '#fff' : '#333')
                }
            },
            scales: { x: { max: 110 } }
        }
    });

    makeOrUpdate('chart-general-regional-nota', {
        type: 'bar',
        data: { labels: regs, datasets: [{ label: 'Nota Promedio', data: regNota, backgroundColor: regColors, borderRadius: 4 }] },
        options: {
            indexAxis: 'y', responsive: true,
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    display: true, 
                    anchor: 'end', 
                    align: (ctx) => (ctx.dataset.data[ctx.dataIndex] > 90 ? 'left' : 'right'), 
                    offset: 4,
                    font: { weight: 'bold', size: 10 }, 
                    color: (ctx) => (ctx.dataset.data[ctx.dataIndex] > 90 ? '#fff' : '#333'),
                    formatter: v => v
                } 
            },
            scales: { x: { min: 55, max: 110 } }
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

    adjustChartHeight('chart-cds-aprob', labels.length);
    makeOrUpdate('chart-cds-aprob', {
        type: 'bar',
        data: { labels, datasets: [{ data: aprobData, backgroundColor: barColors, borderRadius: 4 }] },
        options: { 
            indexAxis: 'y', responsive: true, 
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    display: true, 
                    anchor: 'end', 
                    align: 'right', 
                    offset: 2,
                    font: { weight: 'bold', size: 9 }, 
                    color: '#333',
                    formatter: v => v + '%' 
                } 
            }, 
            scales: { x: { min: 65, max: 115 } } 
        }
    });

    adjustChartHeight('chart-cds-nota', labels.length);
    makeOrUpdate('chart-cds-nota', {
        type: 'bar',
        data: { labels, datasets: [{ data: notaData, backgroundColor: barColors.map(() => COLORS.blue), borderRadius: 4 }] },
        options: { 
            indexAxis: 'y', responsive: true, 
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    display: true, 
                    anchor: 'end', 
                    align: 'right', 
                    offset: 2,
                    font: { weight: 'bold', size: 9 }, 
                    color: '#333',
                    formatter: v => v 
                } 
            }, 
            scales: { x: { min: 55, max: 115 } } 
        }
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

    adjustChartWidth('chart-modulo-bar', mNames.length);
    makeOrUpdate('chart-modulo-bar', {
        type: 'bar',
        data: { labels: mNames, datasets: [
            { label: '% Aprobación', data: mAprob, backgroundColor: COLORS.teal, borderRadius: 4 },
            { label: 'Nota Promedio', data: mNota, backgroundColor: COLORS.blue, borderRadius: 4 }
        ] },
        options: { 
            responsive: true, 
            plugins: { 
                legend: { position: 'top' }, 
                datalabels: { 
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    font: { weight: 'bold', size: modulos.length > 10 ? 9 : 10 },
                    color: (ctx) => ctx.dataset.label.includes('%') ? COLORS.teal : COLORS.blue,
                    formatter: (v, ctx) => ctx.dataset.label.includes('%') ? v + '%' : v
                } 
            }, 
            scales: { y: { beginAtZero: true, max: 115 } } 
        }
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

    // Distribution stacked bar with "Visual Floor" for tiny segments
    const distLabels = []; 
    const d100 = []; const d80 = []; const d60 = []; const d40 = [];
    const r100 = []; const r80 = []; const r60 = []; const r40 = []; // Rendering values
    
    modulos.forEach(m => {
        distLabels.push(m.length > 20 ? m.substring(0, 17) + '...' : m);
        const items = modGroup[m];
        const v100 = items.filter(x => x.nota === 100).length;
        const v80 = items.filter(x => x.nota >= 80 && x.nota < 100).length;
        const v60 = items.filter(x => x.nota >= 60 && x.nota < 80).length;
        const v40 = items.filter(x => x.nota < 60).length;
        
        d100.push(v100); d80.push(v80); d60.push(v60); d40.push(v40);
        
        // Use percentages for rendering to ensure consistent bar width across modules
        const total = v100 + v80 + v60 + v40;
        const p100 = total ? (v100 / total * 100) : 0;
        const p80 = total ? (v80 / total * 100) : 0;
        const p60 = total ? (v60 / total * 100) : 0;
        const p40 = total ? (v40 / total * 100) : 0;
        
        const vf = 10; // 10% visual floor for label space
        r100.push(v100 > 0 ? Math.max(p100, vf) : 0);
        r80.push(v80 > 0 ? Math.max(p80, vf) : 0);
        r60.push(v60 > 0 ? Math.max(p60, vf) : 0);
        r40.push(v40 > 0 ? Math.max(p40, vf) : 0);
    });

    makeOrUpdate('chart-modulo-dist', {
        type: 'bar',
        data: { labels: distLabels, datasets: [
            { label: '100 pts', data: r100, realData: d100, backgroundColor: COLORS.teal },
            { label: '80 pts', data: r80, realData: d80, backgroundColor: COLORS.blue },
            { label: '60 pts', data: r60, realData: d60, backgroundColor: COLORS.tealLight },
            { label: '≤40 pts', data: r40, realData: d40, backgroundColor: COLORS.red }
        ] },
        options: { 
            indexAxis: 'y',
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top' }, 
                datalabels: { 
                    display: (ctx) => ctx.dataset.realData[ctx.dataIndex] > 0,
                    color: '#fff',
                    font: { weight: 'bold', size: 10 },
                    formatter: (v, ctx) => ctx.dataset.realData[ctx.dataIndex]
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${ctx.dataset.realData[ctx.dataIndex]}`
                    }
                }
            }, 
            scales: { 
                x: { stacked: true, display: false }, 
                y: { stacked: true } 
            } 
        }
    });
    adjustChartHeight('chart-modulo-dist', distLabels.length);
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
        data: { 
            labels: top10.map(q => splitLabel(q.q, 40)), 
            datasets: [{ data: top10.map(q => q.pctError.toFixed(1)), backgroundColor: topColors, borderRadius: 4 }] 
        },
        options: { 
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    display: true,
                    anchor: 'end',
                    align: 'right',
                    font: { weight: 'bold', size: 10 },
                    color: '#333',
                    formatter: v => v + '%'
                } 
            }, 
            scales: { 
                y: { ticks: { autoSkip: false, maxRotation: 0, font: { size: 9 } } },
                x: { max: 115 } 
            } 
        }
    });
    adjustChartHeight('chart-preguntas-top10', top10.length);

    // Fails by module donut with Visual Floor for labels
    const modFails = {};
    qList.forEach(q => { modFails[q.modulo] = (modFails[q.modulo] || 0) + q.fails; });
    const mfKeys = Object.keys(modFails);
    const realVals = mfKeys.map(k => modFails[k]);
    const totalReal = realVals.reduce((a, b) => a + b, 0);
    
    // Boost small segments for rendering
    const minVal = totalReal * 0.05; // 5% minimum visual slice
    const renderVals = realVals.map(v => v > 0 ? Math.max(v, minVal) : 0);

    const donutColors = [COLORS.yellow, COLORS.red, COLORS.blue, COLORS.teal, COLORS.orange, COLORS.dark, '#9b59b6', '#1abc9c', '#34495e', '#e67e22', '#d35400', '#c0392b'];
    
    makeOrUpdate('chart-preguntas-modulo-donut', {
        type: 'doughnut',
        data: { 
            labels: mfKeys.map(k => k.length > 25 ? k.substring(0, 22) + '...' : k), 
            datasets: [{ 
                data: renderVals, 
                realData: realVals,
                backgroundColor: donutColors.slice(0, mfKeys.length), 
                borderWidth: 1,
                borderColor: '#fff'
            }] 
        },
        options: { 
            responsive: true, 
            cutout: '50%', 
            plugins: { 
                legend: { position: 'right', labels: { font: { size: 9 }, boxWidth: 12 } }, 
                datalabels: { 
                    display: true,
                    color: '#fff',
                    font: { weight: 'bold', size: 10 },
                    formatter: (v, ctx) => {
                        const val = ctx.dataset.realData[ctx.dataIndex];
                        const pctRaw = (val / totalReal * 100);
                        if (pctRaw <= 0) return '';
                        if (pctRaw < 0.95) return '<1%';
                        return Math.round(pctRaw) + '%';
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.dataset.realData[ctx.dataIndex];
                            const pct = (val / totalReal * 100).toFixed(1);
                            return ` ${ctx.label}: ${val} (${pct}%)`;
                        }
                    }
                }
            } 
        }
    });

    // Top 5 bar
    const top5 = qList.slice(0, 5);
    const t5Colors = [COLORS.teal, COLORS.blue, COLORS.yellow, COLORS.orange, COLORS.red];
    makeOrUpdate('chart-preguntas-top5-bar', {
        type: 'bar',
        data: { labels: top5.map(q => splitLabel(q.q, 70)), datasets: [{ data: top5.map(q => q.fails), backgroundColor: t5Colors, borderRadius: 4 }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    anchor: 'end', 
                    align: (ctx) => ctx.dataset.data[ctx.dataIndex] > (Math.max(...top5.map(q => q.fails)) * 0.4) ? 'left' : 'right', 
                    font: { weight: 'bold', size: 10 }, 
                    color: (ctx) => ctx.dataset.data[ctx.dataIndex] > (Math.max(...top5.map(q => q.fails)) * 0.4) ? '#fff' : '#333',
                    formatter: v => v > 0 ? v : ''
                } 
            },
            scales: { 
                y: { ticks: { autoSkip: false, maxRotation: 0, font: { size: 10 } } },
                x: { beginAtZero: true, max: Math.max(...top5.map(q => q.fails)) * 1.25 } 
            }
        }
    });
    adjustChartHeight('chart-preguntas-top5-bar', top5.length);

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
            <td>${i + 1}</td>
            <td><small>${q.modulo}</small></td>
            <td style="max-width:350px; white-space:normal; text-align:left;">${q.q}</td>
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

    adjustChartHeight('chart-cargo-aprob', top.length);
    makeOrUpdate('chart-cargo-aprob', {
        type: 'bar',
        data: { labels: top.map(c => c.cargo), datasets: [{ data: top.map(c => c.pctA.toFixed(1)), backgroundColor: cColors, borderRadius: 4 }] },
        options: { 
            indexAxis: 'y', responsive: true, 
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    display: true,
                    anchor: 'end',
                    align: 'left',
                    font: { weight: 'bold', size: 10 },
                    color: '#fff',
                    formatter: v => v + '%'
                } 
            }, 
            scales: { x: { min: 80, max: 110 } } 
        }
    });

    adjustChartHeight('chart-cargo-nota', top.length);
    makeOrUpdate('chart-cargo-nota', {
        type: 'bar',
        data: { labels: top.map(c => c.cargo), datasets: [{ data: top.map(c => c.nota.toFixed(1)), backgroundColor: COLORS.blue, borderRadius: 4 }] },
        options: { 
            indexAxis: 'y', responsive: true, 
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    display: true,
                    anchor: 'end',
                    align: 'left',
                    font: { weight: 'bold', size: 10 },
                    color: '#fff',
                    formatter: v => v
                } 
            }, 
            scales: { x: { min: 80, max: 110 } } 
        }
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
    const top5DiffReal = top5Diff.map(q => q.pctAcierto);
    const top5DiffRender = top5DiffReal.map(v => Math.max(v, 12)); // 12% min visual width
    const diffColors = [COLORS.red, COLORS.orange, COLORS.yellow, '#f39c12', '#e67e22'];
    
    makeOrUpdate('chart-rend-dificiles', {
        type: 'bar',
        data: {
            labels: top5Diff.map(q => splitLabel(q.q, 35)),
            datasets: [{ 
                label: '% acierto',
                data: top5DiffRender, 
                realData: top5DiffReal,
                backgroundColor: diffColors, 
                borderRadius: 4,
                barThickness: 24 
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    display: true, 
                    anchor: 'end', 
                    align: (ctx) => ctx.dataset.realData[ctx.dataIndex] < 15 ? 'right' : 'left', 
                    color: (ctx) => ctx.dataset.realData[ctx.dataIndex] < 15 ? '#333' : '#fff', 
                    font: { weight: 'bold', size: 10 },
                    formatter: (v, ctx) => ctx.dataset.realData[ctx.dataIndex].toFixed(1) + '%'
                },
                tooltip: {
                    callbacks: {
                        title: (ctx) => top5Diff[ctx[0].dataIndex].q,
                        label: (ctx) => ` ${ctx.dataset.realData[ctx.dataIndex].toFixed(1)}% acierto`
                    }
                }
            },
            scales: { 
                y: { 
                    ticks: { 
                        autoSkip: false,
                        maxRotation: 0,
                        font: { size: 10 }
                    }
                },
                x: { min: 0, max: 115 } 
            }
        }
    });
    adjustChartHeight('chart-rend-dificiles', top5Diff.length);

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
    const top5EasyReal = top5Easy.map(q => q.pctAcierto);
    const top5EasyRender = top5EasyReal.map(v => Math.max(v, 15)); 
    
    makeOrUpdate('chart-rend-faciles', {
        type: 'bar',
        data: {
            labels: top5Easy.map(q => splitLabel(q.q, 35)),
            datasets: [{ 
                label: '% acierto',
                data: top5EasyRender, 
                realData: top5EasyReal,
                backgroundColor: COLORS.teal, 
                borderRadius: 4,
                barThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    display: true, 
                    anchor: 'end', 
                    align: (ctx) => ctx.dataset.realData[ctx.dataIndex] < 15 ? 'right' : 'left', 
                    color: (ctx) => ctx.dataset.realData[ctx.dataIndex] < 15 ? '#333' : '#fff', 
                    font: { weight: 'bold', size: 10 },
                    formatter: (v, ctx) => ctx.dataset.realData[ctx.dataIndex].toFixed(1) + '%'
                },
                tooltip: {
                    callbacks: {
                        title: (ctx) => top5Easy[ctx[0].dataIndex].q,
                        label: (ctx) => ` ${ctx.dataset.realData[ctx.dataIndex].toFixed(1)}% acierto`
                    }
                }
            },
            scales: { 
                y: { 
                    ticks: { 
                        autoSkip: false,
                        maxRotation: 0,
                        font: { size: 10 }
                    }
                },
                x: { min: 0, max: 115 } 
            }
        }
    });
    adjustChartHeight('chart-rend-faciles', top5Easy.length);

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

    // Apto vs Reforzar Donut with Visual Floor
    const totalRend = aptos.length + aReforzar.length;
    const minValRend = totalRend * 0.05;
    const renderDataRend = [
        aptos.length > 0 ? Math.max(aptos.length, minValRend) : 0,
        aReforzar.length > 0 ? Math.max(aReforzar.length, minValRend) : 0
    ];

    makeOrUpdate('chart-rend-apto-donut', {
        type: 'doughnut',
        data: {
            labels: ['Personal Apto ✅', 'Personal a Reforzar ⚠'],
            datasets: [{
                data: renderDataRend,
                realData: [aptos.length, aReforzar.length],
                backgroundColor: [COLORS.teal, COLORS.red],
                borderWidth: 2,
                borderColor: '#fff'
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
                        const val = ctx.dataset.realData[ctx.dataIndex];
                        const pctRaw = (val / totalRend * 100);
                        if (pctRaw <= 0) return '';
                        if (pctRaw < 0.95) return '<1%';
                        return Math.round(pctRaw) + '%';
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.dataset.realData[ctx.dataIndex];
                            const pct = (val / totalRend * 100).toFixed(1);
                            return ` ${ctx.label}: ${val} (${pct}%)`;
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
            labels: repXModArr.map(m => m[0].length > 22 ? m[0].substring(0, 19) + '...' : m[0]),
            datasets: [{
                data: repXModArr.map(m => m[1]),
                backgroundColor: COLORS.red,
                borderRadius: 4,
                barThickness: 16
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { 
                    anchor: 'end', 
                    align: (ctx) => ctx.dataset.data[ctx.dataIndex] > 50 ? 'left' : 'right', 
                    color: (ctx) => ctx.dataset.data[ctx.dataIndex] > 50 ? '#fff' : '#333', 
                    offset: 4,
                    font: { weight: 'bold', size: 10 } 
                }
            },
            scales: { x: { beginAtZero: true, max: Math.max(...repXModArr.map(m => m[1]), 10) * 1.2 } }
        }
    });
    adjustChartHeight('chart-rend-reprobados-modulo', repXModArr.length);

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
                    anchor: 'end', align: 'top', offset: 4, font: { weight: 'bold', size: 10 },
                    formatter: (v) => v > 0 ? v : ''
                }
            },
            scales: {
                y: { beginAtZero: true, max: Math.max(...distCounts) * 1.15 }
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
    adjustChartWidth('chart-sat-modulos', satModArr.length);
    makeOrUpdate('chart-sat-modulos', {
        type: 'bar',
        data: {
            labels: satModArr.map(m => m.modulo.length > 22 ? m.modulo.substring(0, 19) + '...' : m.modulo),
            datasets: [{
                data: satModArr.map(m => m.promedio.toFixed(1)),
                backgroundColor: COLORS.teal,
                borderRadius: 4,
                barThickness: 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
