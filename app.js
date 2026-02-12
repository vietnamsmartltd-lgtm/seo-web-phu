/**
 * SEO Performance Dashboard — Staff Evaluation Focus
 * Tracks: staff pass/fail, keyword accumulation, retention, last rank update
 */

// ============================================
// Configuration
// ============================================
const CONFIG = {
    SHEETS: [
        { name: 'Hikvision', gid: '804549385', color: '#4f6ef7', short: 'HK', domain: 'hikvision247.com', avatar: 'https://s240-25-ava-talk.zadn.vn/12/b5cd3bdca28f91c4fb7eff453f938a58.jpg?key=r6lsk5SM4JnYbEZffjc7jA&time=1776075256' },
        { name: 'ZKTeco', gid: '526294969', color: '#10b981', short: 'ZK', domain: 'zktecovn.com', avatar: 'https://s240-25-ava-talk.zadn.vn/15/10595ab2916bba5fd7d6f83853d219da.jpg?key=RU6j-hoo7cCPzyRAbocCPw&time=1776075297' },
        { name: 'Vnsmart', gid: '1740814124', color: '#f59e0b', short: 'VN', domain: 'vnsmart.com.vn', avatar: 'https://s240-25-ava-talk.zadn.vn/100/94a72ec7f7b7ddb6e5d7cfa9613e27cd.jpg?key=JTn6fBQ8kAShwBkQkBlzKg&time=1776075188' },
        { name: 'Supremainc', gid: '187136415', color: '#8b5cf6', short: 'SU', domain: 'supremainc.vn', avatar: 'https://s240-25-ava-talk.zadn.vn/115/924a1a40b3031d3d146359d1a88087bc.jpg?key=UYTYWNu96Pt5XMVOXt-OZw&time=1776075349' }
    ],
    BASE_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQHmXJl56tO6v1J70LTik9TP9FDLe1gj3ljZdZ6NDUQNsmytVLBpYbCQhmqCv-CvucvZdQxOR9_VaxX/pub',
    PASS_THRESHOLD: 70, // % to pass
    CACHE_KEY: 'seo_dashboard_cache',
    CACHE_TTL: 5 * 60 * 1000,
};

function getFaviconUrl(domain) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

// ============================================
// State
// ============================================
const state = {
    sites: {}, allMonths: [], activeTab: 'overview',
    activeSiteMonths: {}, overviewMonth: null, sortState: {},
};

// ============================================
// CSV Parser & Data
// ============================================
function parseCSV(csvText) {
    const lines = csvText.split('\n').map(l => l.replace(/\r$/, ''));
    const result = [];
    for (const line of lines) {
        const row = []; let inQuotes = false; let cell = '';
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { cell += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) { row.push(cell.trim()); cell = ''; }
            else cell += ch;
        }
        row.push(cell.trim()); result.push(row);
    }
    return result;
}

function detectMonthHeader(row) {
    for (const cell of row) {
        const match = cell.match(/Tháng\s*(\d{1,2})\s*\/\s*(\d{4})/i);
        if (match) return `T${match[1]}/${match[2]}`;
    }
    return null;
}

function parseRankValue(val) {
    if (!val) return null;
    const num = parseInt(val);
    return isNaN(num) ? null : num;
}

function parseSiteData(csvText, sheetConfig) {
    const rows = parseCSV(csvText);
    const site = {
        name: sheetConfig.name, color: sheetConfig.color,
        short: sheetConfig.short, domain: sheetConfig.domain,
        url: '', staff: '', months: {}
    };
    if (rows.length > 0) {
        for (const cell of rows[0]) {
            const urlMatch = cell.match(/https?:\/\/[^\s,]+/);
            if (urlMatch) site.url = urlMatch[0];
        }
        for (let i = 0; i < rows[0].length; i++) {
            if (rows[0][i] === 'Phụ trách' && i + 1 < rows[0].length) site.staff = rows[0][i + 1];
        }
    }
    let currentMonth = null;
    for (let r = 2; r < rows.length; r++) {
        const row = rows[r];
        if (row.every(c => !c)) continue;
        const monthKey = detectMonthHeader(row);
        if (monthKey) { currentMonth = monthKey; if (!site.months[currentMonth]) site.months[currentMonth] = { keywords: [] }; continue; }
        if (!currentMonth) continue;
        const stt = row[0];
        if (!stt && !row[4]) continue;
        const keyword = {
            stt: parseInt(stt) || 0, name: row[1] || '', url: row[2] || '',
            stock: row[3] || '', keyword: row[4] || '',
            initialRank: parseRankValue(row[5]), targetRank: parseRankValue(row[6]),
            currentRank: parseRankValue(row[7]), change: row[8] || '', status: row[9] || ''
        };
        if (keyword.keyword || keyword.name) site.months[currentMonth].keywords.push(keyword);
    }
    return site;
}

async function fetchSheetData(sheetConfig) {
    const url = `${CONFIG.BASE_URL}?gid=${sheetConfig.gid}&single=true&output=csv`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseSiteData(await response.text(), sheetConfig);
    } catch (error) { console.error(`Error fetching ${sheetConfig.name}:`, error); return null; }
}

async function fetchAllData() {
    const loadingBar = document.getElementById('loading-bar');
    for (let i = 0; i < CONFIG.SHEETS.length; i++) {
        const data = await fetchSheetData(CONFIG.SHEETS[i]);
        if (data) state.sites[data.name] = data;
        if (loadingBar) loadingBar.style.width = ((i + 1) / CONFIG.SHEETS.length * 100) + '%';
    }
    const monthSet = new Set();
    Object.values(state.sites).forEach(site => Object.keys(site.months).forEach(m => monthSet.add(m)));
    state.allMonths = Array.from(monthSet).sort((a, b) => {
        const [am, ay] = a.replace('T', '').split('/').map(Number);
        const [bm, by] = b.replace('T', '').split('/').map(Number);
        return (ay * 12 + am) - (by * 12 + bm);
    });
}

// ============================================
// Helpers
// ============================================
function formatPercent(val) { return Math.round(val * 10) / 10 + '%'; }
function getRankClass(rank) {
    if (!rank || rank > 100) return 'out';
    if (rank <= 10) return 'top10';
    if (rank <= 30) return 'top30';
    return 'top100';
}
function getChangeClass(change) { return change === 'Tăng' ? 'tang' : change === 'Giảm' ? 'giam' : 'same'; }
function getChangeIcon(change) { return change === 'Tăng' ? '↑' : change === 'Giảm' ? '↓' : '—'; }

function getMonthStats(site, month) {
    if (!site.months[month]) return { total: 0, achieved: 0, notAchieved: 0, percent: 0 };
    const keywords = site.months[month].keywords;
    const achieved = keywords.filter(k => k.status === 'Đạt').length;
    const total = keywords.length;
    return { total, achieved, notAchieved: total - achieved, percent: total > 0 ? (achieved / total) * 100 : 0 };
}

function getLatestMonthStats(site) {
    const months = Object.keys(site.months);
    if (!months.length) return { total: 0, achieved: 0, notAchieved: 0, percent: 0, month: null };
    const sorted = months.sort((a, b) => {
        const [am, ay] = a.replace('T', '').split('/').map(Number);
        const [bm, by] = b.replace('T', '').split('/').map(Number);
        return (by * 12 + bm) - (ay * 12 + am);
    });
    let latestMonth = sorted[0];
    for (const m of sorted) { if (site.months[m].keywords.length > 0) { latestMonth = m; break; } }
    const stats = getMonthStats({ months: site.months }, latestMonth);
    return { ...stats, month: latestMonth };
}

function getLatestMonthWithData() {
    for (let i = state.allMonths.length - 1; i >= 0; i--) {
        const month = state.allMonths[i];
        for (const site of Object.values(state.sites)) {
            if (site.months[month]?.keywords.length > 0) return month;
        }
    }
    return state.allMonths[state.allMonths.length - 1] || null;
}

function getDefaultReportMonth() {
    const now = new Date();
    let month = now.getMonth(); let year = now.getFullYear();
    if (month === 0) { month = 12; year--; }
    const targetKey = `T${month}/${year}`;
    if (state.allMonths.includes(targetKey)) return targetKey;
    return getLatestMonthWithData();
}

function formatMonthDisplay(monthKey) {
    if (!monthKey) return '—';
    const match = monthKey.match(/T(\d{1,2})\/(\d{4})/);
    if (match) return `Tháng ${match[1].padStart(2, '0')} / ${match[2]}`;
    return monthKey;
}

function formatMonthShort(monthKey) {
    if (!monthKey) return '—';
    const match = monthKey.match(/T(\d{1,2})\/(\d{4})/);
    if (match) return `T${match[1]}/${match[2].slice(2)}`;
    return monthKey;
}

// ============================================
// MiniChart
// ============================================
class MiniChart {
    constructor(canvas) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1; this.resize();
    }
    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.width = rect.width; this.height = rect.height;
        this.canvas.width = this.width * this.dpr; this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = this.width + 'px'; this.canvas.style.height = this.height + 'px';
        this.ctx.scale(this.dpr, this.dpr);
    }
    clear() { this.ctx.clearRect(0, 0, this.width, this.height); }

    drawBarChart(data, options = {}) {
        this.clear(); const ctx = this.ctx;
        const padding = { top: 40, right: 20, bottom: 60, left: 50 };
        const chartW = this.width - padding.left - padding.right;
        const chartH = this.height - padding.top - padding.bottom;
        if (!data.length) return;
        const maxVal = Math.max(...data.map(d => d.total || 0), 1);
        const barWidth = Math.min(56, (chartW / data.length) * 0.6);
        const gap = (chartW - barWidth * data.length) / (data.length + 1);
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(this.width - padding.right, y); ctx.stroke();
            ctx.fillStyle = '#8b95a2'; ctx.font = '11px Inter'; ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 8, y + 4);
        }
        data.forEach((d, i) => {
            const x = padding.left + gap + i * (barWidth + gap);
            const achievedH = (d.achieved / maxVal) * chartH;
            const notAchievedH = ((d.total - d.achieved) / maxVal) * chartH;
            ctx.fillStyle = '#fef2f2';
            roundRect(ctx, x, padding.top + chartH - achievedH - notAchievedH, barWidth, notAchievedH, 6, true);
            ctx.fillStyle = d.color;
            roundRect(ctx, x, padding.top + chartH - achievedH, barWidth, achievedH, 6, true);
            ctx.fillStyle = '#1a1d23'; ctx.font = 'bold 12px Inter'; ctx.textAlign = 'center';
            const pct = d.total > 0 ? (d.achieved / d.total) * 100 : 0;
            ctx.fillText(formatPercent(pct), x + barWidth / 2, padding.top + chartH - achievedH - notAchievedH - 8);
            ctx.fillStyle = '#5f6872'; ctx.font = '12px Inter';
            ctx.fillText(d.label, x + barWidth / 2, this.height - padding.bottom + 20);
        });
        const legendY = this.height - 8;
        ctx.font = '11px Inter'; ctx.textAlign = 'left';
        ctx.fillStyle = '#10b981'; ctx.fillRect(this.width / 2 - 70, legendY - 8, 10, 10);
        ctx.fillStyle = '#5f6872'; ctx.fillText('Đạt', this.width / 2 - 56, legendY);
        ctx.fillStyle = '#fef2f2'; ctx.fillRect(this.width / 2 + 10, legendY - 8, 10, 10);
        ctx.strokeStyle = '#e5e7eb'; ctx.strokeRect(this.width / 2 + 10, legendY - 8, 10, 10);
        ctx.fillStyle = '#5f6872'; ctx.fillText('Chưa đạt', this.width / 2 + 24, legendY);
    }

    drawLineChart(datasets, labels, options = {}) {
        this.clear(); const ctx = this.ctx;
        const padding = { top: 20, right: 20, bottom: 50, left: 50 };
        const chartW = this.width - padding.left - padding.right;
        const chartH = this.height - padding.top - padding.bottom;
        if (!labels.length || !datasets.length) return;
        let maxVal = 0;
        datasets.forEach(ds => { ds.data.forEach(v => { if (v > maxVal) maxVal = v; }); });
        maxVal = Math.max(maxVal, 1); maxVal = Math.ceil(maxVal / 10) * 10;
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(this.width - padding.right, y); ctx.stroke();
            ctx.fillStyle = '#8b95a2'; ctx.font = '11px Inter'; ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 8, y + 4);
        }
        const stepX = chartW / Math.max(labels.length - 1, 1);
        labels.forEach((label, i) => {
            const x = padding.left + i * stepX;
            ctx.fillStyle = '#5f6872'; ctx.font = '11px Inter'; ctx.textAlign = 'center';
            ctx.fillText(label, x, this.height - padding.bottom + 20);
        });
        datasets.forEach(ds => {
            ctx.beginPath(); ctx.strokeStyle = ds.color; ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ds.data.forEach((val, i) => {
                const x = padding.left + i * stepX;
                const y = padding.top + chartH - (val / maxVal) * chartH;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            const lastI = ds.data.length - 1;
            ctx.lineTo(padding.left + lastI * stepX, padding.top + chartH);
            ctx.lineTo(padding.left, padding.top + chartH); ctx.closePath();
            const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
            gradient.addColorStop(0, ds.color + '18'); gradient.addColorStop(1, ds.color + '00');
            ctx.fillStyle = gradient; ctx.fill();
            ds.data.forEach((val, i) => {
                const x = padding.left + i * stepX;
                const y = padding.top + chartH - (val / maxVal) * chartH;
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff'; ctx.fill();
                ctx.lineWidth = 2.5; ctx.strokeStyle = ds.color; ctx.stroke();
            });
        });
    }
}

function roundRect(ctx, x, y, w, h, r, fill) {
    if (h <= 0) return; r = Math.min(r, h / 2, w / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    if (fill) ctx.fill();
}

// ============================================
// Rendering
// ============================================
function renderApp() {
    renderNavTabs(); renderOverview(); renderSiteTabs(); setupEventListeners();
}

function renderNavTabs() {
    const nav = document.querySelector('.nav-tabs-inner');
    nav.querySelectorAll('.tab-btn:not([data-tab="overview"])').forEach(b => b.remove());
    CONFIG.SHEETS.forEach(sheet => {
        const site = state.sites[sheet.name]; if (!site) return;
        const btn = document.createElement('button');
        btn.className = 'tab-btn'; btn.dataset.tab = sheet.name;
        btn.innerHTML = `<img class="tab-favicon" src="${getFaviconUrl(sheet.domain)}" alt="${sheet.name}" onerror="this.style.display='none'">${sheet.name}<span class="tab-badge">${getLatestMonthStats(site).total}</span>`;
        nav.appendChild(btn);
    });
}

function renderOverview() {
    renderMonthIndicator(); renderKPIStrip(); renderStaffPerformance();
    renderAccumulation(); renderOverallChart(); renderTrendChart(); renderComparison();
}

function renderMonthIndicator() {
    if (!state.overviewMonth) state.overviewMonth = getDefaultReportMonth();
    const monthValueEl = document.getElementById('active-month-value');
    if (monthValueEl) monthValueEl.textContent = formatMonthDisplay(state.overviewMonth);
    const selectEl = document.getElementById('overview-month-select');
    if (selectEl) {
        selectEl.innerHTML = state.allMonths.map(m =>
            `<option value="${m}" ${m === state.overviewMonth ? 'selected' : ''}>${formatMonthDisplay(m)}</option>`
        ).join('');
        selectEl.onchange = (e) => {
            state.overviewMonth = e.target.value;
            refreshOverviewData();
        };
    }
    // Month nav buttons
    document.getElementById('month-prev')?.addEventListener('click', () => {
        const idx = state.allMonths.indexOf(state.overviewMonth);
        if (idx > 0) { state.overviewMonth = state.allMonths[idx - 1]; refreshOverviewData(); }
    });
    document.getElementById('month-next')?.addEventListener('click', () => {
        const idx = state.allMonths.indexOf(state.overviewMonth);
        if (idx < state.allMonths.length - 1) { state.overviewMonth = state.allMonths[idx + 1]; refreshOverviewData(); }
    });
    const chartBadge = document.getElementById('chart-overall-month');
    if (chartBadge) chartBadge.textContent = formatMonthDisplay(state.overviewMonth);
}

function refreshOverviewData() {
    const monthValueEl = document.getElementById('active-month-value');
    if (monthValueEl) monthValueEl.textContent = formatMonthDisplay(state.overviewMonth);
    const selectEl = document.getElementById('overview-month-select');
    if (selectEl) selectEl.value = state.overviewMonth;
    const chartBadge = document.getElementById('chart-overall-month');
    if (chartBadge) chartBadge.textContent = formatMonthDisplay(state.overviewMonth);
    renderKPIStrip(); renderStaffPerformance(); renderOverallChart();
    updateTabBadges();
    syncSiteMonthSelectors();
}

function updateTabBadges() {
    const activeMonth = state.overviewMonth || getLatestMonthWithData();
    CONFIG.SHEETS.forEach(sheet => {
        const site = state.sites[sheet.name]; if (!site) return;
        const stats = getMonthStats(site, activeMonth);
        const badge = document.querySelector(`.tab-btn[data-tab="${sheet.name}"] .tab-badge`);
        if (badge) badge.textContent = stats.total;
    });
}

function syncSiteMonthSelectors() {
    const activeMonth = state.overviewMonth || getLatestMonthWithData();
    CONFIG.SHEETS.forEach(sheet => {
        const site = state.sites[sheet.name]; if (!site) return;
        // Update active month for the site
        state.activeSiteMonths[sheet.name] = activeMonth;
        // Highlight the correct month button
        document.querySelectorAll(`.month-btn[data-site="${sheet.name}"]`).forEach(btn => {
            btn.classList.toggle('active', btn.dataset.month === activeMonth);
        });
        // Re-render insights and keywords table for the new month
        renderInsights(sheet.name, site, activeMonth);
        // Only re-render if toggle is NOT in all-months mode
        const toggleBtn = document.querySelector(`.toggle-all-months-btn[data-site="${sheet.name}"]`);
        if (!toggleBtn || !toggleBtn.classList.contains('active')) {
            renderKeywordsTable(sheet.name, site, activeMonth);
        }
    });
}

// ============================================
// KPI Strip
// ============================================
function renderKPIStrip() {
    const container = document.getElementById('kpi-strip');
    const activeMonth = state.overviewMonth || getLatestMonthWithData();
    let totalKeywords = 0, totalAchieved = 0, totalUp = 0, totalDown = 0;
    Object.values(state.sites).forEach(site => {
        const stats = getMonthStats(site, activeMonth);
        totalKeywords += stats.total; totalAchieved += stats.achieved;
        if (site.months[activeMonth]) {
            site.months[activeMonth].keywords.forEach(k => {
                if (k.change === 'Tăng') totalUp++;
                if (k.change === 'Giảm') totalDown++;
            });
        }
    });
    const overallPercent = totalKeywords > 0 ? (totalAchieved / totalKeywords * 100) : 0;
    let prevPercent = 0;
    const latestIdx = state.allMonths.indexOf(activeMonth);
    if (latestIdx > 0) {
        let pTotal = 0, pAchieved = 0;
        Object.values(state.sites).forEach(site => {
            const pStats = getMonthStats(site, state.allMonths[latestIdx - 1]);
            pTotal += pStats.total; pAchieved += pStats.achieved;
        });
        prevPercent = pTotal > 0 ? (pAchieved / pTotal * 100) : 0;
    }
    const percentDiff = overallPercent - prevPercent;
    const staffPass = CONFIG.SHEETS.filter(s => {
        const site = state.sites[s.name]; if (!site) return false;
        return getMonthStats(site, activeMonth).percent >= CONFIG.PASS_THRESHOLD;
    }).length;

    const cards = [
        { color: 'blue', icon: '📦', value: totalKeywords, label: 'Tổng từ khoá', change: `${Object.keys(state.sites).length} websites`, changeType: 'neutral' },
        { color: 'green', icon: '✅', value: totalAchieved, label: 'Đạt mục tiêu', change: `${formatPercent(overallPercent)} tổng`, changeType: 'up' },
        { color: 'red', icon: '❌', value: totalKeywords - totalAchieved, label: 'Chưa đạt', change: `${formatPercent(100 - overallPercent)} tổng`, changeType: 'down' },
        { color: 'purple', icon: '🎯', value: formatPercent(overallPercent), label: 'Tỷ lệ đạt', change: `${percentDiff >= 0 ? '+' : ''}${formatPercent(percentDiff)} vs trước`, changeType: percentDiff >= 0 ? 'up' : 'down' },
        { color: 'amber', icon: '👨‍💼', value: `${staffPass}/${CONFIG.SHEETS.length}`, label: 'NV đạt KPI', change: `Ngưỡng ≥${CONFIG.PASS_THRESHOLD}%`, changeType: staffPass === CONFIG.SHEETS.length ? 'up' : 'down' },
    ];
    container.innerHTML = cards.map((card, idx) => `
        <div class="kpi-card ${card.color} animate-in" ${idx === 0 ? 'id="kpi-total-keywords" style="cursor:pointer"' : ''}>
            <div class="kpi-icon ${card.color}"><span style="font-size:18px">${card.icon}</span></div>
            <div class="kpi-value">${card.value}</div>
            <div class="kpi-label">${card.label}</div>
            <div class="kpi-change ${card.changeType}">${card.changeType === 'up' ? '↑' : card.changeType === 'down' ? '↓' : '●'} ${card.change}</div>
        </div>
    `).join('');

    // Click total keywords KPI to show all keywords tab
    document.getElementById('kpi-total-keywords')?.addEventListener('click', () => {
        const tabBtn = document.getElementById('tab-btn-all-keywords');
        if (tabBtn) tabBtn.style.display = '';
        renderAllKeywordsTable();
        switchToTab('all-keywords');
    });
}

// ============================================
// Staff Performance Cards — PRIMARY
// ============================================
function renderStaffPerformance() {
    const container = document.getElementById('staff-performance-grid');
    const activeMonth = state.overviewMonth || getLatestMonthWithData();
    const prevMonthIdx = state.allMonths.indexOf(activeMonth) - 1;
    const prevMonth = prevMonthIdx >= 0 ? state.allMonths[prevMonthIdx] : null;
    const circumference = 2 * Math.PI * 42;

    container.innerHTML = CONFIG.SHEETS.map(sheet => {
        const site = state.sites[sheet.name]; if (!site) return '';
        const stats = getMonthStats(site, activeMonth);
        const prevStats = prevMonth ? getMonthStats(site, prevMonth) : { total: 0, achieved: 0, percent: 0 };
        const trend = stats.percent - prevStats.percent;
        const status = stats.percent >= CONFIG.PASS_THRESHOLD ? 'pass' : stats.percent >= 50 ? 'warning' : 'fail';
        const statusLabel = status === 'pass' ? 'ĐẠT KPI' : status === 'warning' ? 'CẬN ĐẠT' : 'CHƯA ĐẠT';
        const statusIcon = status === 'pass' ? '✅' : status === 'warning' ? '⚠️' : '❌';
        const progressColor = status === 'pass' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';
        const progressBg = status === 'pass' ? 'rgba(16,185,129,.12)' : status === 'warning' ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.12)';

        let upCount = 0, downCount = 0;
        if (site.months[activeMonth]) {
            site.months[activeMonth].keywords.forEach(k => {
                if (k.change === 'Tăng') upCount++;
                else if (k.change === 'Giảm') downCount++;
            });
        }

        // Retained keywords check
        let retainedCount = 0, lostCount = 0;
        if (prevMonth && site.months[prevMonth] && site.months[activeMonth]) {
            const prevAchieved = site.months[prevMonth].keywords.filter(k => k.status === 'Đạt').map(k => k.keyword || k.name);
            site.months[activeMonth].keywords.forEach(k => {
                const kw = k.keyword || k.name;
                if (prevAchieved.includes(kw)) {
                    if (k.status === 'Đạt') retainedCount++; else lostCount++;
                }
            });
        }

        return `
            <div class="staff-card ${status} animate-in" data-tab="${sheet.name}" title="Bấm để xem chi tiết ${sheet.name}">
                <div class="staff-card-top">
                    <div class="staff-card-identity">
                        <div class="staff-avatar" style="background:${sheet.color}">
                            <img class="staff-photo" src="${sheet.avatar}" alt="${site.staff || sheet.short}" onerror="this.style.display='none';this.parentElement.textContent='${sheet.short}'">
                        </div>
                        <div class="staff-info">
                            <h3>${site.staff || 'N/A'}</h3>
                            <span class="staff-site"><img src="${getFaviconUrl(sheet.domain)}" style="width:14px;height:14px;border-radius:3px;vertical-align:middle;margin-right:4px" onerror="this.style.display='none'">${sheet.name}</span>
                        </div>
                    </div>
                    <div class="staff-card-badge ${status}">${statusIcon} ${statusLabel}</div>
                </div>

                <div class="staff-percent-block">
                    <div class="staff-percent-header">
                        <span class="staff-percent-big" style="color:${progressColor}">${formatPercent(stats.percent)}</span>
                        <span class="staff-percent-trend" style="color:${trend >= 0 ? '#10b981' : '#ef4444'}">${trend >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(trend * 10) / 10)}%</span>
                    </div>
                    <div class="staff-progress-bar">
                        <div class="staff-progress-track" style="background:${progressBg}">
                            <div class="staff-progress-fill" style="width:${Math.min(stats.percent, 100)}%;background:${progressColor}"></div>
                        </div>
                        <div class="staff-progress-labels">
                            <span>${stats.achieved} đạt</span>
                            <span>${stats.total} tổng</span>
                        </div>
                    </div>
                </div>

                <div class="staff-mini-stats">
                    <div class="staff-mini-stat">
                        <span class="sms-value success">+${upCount}</span>
                        <span class="sms-label">Tăng</span>
                    </div>
                    <div class="staff-mini-stat">
                        <span class="sms-value error">-${downCount}</span>
                        <span class="sms-label">Giảm</span>
                    </div>
                    <div class="staff-mini-stat">
                        <span class="sms-value ${lostCount > 0 ? 'error' : 'success'}">${retainedCount}/${retainedCount + lostCount || 0}</span>
                        <span class="sms-label">Bảo toàn</span>
                    </div>
                    <div class="staff-mini-stat">
                        <span class="sms-value" style="font-size:18px">${stats.percent >= CONFIG.PASS_THRESHOLD ? '🏆' : '⚠️'}</span>
                        <span class="sms-label">Thưởng</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.staff-card[data-tab]').forEach(card => {
        card.addEventListener('click', () => switchToTab(card.dataset.tab));
    });
}

// ============================================
// Accumulation — Monthly Keywords Timeline
// ============================================
function renderAccumulation() {
    const container = document.getElementById('accumulation-grid');
    container.innerHTML = CONFIG.SHEETS.map(sheet => {
        const site = state.sites[sheet.name]; if (!site) return '';
        const months = state.allMonths.filter(m => site.months[m]?.keywords.length > 0);
        if (!months.length) return '';
        // Reverse so newest month is first in display, but keep original order for comparison logic
        const monthsForDisplay = [...months].reverse();
        const maxTotal = Math.max(...months.map(m => getMonthStats(site, m).total), 1);

        let timelineHTML = monthsForDisplay.map((m) => {
            const stats = getMonthStats(site, m);
            const barW = Math.max((stats.total / maxTotal) * 100, 15);
            const achievedPct = stats.total > 0 ? (stats.achieved / stats.total) * 100 : 0;
            const barColor = achievedPct >= 70 ? '#10b981' : achievedPct >= 50 ? '#f59e0b' : '#ef4444';

            // Find original index for prev month comparison
            const origIdx = months.indexOf(m);

            // Keyword drop/retention calculation
            let droppedKeywords = 0, retainedKeywords = 0, newKeywords = 0;
            if (origIdx > 0) {
                const prevMonthKey = months[origIdx - 1];
                const prevKwAchieved = site.months[prevMonthKey]
                    ? site.months[prevMonthKey].keywords.filter(k => k.status === 'Đạt').map(k => k.keyword || k.name)
                    : [];
                const currentKws = site.months[m].keywords;
                const currentKwNames = currentKws.map(k => k.keyword || k.name);

                // Check which previously achieved keywords are now not achieved or missing
                prevKwAchieved.forEach(kw => {
                    const found = currentKws.find(ck => (ck.keyword || ck.name) === kw);
                    if (!found || found.status !== 'Đạt') droppedKeywords++;
                    else retainedKeywords++;
                });
                // New achieved keywords not in previous achieved list
                currentKws.filter(k => k.status === 'Đạt').forEach(k => {
                    if (!prevKwAchieved.includes(k.keyword || k.name)) newKeywords++;
                });
            } else {
                // First month — no previous data, dropped = 0
                droppedKeywords = 0;
                retainedKeywords = 0;
                newKeywords = stats.achieved;
            }

            const isActive = m === state.overviewMonth;
            return `
                <div class="accumulation-month ${isActive ? 'active-month' : ''}">
                    <span class="accum-month-label">${formatMonthShort(m)}</span>
                    <div class="accum-bar-wrap">
                        <div class="accum-bar-fill" style="width:${achievedPct}%;background:${barColor}">
                            ${achievedPct > 20 ? `<span class="accum-bar-text">${stats.achieved}</span>` : ''}
                        </div>
                    </div>
                    <div class="accum-detail">
                        <span class="accum-ratio">${stats.achieved}/${stats.total}</span>
                        <div class="accum-kw-changes">
                            ${newKeywords > 0 ? `<span class="accum-tag new">+${newKeywords} mới</span>` : ''}
                            ${retainedKeywords > 0 ? `<span class="accum-tag kept">✓${retainedKeywords} giữ</span>` : ''}
                            <span class="accum-tag ${droppedKeywords > 0 ? 'dropped' : 'safe'}">${droppedKeywords > 0 ? '↓' + droppedKeywords + ' tụt' : '0 tụt'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Summary stats for card header
        const latestStats = getMonthStats(site, months[months.length - 1]);
        return `
            <div class="accumulation-card animate-in">
                <div class="accumulation-card-header">
                    <img src="${getFaviconUrl(sheet.domain)}" alt="${sheet.name}" onerror="this.style.display='none'">
                    <div class="accum-header-text">
                        <h4>${sheet.name}</h4>
                        <span class="accum-staff">${site.staff || 'N/A'}</span>
                    </div>
                    <span class="accum-header-pct" style="color:${latestStats.percent >= 70 ? '#10b981' : latestStats.percent >= 50 ? '#f59e0b' : '#ef4444'}">${formatPercent(latestStats.percent)}</span>
                </div>
                <div class="accumulation-timeline">${timelineHTML}</div>
            </div>
        `;
    }).join('');
}

// ============================================
// Charts
// ============================================
function renderOverallChart() {
    const canvas = document.getElementById('canvas-overall'); if (!canvas) return;
    const chart = new MiniChart(canvas);
    const activeMonth = state.overviewMonth || getLatestMonthWithData();
    const data = CONFIG.SHEETS.map(sheet => {
        const site = state.sites[sheet.name]; if (!site) return null;
        const stats = getMonthStats(site, activeMonth);
        return { label: sheet.name, total: stats.total, achieved: stats.achieved, color: sheet.color };
    }).filter(d => d && d.total > 0);
    chart.drawBarChart(data);
    window.addEventListener('resize', () => { chart.resize(); chart.drawBarChart(data); });
}

function renderTrendChart() {
    const canvas = document.getElementById('canvas-trend'); if (!canvas) return;
    const chart = new MiniChart(canvas);
    const labels = state.allMonths;
    const datasets = CONFIG.SHEETS.map(sheet => {
        const site = state.sites[sheet.name]; if (!site) return null;
        return { label: sheet.name, color: sheet.color, data: state.allMonths.map(m => getMonthStats(site, m).percent) };
    }).filter(Boolean);
    chart.drawLineChart(datasets, labels);
    const legendEl = document.getElementById('trend-legend');
    legendEl.innerHTML = datasets.map(ds => `<span class="legend-item"><span class="legend-dot" style="background:${ds.color}"></span>${ds.label}</span>`).join('');
    window.addEventListener('resize', () => { chart.resize(); chart.drawLineChart(datasets, labels); });
}

function renderComparison() {
    const select1 = document.getElementById('compare-month-1');
    const select2 = document.getElementById('compare-month-2');
    const optionsHTML = state.allMonths.map(m => `<option value="${m}">${formatMonthDisplay(m)}</option>`).join('');
    select1.innerHTML = optionsHTML; select2.innerHTML = optionsHTML;
    const latestData = getLatestMonthWithData();
    const latestIdx = state.allMonths.indexOf(latestData);
    if (latestIdx > 0) { select1.value = state.allMonths[latestIdx - 1]; select2.value = latestData; }
    else if (state.allMonths.length >= 2) { select1.value = state.allMonths[state.allMonths.length - 2]; select2.value = state.allMonths[state.allMonths.length - 1]; }
    updateComparison();
    select1.addEventListener('change', updateComparison);
    select2.addEventListener('change', updateComparison);
}

function updateComparison() {
    const month1 = document.getElementById('compare-month-1').value;
    const month2 = document.getElementById('compare-month-2').value;
    const grid = document.getElementById('comparison-grid');
    grid.innerHTML = CONFIG.SHEETS.map(sheet => {
        const site = state.sites[sheet.name]; if (!site) return '';
        const stats1 = getMonthStats(site, month1); const stats2 = getMonthStats(site, month2);
        const diff = stats2.achieved - stats1.achieved;
        const percentDiff = stats2.percent - stats1.percent;
        const barColor = stats2.percent >= 70 ? '#10b981' : stats2.percent >= 50 ? '#f59e0b' : '#ef4444';
        return `
            <div class="comparison-card animate-in">
                <div class="comparison-card-header">
                    <img class="comparison-site-favicon" src="${getFaviconUrl(sheet.domain)}" alt="${sheet.name}" onerror="this.style.display='none'">
                    <div class="comparison-site-name">${sheet.name}</div>
                </div>
                <div class="comparison-stats">
                    <div class="comparison-stat"><div class="comparison-stat-label">${formatMonthDisplay(month1)}</div><div class="comparison-stat-value">${stats1.achieved}/${stats1.total}</div></div>
                    <div class="comparison-stat"><div class="comparison-stat-label">${formatMonthDisplay(month2)}</div><div class="comparison-stat-value">${stats2.achieved}/${stats2.total}</div></div>
                    <div class="comparison-stat"><div class="comparison-stat-label">Thay đổi</div><div class="comparison-stat-value ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff}</div></div>
                    <div class="comparison-stat"><div class="comparison-stat-label">% Thay đổi</div><div class="comparison-stat-value ${percentDiff >= 0 ? 'up' : 'down'}">${percentDiff >= 0 ? '+' : ''}${formatPercent(percentDiff)}</div></div>
                </div>
                <div class="comparison-bar"><div class="comparison-bar-track"><div class="comparison-bar-fill" style="width:${stats2.percent}%;background:${barColor}"></div></div>
                <div class="comparison-bar-label"><span style="color:#8b95a2;font-weight:600">${formatPercent(stats1.percent)}</span><span style="color:${barColor};font-weight:700">${formatPercent(stats2.percent)}</span></div></div>
            </div>
        `;
    }).join('');
}

// ============================================
// Site Detail Tabs
// ============================================
function renderSiteTabs() {
    const mainContent = document.getElementById('main-content');
    CONFIG.SHEETS.forEach(sheet => {
        const site = state.sites[sheet.name]; if (!site) return;
        const months = Object.keys(site.months).sort((a, b) => {
            const [am, ay] = a.replace('T', '').split('/').map(Number);
            const [bm, by] = b.replace('T', '').split('/').map(Number);
            return (by * 12 + bm) - (ay * 12 + am);
        });
        let latestMonth = months[0] || '';
        for (const m of months) { if (site.months[m].keywords.length > 0) { latestMonth = m; break; } }
        state.activeSiteMonths[sheet.name] = latestMonth;
        const section = document.createElement('section');
        section.id = `tab-${sheet.name}`; section.className = 'tab-panel';
        section.innerHTML = `
            <div class="website-header">
                <img class="website-favicon" src="${getFaviconUrl(sheet.domain)}" alt="${sheet.name}" onerror="this.style.display='none'">
                <div class="website-meta">
                    <h2>${sheet.name}</h2>
                    <a href="${site.url}" target="_blank">${site.url}</a>
                    <div class="website-meta-stats">
                        <span class="website-meta-stat">👤 <strong>${site.staff}</strong></span>
                        <span class="website-meta-stat">📦 <strong>${getLatestMonthStats(site).total}</strong> từ khoá</span>
                        <span class="website-meta-stat">✅ <strong>${getLatestMonthStats(site).achieved}</strong> đạt</span>
                    </div>
                </div>
            </div>
            <div class="insights-grid" id="insights-${sheet.name}"></div>
            <div class="month-selector-row">
                <div class="month-selector" id="months-${sheet.name}">
                    ${months.map(m => `<button class="month-btn ${m === latestMonth ? 'active' : ''}" data-month="${m}" data-site="${sheet.name}">${m}</button>`).join('')}
                </div>
                <button class="toggle-all-months-btn" data-site="${sheet.name}" title="Xem tất cả các tháng">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
                    Tất cả tháng
                </button>
            </div>
            <div class="keywords-table-wrapper">
                <div class="table-toolbar">
                    <div class="table-search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input type="text" placeholder="Tìm từ khoá..." id="search-${sheet.name}" data-site="${sheet.name}">
                    </div>
                    <div class="table-filters">
                        <button class="filter-btn active" data-filter="all" data-site="${sheet.name}">Tất cả</button>
                        <button class="filter-btn" data-filter="dat" data-site="${sheet.name}">✅ Đạt</button>
                        <button class="filter-btn" data-filter="chua-dat" data-site="${sheet.name}">❌ Chưa đạt</button>
                        <button class="filter-btn" data-filter="tang" data-site="${sheet.name}">↑ Tăng</button>
                        <button class="filter-btn" data-filter="giam" data-site="${sheet.name}">↓ Giảm</button>
                    </div>
                </div>
                <div class="table-scroll"><table class="keywords-table"><thead><tr>
                    <th>#</th><th>Từ khoá / Sản phẩm</th><th>URL</th>
                    <th class="sortable-th" data-sort="initialRank" data-site="${sheet.name}">Ban đầu <span class="sort-icon">⇅</span></th>
                    <th class="sortable-th" data-sort="targetRank" data-site="${sheet.name}">Dự kiến <span class="sort-icon">⇅</span></th>
                    <th class="sortable-th" data-sort="currentRank" data-site="${sheet.name}">Hiện tại <span class="sort-icon">⇅</span></th>
                    <th>Thay đổi</th><th>Đánh giá</th>
                </tr></thead><tbody id="tbody-${sheet.name}"></tbody></table></div>
            </div>
        `;
        mainContent.appendChild(section);
        renderInsights(sheet.name, site, latestMonth);
        renderKeywordsTable(sheet.name, site, latestMonth);
    });
}

function renderInsights(siteName, site, month) {
    const container = document.getElementById(`insights-${siteName}`); if (!site.months[month]) return;
    const keywords = site.months[month].keywords;
    const topPerformers = keywords.filter(k => k.status === 'Đạt' && k.currentRank).sort((a, b) => (a.currentRank || 999) - (b.currentRank || 999)).slice(0, 5);
    const mostImproved = keywords.filter(k => k.initialRank && k.currentRank && k.change === 'Tăng').sort((a, b) => ((b.initialRank || 0) - (b.currentRank || 0)) - ((a.initialRank || 0) - (a.currentRank || 0))).slice(0, 5);
    const needsAttention = keywords.filter(k => k.status === 'Chưa đạt' && k.currentRank).sort((a, b) => (a.currentRank || 999) - (b.currentRank || 999)).slice(0, 5);
    const makeList = (items, type) => items.length ? items.map(k => `<li><span class="insight-keyword">${k.keyword || k.name}</span><span class="insight-rank ${type === 'rank' ? `rank-badge ${getRankClass(k.currentRank)}` : ''}" ${type === 'improve' ? 'style="color:#10b981"' : ''}>${type === 'improve' ? `${k.initialRank} → ${k.currentRank}` : `#${k.currentRank}`}</span></li>`).join('') : '<li style="color:#b0b8c4;justify-content:center">Không có dữ liệu</li>';
    container.innerHTML = `
        <div class="insight-card"><div class="insight-card-title"><span>🏆</span> Top đạt mục tiêu</div><ul class="insight-list">${makeList(topPerformers, 'rank')}</ul></div>
        <div class="insight-card"><div class="insight-card-title"><span>📈</span> Tăng hạng nhiều nhất</div><ul class="insight-list">${makeList(mostImproved, 'improve')}</ul></div>
        <div class="insight-card"><div class="insight-card-title"><span>⚠️</span> Cần chú ý</div><ul class="insight-list">${makeList(needsAttention, 'rank')}</ul></div>
    `;
}

function renderKeywordsTable(siteName, site, month, filter = 'all', search = '', sortKey = null, sortDir = 'asc') {
    const tbody = document.getElementById(`tbody-${siteName}`);
    if (!site.months[month]) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><p>Không có dữ liệu cho tháng này</p></td></tr>'; return; }
    let keywords = [...site.months[month].keywords];
    if (filter === 'dat') keywords = keywords.filter(k => k.status === 'Đạt');
    if (filter === 'chua-dat') keywords = keywords.filter(k => k.status === 'Chưa đạt');
    if (filter === 'tang') keywords = keywords.filter(k => k.change === 'Tăng');
    if (filter === 'giam') keywords = keywords.filter(k => k.change === 'Giảm');
    if (search) { const q = search.toLowerCase(); keywords = keywords.filter(k => (k.keyword?.toLowerCase().includes(q)) || (k.name?.toLowerCase().includes(q))); }
    if (sortKey) keywords.sort((a, b) => { const aV = a[sortKey] ?? 9999, bV = b[sortKey] ?? 9999; return sortDir === 'asc' ? aV - bV : bV - aV; });
    tbody.innerHTML = keywords.map((k, i) => {
        const displayName = k.keyword || k.name;
        const displayUrl = k.url ? new URL(k.url).pathname : '';
        const progressWidth = k.currentRank ? Math.max(0, 100 - k.currentRank) : 0;
        const progressColor = k.currentRank <= 10 ? '#10b981' : k.currentRank <= 30 ? '#f59e0b' : '#ef4444';
        return `<tr>
            <td style="color:#b0b8c4;font-size:12px">${k.stt || i + 1}</td>
            <td><div class="keyword-name" title="${displayName}">${displayName}</div></td>
            <td>${k.url ? `<a href="${k.url}" target="_blank" class="keyword-url" title="${k.url}">${displayUrl}</a>` : '—'}</td>
            <td><span class="rank-badge ${getRankClass(k.initialRank)}">${k.initialRank !== null ? '#' + k.initialRank : '—'}</span></td>
            <td><span class="rank-badge top10">${k.targetRank !== null ? '#' + k.targetRank : '—'}</span></td>
            <td><span class="rank-badge ${getRankClass(k.currentRank)}">${k.currentRank !== null ? '#' + k.currentRank : '—'}</span>
            ${k.currentRank && k.currentRank < 100 ? `<div class="mini-progress"><div class="mini-progress-fill" style="width:${progressWidth}%;background:${progressColor}"></div></div>` : ''}</td>
            <td><span class="change-badge ${getChangeClass(k.change)}">${getChangeIcon(k.change)} ${k.change || '—'}</span></td>
            <td><span class="status-badge ${k.status === 'Đạt' ? 'dat' : 'chua-dat'}">${k.status === 'Đạt' ? '✅' : '❌'} ${k.status || '—'}</span></td>
        </tr>`;
    }).join('');
}

// ============================================
// All Keywords Table (cross-site)
// ============================================
function renderAllKeywordsTable(filter = 'all', search = '') {
    const activeMonth = state.overviewMonth || getLatestMonthWithData();
    document.getElementById('all-kw-month-label').textContent = formatMonthDisplay(activeMonth);

    let allKws = [];
    CONFIG.SHEETS.forEach(sheet => {
        const site = state.sites[sheet.name]; if (!site || !site.months[activeMonth]) return;
        site.months[activeMonth].keywords.forEach(k => {
            allKws.push({ ...k, siteName: sheet.name, siteColor: sheet.color, siteDomain: sheet.domain, staff: site.staff || 'N/A' });
        });
    });

    const totalAll = allKws.length;
    const achievedAll = allKws.filter(k => k.status === 'Đạt').length;
    document.getElementById('all-kw-total').textContent = totalAll;
    document.getElementById('all-kw-achieved').textContent = achievedAll;
    document.getElementById('all-kw-not').textContent = totalAll - achievedAll;

    if (filter === 'dat') allKws = allKws.filter(k => k.status === 'Đạt');
    if (filter === 'chua-dat') allKws = allKws.filter(k => k.status === 'Chưa đạt');
    if (filter === 'tang') allKws = allKws.filter(k => k.change === 'Tăng');
    if (filter === 'giam') allKws = allKws.filter(k => k.change === 'Giảm');
    if (search) { const q = search.toLowerCase(); allKws = allKws.filter(k => (k.keyword?.toLowerCase().includes(q)) || (k.name?.toLowerCase().includes(q)) || k.siteName.toLowerCase().includes(q) || k.staff.toLowerCase().includes(q)); }

    const tbody = document.getElementById('tbody-all-keywords');
    tbody.innerHTML = allKws.map((k, i) => {
        const displayName = k.keyword || k.name;
        const displayUrl = k.url ? new URL(k.url).pathname : '';
        const progressWidth = k.currentRank ? Math.max(0, 100 - k.currentRank) : 0;
        const progressColor = k.currentRank <= 10 ? '#10b981' : k.currentRank <= 30 ? '#f59e0b' : '#ef4444';
        return `<tr>
            <td style="color:#b0b8c4;font-size:12px">${i + 1}</td>
            <td><div class="keyword-name" title="${displayName}">${displayName}</div></td>
            <td><span class="site-label"><img src="${getFaviconUrl(k.siteDomain)}" style="width:14px;height:14px;border-radius:3px;vertical-align:middle;margin-right:4px" onerror="this.style.display='none'">${k.siteName}</span></td>
            <td><span style="font-size:12px;color:var(--text-secondary)">${k.staff}</span></td>
            <td>${k.url ? `<a href="${k.url}" target="_blank" class="keyword-url" title="${k.url}">${displayUrl}</a>` : '—'}</td>
            <td><span class="rank-badge ${getRankClass(k.initialRank)}">${k.initialRank !== null ? '#' + k.initialRank : '—'}</span></td>
            <td><span class="rank-badge top10">${k.targetRank !== null ? '#' + k.targetRank : '—'}</span></td>
            <td><span class="rank-badge ${getRankClass(k.currentRank)}">${k.currentRank !== null ? '#' + k.currentRank : '—'}</span>
            ${k.currentRank && k.currentRank < 100 ? `<div class="mini-progress"><div class="mini-progress-fill" style="width:${progressWidth}%;background:${progressColor}"></div></div>` : ''}</td>
            <td><span class="change-badge ${getChangeClass(k.change)}">${getChangeIcon(k.change)} ${k.change || '—'}</span></td>
            <td><span class="status-badge ${k.status === 'Đạt' ? 'dat' : 'chua-dat'}">${k.status === 'Đạt' ? '✅' : '❌'} ${k.status || '—'}</span></td>
        </tr>`;
    }).join('');
}

// ============================================
// All Months Table for a site
// ============================================
function renderAllMonthsTable(siteName) {
    const site = state.sites[siteName]; if (!site) return;
    const sheet = CONFIG.SHEETS.find(s => s.name === siteName);
    const months = Object.keys(site.months).sort((a, b) => {
        const [am, ay] = a.replace('T', '').split('/').map(Number);
        const [bm, by] = b.replace('T', '').split('/').map(Number);
        return (by * 12 + bm) - (ay * 12 + am); // newest first
    }).filter(m => site.months[m].keywords.length > 0);

    const tbody = document.getElementById(`tbody-${siteName}`);
    let counter = 0;
    let html = '';
    months.forEach(m => {
        const keywords = site.months[m].keywords;
        const achieved = keywords.filter(k => k.status === 'Đạt').length;
        html += `<tr class="month-divider-row"><td colspan="8"><div class="month-divider-label">
            <span class="month-divider-tag">${m}</span>
            <span class="month-divider-stats">${achieved}/${keywords.length} đạt — ${formatPercent(keywords.length > 0 ? achieved / keywords.length * 100 : 0)}</span>
        </div></td></tr>`;
        keywords.forEach(k => {
            counter++;
            const displayName = k.keyword || k.name;
            const displayUrl = k.url ? new URL(k.url).pathname : '';
            const progressWidth = k.currentRank ? Math.max(0, 100 - k.currentRank) : 0;
            const progressColor = k.currentRank <= 10 ? '#10b981' : k.currentRank <= 30 ? '#f59e0b' : '#ef4444';
            html += `<tr>
                <td style="color:#b0b8c4;font-size:12px">${counter}</td>
                <td><div class="keyword-name" title="${displayName}">${displayName}</div></td>
                <td>${k.url ? `<a href="${k.url}" target="_blank" class="keyword-url" title="${k.url}">${displayUrl}</a>` : '—'}</td>
                <td><span class="rank-badge ${getRankClass(k.initialRank)}">${k.initialRank !== null ? '#' + k.initialRank : '—'}</span></td>
                <td><span class="rank-badge top10">${k.targetRank !== null ? '#' + k.targetRank : '—'}</span></td>
                <td><span class="rank-badge ${getRankClass(k.currentRank)}">${k.currentRank !== null ? '#' + k.currentRank : '—'}</span>
                ${k.currentRank && k.currentRank < 100 ? `<div class="mini-progress"><div class="mini-progress-fill" style="width:${progressWidth}%;background:${progressColor}"></div></div>` : ''}</td>
                <td><span class="change-badge ${getChangeClass(k.change)}">${getChangeIcon(k.change)} ${k.change || '—'}</span></td>
                <td><span class="status-badge ${k.status === 'Đạt' ? 'dat' : 'chua-dat'}">${k.status === 'Đạt' ? '✅' : '❌'} ${k.status || '—'}</span></td>
            </tr>`;
        });
    });
    tbody.innerHTML = html;
}

// ============================================
// Tab Navigation
// ============================================
function switchToTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`)?.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`tab-${tabName}`);
    if (panel) { panel.classList.add('active'); panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    state.activeTab = tabName;
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchToTab(btn.dataset.tab)));
    document.querySelectorAll('.month-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const siteName = btn.dataset.site, month = btn.dataset.month;
            document.querySelectorAll(`.month-btn[data-site="${siteName}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active'); state.activeSiteMonths[siteName] = month;
            renderInsights(siteName, state.sites[siteName], month);
            renderKeywordsTable(siteName, state.sites[siteName], month);
        });
    });
    document.querySelectorAll('input[id^="search-"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const siteName = e.target.dataset.site, site = state.sites[siteName], month = state.activeSiteMonths[siteName];
            const filter = document.querySelector(`.filter-btn.active[data-site="${siteName}"]`)?.dataset.filter || 'all';
            renderKeywordsTable(siteName, site, month, filter, e.target.value);
        });
    });
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const siteName = btn.dataset.site;
            document.querySelectorAll(`.filter-btn[data-site="${siteName}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (siteName === 'all-keywords') {
                renderAllKeywordsTable(btn.dataset.filter, document.getElementById('search-all-keywords')?.value || '');
            } else {
                const site = state.sites[siteName], month = state.activeSiteMonths[siteName];
                renderKeywordsTable(siteName, site, month, btn.dataset.filter, document.getElementById(`search-${siteName}`)?.value || '');
            }
        });
    });

    // All keywords search
    document.getElementById('search-all-keywords')?.addEventListener('input', (e) => {
        const filter = document.querySelector('.filter-btn.active[data-site="all-keywords"]')?.dataset.filter || 'all';
        renderAllKeywordsTable(filter, e.target.value);
    });

    // All months toggle buttons
    document.querySelectorAll('.toggle-all-months-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const siteName = btn.dataset.site;
            const isActive = btn.classList.toggle('active');
            const monthSelector = document.getElementById(`months-${siteName}`);
            if (isActive) {
                // Show all months
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg> Một tháng`;
                monthSelector.style.opacity = '0.4';
                monthSelector.style.pointerEvents = 'none';
                renderAllMonthsTable(siteName);
            } else {
                // Back to single month
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg> Tất cả tháng`;
                monthSelector.style.opacity = '';
                monthSelector.style.pointerEvents = '';
                const month = state.activeSiteMonths[siteName];
                renderKeywordsTable(siteName, state.sites[siteName], month);
            }
        });
    });
    document.querySelectorAll('.sortable-th').forEach(th => {
        th.style.cursor = 'pointer'; th.style.userSelect = 'none';
        th.addEventListener('click', () => {
            const siteName = th.dataset.site, sortKey = th.dataset.sort;
            if (!state.sortState[siteName] || state.sortState[siteName].key !== sortKey) state.sortState[siteName] = { key: sortKey, dir: 'asc' };
            else state.sortState[siteName].dir = state.sortState[siteName].dir === 'asc' ? 'desc' : 'asc';
            document.querySelectorAll(`.sortable-th[data-site="${siteName}"] .sort-icon`).forEach(icon => { icon.textContent = '⇅'; icon.style.color = ''; });
            const activeIcon = th.querySelector('.sort-icon');
            if (activeIcon) { activeIcon.textContent = state.sortState[siteName].dir === 'asc' ? '↑' : '↓'; activeIcon.style.color = '#4f6ef7'; }
            const site = state.sites[siteName], month = state.activeSiteMonths[siteName];
            const filter = document.querySelector(`.filter-btn.active[data-site="${siteName}"]`)?.dataset.filter || 'all';
            renderKeywordsTable(siteName, site, month, filter, document.getElementById(`search-${siteName}`)?.value || '', state.sortState[siteName].key, state.sortState[siteName].dir);
        });
    });
    document.getElementById('btn-refresh').addEventListener('click', async () => {
        const btn = document.getElementById('btn-refresh');
        btn.disabled = true; btn.querySelector('svg').style.animation = 'spin 0.5s linear infinite';
        await fetchAllData();
        document.getElementById('main-content').querySelectorAll('.tab-panel:not(#tab-overview)').forEach(p => p.remove());
        renderOverview(); renderSiteTabs(); setupEventListeners();
        btn.disabled = false; btn.querySelector('svg').style.animation = '';
        document.querySelector('#last-update .meta-value').textContent = new Date().toLocaleString('vi-VN');
    });
}

// ============================================
// Init
// ============================================
async function init() {
    try {
        await fetchAllData();
        document.getElementById('loading-overlay').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        const now = new Date().toLocaleString('vi-VN');
        document.querySelector('#last-update .meta-value').textContent = now;
        document.querySelector('#last-rank-update .meta-value').textContent = now;
        renderApp();
    } catch (err) {
        console.error('Init error:', err);
        document.querySelector('.loading-text').textContent = 'Lỗi tải dữ liệu. Vui lòng thử lại.';
    }
}

document.addEventListener('DOMContentLoaded', init);
