/**
 * SEO Dashboard — Google Search Console Style
 * Auto-detection Report Engine with Staff Leaderboard
 */

// ============================================
// Configuration
// ============================================
const CONFIG = {
    SHEETS: [
        { name: 'Hikvision', gid: '804549385', color: '#4285f4', short: 'HK', domain: 'hikvision247.com' },
        { name: 'ZKTeco', gid: '526294969', color: '#1e8e3e', short: 'ZK', domain: 'zktecovn.com' },
        { name: 'Vnsmart', gid: '1740814124', color: '#ea8600', short: 'VN', domain: 'vnsmart.com.vn' },
        { name: 'Supremainc', gid: '187136415', color: '#7c3aed', short: 'SU', domain: 'supremainc.vn' }
    ],
    BASE_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQHmXJl56tO6v1J70LTik9TP9FDLe1gj3ljZdZ6NDUQNsmytVLBpYbCQhmqCv-CvucvZdQxOR9_VaxX/pub',
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
    sites: {},
    allMonths: [],
    activeTab: 'overview',
    activeSiteMonths: {},
    overviewMonth: null,
};

// ============================================
// Utility Functions
// ============================================
function parseCSV(csvText) {
    const lines = csvText.split('\n').map(l => l.replace(/\r$/, ''));
    const result = [];
    for (const line of lines) {
        const row = [];
        let inQuotes = false;
        let cell = '';
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    cell += '"'; i++;
                } else { inQuotes = !inQuotes; }
            } else if (ch === ',' && !inQuotes) {
                row.push(cell.trim()); cell = '';
            } else { cell += ch; }
        }
        row.push(cell.trim());
        result.push(row);
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
    if (isNaN(num)) return null;
    return num;
}

function parseSiteData(csvText, sheetConfig) {
    const rows = parseCSV(csvText);
    const site = {
        name: sheetConfig.name, color: sheetConfig.color,
        short: sheetConfig.short, domain: sheetConfig.domain,
        url: '', staff: '', total: 0, achieved: 0, notAchieved: 0,
        months: {}
    };

    if (rows.length > 0) {
        for (const cell of rows[0]) {
            const urlMatch = cell.match(/https?:\/\/[^\s,]+/);
            if (urlMatch) site.url = urlMatch[0];
        }
        const headerRow = rows[0];
        for (let i = 0; i < headerRow.length; i++) {
            if (headerRow[i] === 'Phụ trách' && i + 1 < headerRow.length) {
                site.staff = headerRow[i + 1];
            }
        }
    }

    let currentMonth = null;
    for (let r = 2; r < rows.length; r++) {
        const row = rows[r];
        if (row.every(c => !c)) continue;
        const monthKey = detectMonthHeader(row);
        if (monthKey) {
            currentMonth = monthKey;
            if (!site.months[currentMonth]) site.months[currentMonth] = { keywords: [], dates: {} };
            continue;
        }
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
        const csvText = await response.text();
        return parseSiteData(csvText, sheetConfig);
    } catch (error) {
        console.error(`Error fetching ${sheetConfig.name}:`, error);
        return null;
    }
}

async function fetchAllData() {
    const loadingBar = document.getElementById('loading-bar');
    for (let i = 0; i < CONFIG.SHEETS.length; i++) {
        const sheet = CONFIG.SHEETS[i];
        const data = await fetchSheetData(sheet);
        if (data) state.sites[data.name] = data;
        if (loadingBar) loadingBar.style.width = ((i + 1) / CONFIG.SHEETS.length * 100) + '%';
    }
    const monthSet = new Set();
    Object.values(state.sites).forEach(site => {
        Object.keys(site.months).forEach(m => monthSet.add(m));
    });
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
function getChangeClass(change) {
    if (change === 'Tăng') return 'tang';
    if (change === 'Giảm') return 'giam';
    return 'same';
}
function getChangeIcon(change) {
    if (change === 'Tăng') return '↑';
    if (change === 'Giảm') return '↓';
    return '—';
}

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
    for (const m of sorted) {
        if (site.months[m].keywords.length > 0) { latestMonth = m; break; }
    }
    const keywords = site.months[latestMonth].keywords;
    const achieved = keywords.filter(k => k.status === 'Đạt').length;
    const total = keywords.length;
    return { total, achieved, notAchieved: total - achieved, percent: total > 0 ? (achieved / total) * 100 : 0, month: latestMonth };
}

function getLatestMonthWithData() {
    for (let i = state.allMonths.length - 1; i >= 0; i--) {
        const month = state.allMonths[i];
        let hasData = false;
        for (const site of Object.values(state.sites)) {
            if (site.months[month] && site.months[month].keywords.length > 0) { hasData = true; break; }
        }
        if (hasData) return month;
    }
    return state.allMonths[state.allMonths.length - 1] || null;
}

/**
 * Auto-select month based on current date.
 * If today is Feb 12, 2026 → show T1/2026 (previous month).
 */
function getDefaultReportMonth() {
    const now = new Date();
    let month = now.getMonth(); // 0-indexed: Jan=0, Feb=1
    let year = now.getFullYear();
    // Use previous month
    if (month === 0) { month = 12; year--; }
    // month is now 1-based previous month
    const targetKey = `T${month}/${year}`;
    // Verify this month exists in data
    if (state.allMonths.includes(targetKey)) return targetKey;
    // Fallback to latest month with data
    return getLatestMonthWithData();
}

function formatMonthDisplay(monthKey) {
    if (!monthKey) return '—';
    const match = monthKey.match(/T(\d{1,2})\/(\d{4})/);
    if (match) return `Tháng ${match[1].padStart(2, '0')} / ${match[2]}`;
    return monthKey;
}

// ============================================
// MiniChart — Light theme
// ============================================
class MiniChart {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;
        this.resize();
    }
    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.width = rect.width; this.height = rect.height;
        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        this.ctx.scale(this.dpr, this.dpr);
    }
    clear() { this.ctx.clearRect(0, 0, this.width, this.height); }

    drawBarChart(data, options = {}) {
        this.clear();
        const ctx = this.ctx;
        const padding = { top: 40, right: 20, bottom: 60, left: 50 };
        const chartW = this.width - padding.left - padding.right;
        const chartH = this.height - padding.top - padding.bottom;
        if (!data.length) return;

        const maxVal = Math.max(...data.map(d => d.total || 0), 1);
        const barWidth = Math.min(56, (chartW / data.length) * 0.6);
        const gap = (chartW - barWidth * data.length) / (data.length + 1);

        // Grid lines
        ctx.strokeStyle = '#e8eaed';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(this.width - padding.right, y);
            ctx.stroke();
            ctx.fillStyle = '#80868b';
            ctx.font = '11px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 8, y + 4);
        }

        // Bars
        data.forEach((d, i) => {
            const x = padding.left + gap + i * (barWidth + gap);
            const achievedH = (d.achieved / maxVal) * chartH;
            const notAchievedH = ((d.total - d.achieved) / maxVal) * chartH;

            // Not achieved
            ctx.fillStyle = '#fce8e6';
            roundRect(ctx, x, padding.top + chartH - achievedH - notAchievedH, barWidth, notAchievedH, 4, true);

            // Achieved
            ctx.fillStyle = d.color + 'cc';
            roundRect(ctx, x, padding.top + chartH - achievedH, barWidth, achievedH, 4, true);

            // Percent label
            ctx.fillStyle = '#202124';
            ctx.font = 'bold 12px Inter';
            ctx.textAlign = 'center';
            const pct = d.total > 0 ? (d.achieved / d.total) * 100 : 0;
            ctx.fillText(formatPercent(pct), x + barWidth / 2, padding.top + chartH - achievedH - notAchievedH - 8);

            // X label
            ctx.fillStyle = '#5f6368';
            ctx.font = '12px Inter';
            ctx.fillText(d.label, x + barWidth / 2, this.height - padding.bottom + 20);
        });

        // Legend
        const legendY = this.height - 8;
        ctx.font = '11px Inter'; ctx.textAlign = 'left';
        ctx.fillStyle = '#1e8e3e';
        ctx.fillRect(this.width / 2 - 70, legendY - 8, 10, 10);
        ctx.fillStyle = '#5f6368';
        ctx.fillText('Đạt', this.width / 2 - 56, legendY);
        ctx.fillStyle = '#fce8e6';
        ctx.fillRect(this.width / 2 + 10, legendY - 8, 10, 10);
        ctx.strokeStyle = '#dadce0';
        ctx.strokeRect(this.width / 2 + 10, legendY - 8, 10, 10);
        ctx.fillStyle = '#5f6368';
        ctx.fillText('Chưa đạt', this.width / 2 + 24, legendY);
    }

    drawLineChart(datasets, labels, options = {}) {
        this.clear();
        const ctx = this.ctx;
        const padding = { top: 20, right: 20, bottom: 50, left: 50 };
        const chartW = this.width - padding.left - padding.right;
        const chartH = this.height - padding.top - padding.bottom;
        if (!labels.length || !datasets.length) return;

        let maxVal = 0;
        datasets.forEach(ds => { ds.data.forEach(v => { if (v > maxVal) maxVal = v; }); });
        maxVal = Math.max(maxVal, 1);
        maxVal = Math.ceil(maxVal / 10) * 10;

        // Grid
        ctx.strokeStyle = '#e8eaed';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(this.width - padding.right, y);
            ctx.stroke();
            ctx.fillStyle = '#80868b';
            ctx.font = '11px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 8, y + 4);
        }

        // X labels
        const stepX = chartW / Math.max(labels.length - 1, 1);
        labels.forEach((label, i) => {
            const x = padding.left + i * stepX;
            ctx.fillStyle = '#5f6368';
            ctx.font = '11px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(label, x, this.height - padding.bottom + 20);
        });

        // Lines
        datasets.forEach(ds => {
            ctx.beginPath();
            ctx.strokeStyle = ds.color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ds.data.forEach((val, i) => {
                const x = padding.left + i * stepX;
                const y = padding.top + chartH - (val / maxVal) * chartH;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Area
            const lastI = ds.data.length - 1;
            ctx.lineTo(padding.left + lastI * stepX, padding.top + chartH);
            ctx.lineTo(padding.left, padding.top + chartH);
            ctx.closePath();
            const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
            gradient.addColorStop(0, ds.color + '15');
            gradient.addColorStop(1, ds.color + '00');
            ctx.fillStyle = gradient;
            ctx.fill();

            // Dots
            ds.data.forEach((val, i) => {
                const x = padding.left + i * stepX;
                const y = padding.top + chartH - (val / maxVal) * chartH;
                ctx.beginPath();
                ctx.arc(x, y, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = ds.color;
                ctx.stroke();
            });
        });
    }
}

function roundRect(ctx, x, y, w, h, r, fill) {
    if (h <= 0) return;
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) ctx.fill();
}

// ============================================
// Rendering
// ============================================
function renderApp() {
    renderNavTabs();
    renderOverview();
    renderSiteTabs();
    setupEventListeners();
}

function renderNavTabs() {
    const nav = document.querySelector('.nav-tabs-inner');
    // Remove existing site tabs (keep only the overview tab)
    nav.querySelectorAll('.tab-btn:not([data-tab="overview"])').forEach(b => b.remove());
    CONFIG.SHEETS.forEach(sheet => {
        const site = state.sites[sheet.name];
        if (!site) return;
        const totalKeywords = getLatestMonthStats(site).total;
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.dataset.tab = sheet.name;
        btn.innerHTML = `
            <img class="tab-favicon" src="${getFaviconUrl(sheet.domain)}" alt="${sheet.name}" onerror="this.style.display='none'">
            ${sheet.name}
            <span class="tab-badge">${totalKeywords}</span>
        `;
        nav.appendChild(btn);
    });
}

function renderOverview() {
    renderMonthIndicator();
    renderSummaryCards();
    renderStaffLeaderboard();
    renderOverallChart();
    renderTrendChart();
    renderComparison();
}

function renderMonthIndicator() {
    if (!state.overviewMonth) {
        state.overviewMonth = getDefaultReportMonth();
    }
    const monthValueEl = document.getElementById('active-month-value');
    if (monthValueEl) monthValueEl.textContent = formatMonthDisplay(state.overviewMonth);

    const selectEl = document.getElementById('overview-month-select');
    if (selectEl) {
        selectEl.innerHTML = state.allMonths.map(m =>
            `<option value="${m}" ${m === state.overviewMonth ? 'selected' : ''}>${formatMonthDisplay(m)}</option>`
        ).join('');
        selectEl.onchange = (e) => {
            state.overviewMonth = e.target.value;
            if (monthValueEl) monthValueEl.textContent = formatMonthDisplay(state.overviewMonth);
            const chartBadge = document.getElementById('chart-overall-month');
            if (chartBadge) chartBadge.textContent = formatMonthDisplay(state.overviewMonth);
            renderSummaryCards();
            renderOverallChart();
            renderStaffLeaderboard();
        };
    }
    const chartBadge = document.getElementById('chart-overall-month');
    if (chartBadge) chartBadge.textContent = formatMonthDisplay(state.overviewMonth);
}

function renderSummaryCards() {
    const container = document.getElementById('summary-cards');
    const activeMonth = state.overviewMonth || getLatestMonthWithData();
    let totalKeywords = 0, totalAchieved = 0, totalUp = 0, totalDown = 0;

    Object.values(state.sites).forEach(site => {
        const stats = getMonthStats(site, activeMonth);
        totalKeywords += stats.total;
        totalAchieved += stats.achieved;
        if (site.months[activeMonth]) {
            site.months[activeMonth].keywords.forEach(k => {
                if (k.change === 'Tăng') totalUp++;
                if (k.change === 'Giảm') totalDown++;
            });
        }
    });
    const overallPercent = totalKeywords > 0 ? (totalAchieved / totalKeywords * 100) : 0;

    // Previous month comparison
    let prevPercent = 0;
    const latestIdx = state.allMonths.indexOf(activeMonth);
    if (latestIdx > 0) {
        const prevMonth = state.allMonths[latestIdx - 1];
        let pTotal = 0, pAchieved = 0;
        Object.values(state.sites).forEach(site => {
            const pStats = getMonthStats(site, prevMonth);
            pTotal += pStats.total;
            pAchieved += pStats.achieved;
        });
        prevPercent = pTotal > 0 ? (pAchieved / pTotal * 100) : 0;
    }
    const percentDiff = overallPercent - prevPercent;

    const cards = [
        {
            color: 'blue',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>`,
            value: totalKeywords, label: 'Tổng từ khoá',
            change: `${Object.keys(state.sites).length} websites`, changeType: 'neutral'
        },
        {
            color: 'emerald',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
            value: totalAchieved, label: 'Đạt mục tiêu',
            change: `${formatPercent(overallPercent)} tổng`, changeType: 'up'
        },
        {
            color: 'rose',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
            value: totalKeywords - totalAchieved, label: 'Chưa đạt',
            change: `${formatPercent(100 - overallPercent)} tổng`, changeType: 'down'
        },
        {
            color: 'amber',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
            value: totalUp, label: 'Tăng hạng',
            change: `${totalDown} giảm hạng`, changeType: totalUp > totalDown ? 'up' : 'down'
        },
        {
            color: 'purple',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
            value: formatPercent(overallPercent), label: 'Tỷ lệ đạt',
            change: `${percentDiff >= 0 ? '+' : ''}${formatPercent(percentDiff)} so tháng trước`,
            changeType: percentDiff >= 0 ? 'up' : 'down'
        }
    ];

    container.innerHTML = cards.map(card => `
        <div class="summary-card animate-in">
            <div class="card-icon ${card.color}">${card.icon}</div>
            <div class="card-value">${card.value}</div>
            <div class="card-label">${card.label}</div>
            <div class="card-change ${card.changeType}">
                ${card.changeType === 'up' ? '↑' : card.changeType === 'down' ? '↓' : '●'} ${card.change}
            </div>
        </div>
    `).join('');
}

// ============================================
// Staff Leaderboard — PRIMARY FOCUS
// ============================================
function renderStaffLeaderboard() {
    const container = document.getElementById('staff-leaderboard');
    const activeMonth = state.overviewMonth || getLatestMonthWithData();

    // Build staff data and sort by percent descending
    const staffData = CONFIG.SHEETS.map(sheet => {
        const site = state.sites[sheet.name];
        if (!site) return null;
        const stats = getMonthStats(site, activeMonth);
        let upCount = 0, downCount = 0, sameCount = 0;
        if (site.months[activeMonth]) {
            site.months[activeMonth].keywords.forEach(k => {
                if (k.change === 'Tăng') upCount++;
                else if (k.change === 'Giảm') downCount++;
                else sameCount++;
            });
        }

        // Previous month comparison
        let prevPercent = 0;
        const latestIdx = state.allMonths.indexOf(activeMonth);
        if (latestIdx > 0) {
            const prevStats = getMonthStats(site, state.allMonths[latestIdx - 1]);
            prevPercent = prevStats.percent;
        }
        const trend = stats.percent - prevPercent;

        return { sheet, site, stats, upCount, downCount, sameCount, trend };
    }).filter(Boolean).sort((a, b) => b.stats.percent - a.stats.percent);

    const rankIcons = ['🥇', '🥈', '🥉'];

    let html = `
        <div class="leaderboard-header">
            <div>Hạng</div>
            <div>Nhân sự / Website</div>
            <div>Tiến độ</div>
            <div>Đạt / Tổng</div>
            <div>Tỷ lệ</div>
            <div>Thay đổi</div>
        </div>
    `;

    html += staffData.map((d, i) => {
        const rank = i + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        const percentClass = d.stats.percent >= 70 ? 'high' : d.stats.percent >= 50 ? 'mid' : 'low';
        const progressColor = d.stats.percent >= 70 ? '#1e8e3e' : d.stats.percent >= 50 ? '#ea8600' : '#d93025';
        const trendStr = d.trend >= 0 ? `+${formatPercent(d.trend)}` : formatPercent(d.trend);
        const trendColor = d.trend >= 0 ? '#1e8e3e' : '#d93025';

        return `
            <div class="leaderboard-row animate-in" data-tab="${d.sheet.name}" style="cursor:pointer" title="Bấm để xem chi tiết ${d.sheet.name}">
                <div class="lb-rank ${rankClass}">${rank <= 3 ? rankIcons[rank - 1] : rank}</div>
                <div class="lb-staff">
                    <img class="lb-staff-favicon" src="${getFaviconUrl(d.sheet.domain)}" alt="${d.sheet.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2218%22 font-size=%2216%22>${d.sheet.short}</text></svg>'">
                    <div class="lb-staff-info">
                        <h4>${d.site.staff || 'N/A'}</h4>
                        <span>${d.sheet.name} — ${d.site.url ? new URL(d.site.url).hostname : ''}</span>
                    </div>
                </div>
                <div class="lb-progress">
                    <div class="lb-progress-bar">
                        <div class="lb-progress-fill" style="width:${d.stats.percent}%;background:${progressColor}"></div>
                    </div>
                    <div class="lb-progress-text">${d.stats.achieved} từ khoá đạt top</div>
                </div>
                <div class="lb-achieved">${d.stats.achieved} / ${d.stats.total}</div>
                <div class="lb-percent ${percentClass}">${formatPercent(d.stats.percent)}</div>
                <div class="lb-changes">
                    <div class="lb-change-item">
                        <div class="lb-change-value" style="color:#1e8e3e">↑${d.upCount}</div>
                        <div class="lb-change-label">Tăng</div>
                    </div>
                    <div class="lb-change-item">
                        <div class="lb-change-value" style="color:#d93025">↓${d.downCount}</div>
                        <div class="lb-change-label">Giảm</div>
                    </div>
                    <div class="lb-change-item">
                        <div class="lb-change-value" style="color:${trendColor}">${trendStr}</div>
                        <div class="lb-change-label">vs trước</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    // Click to navigate to site tab
    container.querySelectorAll('.leaderboard-row[data-tab]').forEach(row => {
        row.addEventListener('click', () => {
            const tab = row.dataset.tab;
            switchToTab(tab);
        });
    });
}

function renderOverallChart() {
    const canvas = document.getElementById('canvas-overall');
    if (!canvas) return;
    const chart = new MiniChart(canvas);
    const activeMonth = state.overviewMonth || getLatestMonthWithData();
    const data = CONFIG.SHEETS.map(sheet => {
        const site = state.sites[sheet.name];
        if (!site) return null;
        const stats = getMonthStats(site, activeMonth);
        return { label: sheet.name, total: stats.total, achieved: stats.achieved, color: sheet.color };
    }).filter(d => d && d.total > 0);
    chart.drawBarChart(data);
    window.addEventListener('resize', () => { chart.resize(); chart.drawBarChart(data); });
}

function renderTrendChart() {
    const canvas = document.getElementById('canvas-trend');
    if (!canvas) return;
    const chart = new MiniChart(canvas);
    const labels = state.allMonths;
    const datasets = CONFIG.SHEETS.map(sheet => {
        const site = state.sites[sheet.name];
        if (!site) return null;
        return {
            label: sheet.name, color: sheet.color,
            data: state.allMonths.map(month => getMonthStats(site, month).percent)
        };
    }).filter(Boolean);
    chart.drawLineChart(datasets, labels);
    const legendEl = document.getElementById('trend-legend');
    legendEl.innerHTML = datasets.map(ds => `
        <span class="legend-item">
            <span class="legend-dot" style="background:${ds.color}"></span>
            ${ds.label}
        </span>
    `).join('');
    window.addEventListener('resize', () => { chart.resize(); chart.drawLineChart(datasets, labels); });
}

function renderComparison() {
    const select1 = document.getElementById('compare-month-1');
    const select2 = document.getElementById('compare-month-2');
    const optionsHTML = state.allMonths.map(m => `<option value="${m}">${formatMonthDisplay(m)}</option>`).join('');
    select1.innerHTML = optionsHTML;
    select2.innerHTML = optionsHTML;

    const latestData = getLatestMonthWithData();
    const latestIdx = state.allMonths.indexOf(latestData);
    if (latestIdx > 0) {
        select1.value = state.allMonths[latestIdx - 1];
        select2.value = latestData;
    } else if (state.allMonths.length >= 2) {
        select1.value = state.allMonths[state.allMonths.length - 2];
        select2.value = state.allMonths[state.allMonths.length - 1];
    }
    updateComparison();
    select1.addEventListener('change', updateComparison);
    select2.addEventListener('change', updateComparison);
}

function updateComparison() {
    const month1 = document.getElementById('compare-month-1').value;
    const month2 = document.getElementById('compare-month-2').value;
    const grid = document.getElementById('comparison-grid');

    grid.innerHTML = CONFIG.SHEETS.map((sheet) => {
        const site = state.sites[sheet.name];
        if (!site) return '';
        const stats1 = getMonthStats(site, month1);
        const stats2 = getMonthStats(site, month2);
        const diff = stats2.achieved - stats1.achieved;
        const percentDiff = stats2.percent - stats1.percent;
        const barColor = stats2.percent >= 70 ? '#1e8e3e' : stats2.percent >= 50 ? '#ea8600' : '#d93025';

        return `
            <div class="comparison-card animate-in">
                <div class="comparison-card-header">
                    <img class="comparison-site-favicon" src="${getFaviconUrl(sheet.domain)}" alt="${sheet.name}" onerror="this.style.display='none'">
                    <div class="comparison-site-name">${sheet.name}</div>
                </div>
                <div class="comparison-stats">
                    <div class="comparison-stat">
                        <div class="comparison-stat-label">${formatMonthDisplay(month1)}</div>
                        <div class="comparison-stat-value">${stats1.achieved}/${stats1.total}</div>
                    </div>
                    <div class="comparison-stat">
                        <div class="comparison-stat-label">${formatMonthDisplay(month2)}</div>
                        <div class="comparison-stat-value">${stats2.achieved}/${stats2.total}</div>
                    </div>
                    <div class="comparison-stat">
                        <div class="comparison-stat-label">Thay đổi</div>
                        <div class="comparison-stat-value ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff}</div>
                    </div>
                    <div class="comparison-stat">
                        <div class="comparison-stat-label">% Thay đổi</div>
                        <div class="comparison-stat-value ${percentDiff >= 0 ? 'up' : 'down'}">${percentDiff >= 0 ? '+' : ''}${formatPercent(percentDiff)}</div>
                    </div>
                </div>
                <div class="comparison-bar">
                    <div class="comparison-bar-track">
                        <div class="comparison-bar-fill" style="width:${stats2.percent}%;background:${barColor}"></div>
                    </div>
                    <div class="comparison-bar-label">
                        <span class="label-value" style="color:#80868b">${formatPercent(stats1.percent)}</span>
                        <span class="label-value" style="color:${barColor}">${formatPercent(stats2.percent)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderSiteTabs() {
    const mainContent = document.getElementById('main-content');
    CONFIG.SHEETS.forEach(sheet => {
        const site = state.sites[sheet.name];
        if (!site) return;

        const months = Object.keys(site.months).sort((a, b) => {
            const [am, ay] = a.replace('T', '').split('/').map(Number);
            const [bm, by] = b.replace('T', '').split('/').map(Number);
            return (by * 12 + bm) - (ay * 12 + am);
        });

        let latestMonth = months[0] || '';
        for (const m of months) {
            if (site.months[m].keywords.length > 0) { latestMonth = m; break; }
        }
        state.activeSiteMonths[sheet.name] = latestMonth;

        const section = document.createElement('section');
        section.id = `tab-${sheet.name}`;
        section.className = 'tab-panel';

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

            <div class="month-selector" id="months-${sheet.name}">
                ${months.map(m => `
                    <button class="month-btn ${m === latestMonth ? 'active' : ''}" data-month="${m}" data-site="${sheet.name}">${m}</button>
                `).join('')}
            </div>

            <div class="keywords-table-wrapper">
                <div class="table-toolbar">
                    <div class="table-search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
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
                <div class="table-scroll">
                    <table class="keywords-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Từ khoá / Sản phẩm</th>
                                <th>URL</th>
                                <th class="sortable-th" data-sort="initialRank" data-site="${sheet.name}">Ban đầu <span class="sort-icon">⇅</span></th>
                                <th class="sortable-th" data-sort="targetRank" data-site="${sheet.name}">Dự kiến <span class="sort-icon">⇅</span></th>
                                <th class="sortable-th" data-sort="currentRank" data-site="${sheet.name}">Hiện tại <span class="sort-icon">⇅</span></th>
                                <th>Thay đổi</th>
                                <th>Đánh giá</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-${sheet.name}"></tbody>
                    </table>
                </div>
            </div>
        `;

        mainContent.appendChild(section);
        renderInsights(sheet.name, site, latestMonth);
        renderKeywordsTable(sheet.name, site, latestMonth);
    });
}

function renderInsights(siteName, site, month) {
    const container = document.getElementById(`insights-${siteName}`);
    if (!site.months[month]) return;
    const keywords = site.months[month].keywords;

    const topPerformers = keywords.filter(k => k.status === 'Đạt' && k.currentRank)
        .sort((a, b) => (a.currentRank || 999) - (b.currentRank || 999)).slice(0, 5);
    const mostImproved = keywords.filter(k => k.initialRank && k.currentRank && k.change === 'Tăng')
        .sort((a, b) => ((b.initialRank || 0) - (b.currentRank || 0)) - ((a.initialRank || 0) - (a.currentRank || 0))).slice(0, 5);
    const needsAttention = keywords.filter(k => k.status === 'Chưa đạt' && k.currentRank)
        .sort((a, b) => (a.currentRank || 999) - (b.currentRank || 999)).slice(0, 5);

    container.innerHTML = `
        <div class="insight-card">
            <div class="insight-card-title"><span>🏆</span> Top đạt mục tiêu</div>
            <ul class="insight-list">
                ${topPerformers.length ? topPerformers.map(k => `
                    <li><span class="insight-keyword">${k.keyword || k.name}</span>
                    <span class="insight-rank rank-badge ${getRankClass(k.currentRank)}">#${k.currentRank}</span></li>
                `).join('') : '<li style="color:#9aa0a6;justify-content:center">Không có dữ liệu</li>'}
            </ul>
        </div>
        <div class="insight-card">
            <div class="insight-card-title"><span>📈</span> Tăng hạng nhiều nhất</div>
            <ul class="insight-list">
                ${mostImproved.length ? mostImproved.map(k => `
                    <li><span class="insight-keyword">${k.keyword || k.name}</span>
                    <span class="insight-rank" style="color:#1e8e3e">${k.initialRank} → ${k.currentRank}</span></li>
                `).join('') : '<li style="color:#9aa0a6;justify-content:center">Không có dữ liệu</li>'}
            </ul>
        </div>
        <div class="insight-card">
            <div class="insight-card-title"><span>⚠️</span> Cần chú ý</div>
            <ul class="insight-list">
                ${needsAttention.length ? needsAttention.map(k => `
                    <li><span class="insight-keyword">${k.keyword || k.name}</span>
                    <span class="insight-rank rank-badge ${getRankClass(k.currentRank)}">#${k.currentRank}</span></li>
                `).join('') : '<li style="color:#9aa0a6;justify-content:center">Không có dữ liệu</li>'}
            </ul>
        </div>
    `;
}

function renderKeywordsTable(siteName, site, month, filter = 'all', search = '', sortKey = null, sortDir = 'asc') {
    const tbody = document.getElementById(`tbody-${siteName}`);
    if (!site.months[month]) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><p>Không có dữ liệu cho tháng này</p></td></tr>';
        return;
    }
    let keywords = [...site.months[month].keywords];
    if (filter === 'dat') keywords = keywords.filter(k => k.status === 'Đạt');
    if (filter === 'chua-dat') keywords = keywords.filter(k => k.status === 'Chưa đạt');
    if (filter === 'tang') keywords = keywords.filter(k => k.change === 'Tăng');
    if (filter === 'giam') keywords = keywords.filter(k => k.change === 'Giảm');
    if (search) {
        const q = search.toLowerCase();
        keywords = keywords.filter(k => (k.keyword && k.keyword.toLowerCase().includes(q)) || (k.name && k.name.toLowerCase().includes(q)));
    }

    // Apply sort
    if (sortKey) {
        keywords.sort((a, b) => {
            const aVal = a[sortKey] !== null ? a[sortKey] : 9999;
            const bVal = b[sortKey] !== null ? b[sortKey] : 9999;
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });
    }

    tbody.innerHTML = keywords.map((k, i) => {
        const displayName = k.keyword || k.name;
        const displayUrl = k.url ? new URL(k.url).pathname : '';
        const progressWidth = k.currentRank ? Math.max(0, 100 - k.currentRank) : 0;
        const progressColor = k.currentRank <= 10 ? '#1e8e3e' : k.currentRank <= 30 ? '#ea8600' : '#d93025';

        return `
            <tr>
                <td style="color:#9aa0a6;font-size:12px">${k.stt || i + 1}</td>
                <td><div class="keyword-name" title="${displayName}">${displayName}</div></td>
                <td>${k.url ? `<a href="${k.url}" target="_blank" class="keyword-url" title="${k.url}">${displayUrl}</a>` : '—'}</td>
                <td><span class="rank-badge ${getRankClass(k.initialRank)}">${k.initialRank !== null ? '#' + k.initialRank : '—'}</span></td>
                <td><span class="rank-badge top10">${k.targetRank !== null ? '#' + k.targetRank : '—'}</span></td>
                <td>
                    <span class="rank-badge ${getRankClass(k.currentRank)}">${k.currentRank !== null ? '#' + k.currentRank : '—'}</span>
                    ${k.currentRank && k.currentRank < 100 ? `<div class="mini-progress"><div class="mini-progress-fill" style="width:${progressWidth}%;background:${progressColor}"></div></div>` : ''}
                </td>
                <td><span class="change-badge ${getChangeClass(k.change)}">${getChangeIcon(k.change)} ${k.change || '—'}</span></td>
                <td><span class="status-badge ${k.status === 'Đạt' ? 'dat' : 'chua-dat'}">${k.status === 'Đạt' ? '✅' : '❌'} ${k.status || '—'}</span></td>
            </tr>
        `;
    }).join('');
}

// ============================================
// Tab Navigation Helper
// ============================================
function switchToTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`tab-${tabName}`);
    if (panel) {
        panel.classList.add('active');
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    state.activeTab = tabName;
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchToTab(btn.dataset.tab));
    });

    document.querySelectorAll('.month-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const siteName = btn.dataset.site;
            const month = btn.dataset.month;
            document.querySelectorAll(`.month-btn[data-site="${siteName}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeSiteMonths[siteName] = month;
            const site = state.sites[siteName];
            renderInsights(siteName, site, month);
            renderKeywordsTable(siteName, site, month);
        });
    });

    document.querySelectorAll('input[id^="search-"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const siteName = e.target.dataset.site;
            const site = state.sites[siteName];
            const month = state.activeSiteMonths[siteName];
            const filter = document.querySelector(`.filter-btn.active[data-site="${siteName}"]`)?.dataset.filter || 'all';
            renderKeywordsTable(siteName, site, month, filter, e.target.value);
        });
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const siteName = btn.dataset.site;
            const filter = btn.dataset.filter;
            document.querySelectorAll(`.filter-btn[data-site="${siteName}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const site = state.sites[siteName];
            const month = state.activeSiteMonths[siteName];
            const search = document.getElementById(`search-${siteName}`)?.value || '';
            renderKeywordsTable(siteName, site, month, filter, search);
        });
    });

    // Sortable table headers
    document.querySelectorAll('.sortable-th').forEach(th => {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
        th.addEventListener('click', () => {
            const siteName = th.dataset.site;
            const sortKey = th.dataset.sort;
            const site = state.sites[siteName];
            const month = state.activeSiteMonths[siteName];
            const filter = document.querySelector(`.filter-btn.active[data-site="${siteName}"]`)?.dataset.filter || 'all';
            const search = document.getElementById(`search-${siteName}`)?.value || '';

            // Toggle sort direction
            if (!state.sortState) state.sortState = {};
            if (state.sortState[siteName]?.key === sortKey) {
                state.sortState[siteName].dir = state.sortState[siteName].dir === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortState[siteName] = { key: sortKey, dir: 'asc' };
            }

            // Update sort icons
            document.querySelectorAll(`.sortable-th[data-site="${siteName}"] .sort-icon`).forEach(icon => {
                icon.textContent = '⇅';
                icon.style.color = '';
            });
            const activeIcon = th.querySelector('.sort-icon');
            if (activeIcon) {
                activeIcon.textContent = state.sortState[siteName].dir === 'asc' ? '↑' : '↓';
                activeIcon.style.color = '#1a73e8';
            }

            renderKeywordsTable(siteName, site, month, filter, search, state.sortState[siteName].key, state.sortState[siteName].dir);
        });
    });

    document.getElementById('btn-refresh').addEventListener('click', async () => {
        const btn = document.getElementById('btn-refresh');
        btn.disabled = true;
        btn.querySelector('svg').style.animation = 'spin 0.5s linear infinite';
        await fetchAllData();
        document.getElementById('main-content').querySelectorAll('.tab-panel:not(#tab-overview)').forEach(p => p.remove());
        renderOverview();
        renderSiteTabs();
        setupEventListeners();
        btn.disabled = false;
        btn.querySelector('svg').style.animation = '';
        document.getElementById('last-update').textContent = 'Cập nhật: ' + new Date().toLocaleString('vi-VN');
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
        document.getElementById('last-update').textContent = 'Cập nhật: ' + new Date().toLocaleString('vi-VN');
        renderApp();
    } catch (err) {
        console.error('Init error:', err);
        document.querySelector('.loading-text').textContent = 'Lỗi tải dữ liệu. Vui lòng thử lại.';
    }
}

document.addEventListener('DOMContentLoaded', init);
