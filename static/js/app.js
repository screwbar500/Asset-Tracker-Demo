/* ── 포맷 유틸 ────────────────────────────────────────────── */
const fmt = (n) =>
  n == null ? '—' : Math.round(n).toLocaleString('ko-KR') + '원';

const fmtShort = (n) => {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + '억원';
  if (abs >= 1e4) return sign + Math.round(abs / 1e4).toLocaleString('ko-KR') + '만원';
  return sign + Math.round(abs).toLocaleString('ko-KR') + '원';
};

const fmtHero = (n) => {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(1) + '억원';
  return sign + Math.round(abs).toLocaleString('ko-KR') + '원';
};

const fmtRate = (r) => {
  if (r == null || isNaN(r)) return '—';
  return (r > 0 ? '+' : '') + r.toFixed(2) + '%';
};

const colorClass = (n) => (n > 0 ? 'profit' : n < 0 ? 'loss' : 'neutral');

/* ── 분류 정의 ────────────────────────────────────────────── */
const CAT_TAG = {
  bank:           'cat-tag--bank',
  domestic_stock: 'cat-tag--stock-kr',
  pension:        'cat-tag--pension',
  us_stock:       'cat-tag--stock-us',
  coin_upbit:     'cat-tag--coin',
  coin_binance:   'cat-tag--coin',
  real_estate:    'cat-tag--property',
  severance:      'cat-tag--etc',
};

const SUBCATS = {
  bank:           [{ value: 'savings', label: '예금' }, { value: 'installment', label: '적금' }],
  domestic_stock: [{ value: 'regular', label: '일반 주식계좌' }, { value: 'isa', label: 'ISA' }],
  pension:        [{ value: 'pension_savings', label: '연금저축' }, { value: 'irp', label: 'IRP' }],
  us_stock:       [{ value: 'regular', label: '일반' }],
  coin_upbit:     [{ value: 'spot', label: '현물' }, { value: 'staking', label: '스테이킹' }],
  coin_binance:   [{ value: 'spot', label: '현물' }],
  real_estate:    [{ value: '', label: '부동산' }],
  severance:      [{ value: '', label: '퇴직금' }],
};

/* 자산현황 탭의 그룹 정의 */
const OVERVIEW_GROUPS = [
  {
    key: 'bank',
    label: '예금 / 적금',
    tagCls: 'cat-tag--bank',
    accountLabel: '은행',
    filter: a => a.category === 'bank',
  },
  {
    key: 'domestic_regular',
    label: '국내주식',
    tagCls: 'cat-tag--stock-kr',
    accountLabel: '일반계좌',
    filter: a => a.category === 'domestic_stock' && a.subcategory === 'regular',
  },
  {
    key: 'pension',
    label: '연금',
    tagCls: 'cat-tag--pension',
    accountLabel: '연금저축 · IRP',
    filter: a => a.category === 'pension',
  },
  {
    key: 'domestic_isa',
    label: '국내주식',
    tagCls: 'cat-tag--stock-kr',
    accountLabel: 'ISA',
    filter: a => a.category === 'domestic_stock' && a.subcategory === 'isa',
  },
  {
    key: 'us_stock',
    label: '해외주식',
    tagCls: 'cat-tag--stock-us',
    accountLabel: '미국주식',
    filter: a => a.category === 'us_stock',
  },
  {
    key: 'coin_upbit',
    label: '업비트 코인',
    tagCls: 'cat-tag--coin',
    accountLabel: '업비트',
    filter: a => a.category === 'coin_upbit',
  },
  {
    key: 'coin_binance',
    label: '바이낸스 코인',
    tagCls: 'cat-tag--coin',
    accountLabel: '바이낸스',
    filter: a => a.category === 'coin_binance',
  },
  {
    key: 'real_estate',
    label: '부동산',
    tagCls: 'cat-tag--property',
    accountLabel: '부동산',
    filter: a => a.category === 'real_estate',
    individual: true,
  },
  {
    key: 'severance',
    label: '퇴직금',
    tagCls: 'cat-tag--etc',
    accountLabel: '퇴직금',
    filter: a => a.category === 'severance',
    individual: true,
  },
];

/* ── 상태 ─────────────────────────────────────────────────── */
let historyChart = null;
let stocksChart  = null;
let coinsChart   = null;
let editingAssetId = null;
let _allAssets = [];
let _pensionSummary = {};
let _reCharts = {};   // 부동산 차트 인스턴스
const ALL_TABS = ['assets', 'bank', 'stocks', 'coins', 'pension', 'loans', 'realestate', 'history'];

/* ── 초기화 ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  refreshAll();
  document.getElementById('snap-date').value = new Date().toISOString().slice(0, 10);
});

async function refreshAll() {
  await Promise.all([loadSummary(), loadAssets(), loadLoans(), loadHistory()]);
}

/* ── 요약 ─────────────────────────────────────────────────── */
async function loadSummary() {
  try {
    const d = await fetch('/api/summary').then(r => r.json());
    document.getElementById('net-worth').textContent         = fmtHero(d.net_worth);
    document.getElementById('total-assets').textContent      = fmtShort(d.total_assets);
    document.getElementById('total-liabilities').textContent = fmtShort(d.total_liabilities);
    document.getElementById('usd-krw').textContent           = `USD/KRW ${d.usd_krw?.toLocaleString('ko-KR') ?? '—'}`;
    document.getElementById('updated-at').textContent        = `${d.updated_at} 기준`;
    renderCategoryCards(d.category_totals, d.total_assets, d.category_labels);
  } catch (e) { console.error('summary error', e); }
}

function renderCategoryCards(totals, totalAssets, labels) {
  const el = document.getElementById('category-summary');
  if (!el) return;
  const ORDER = ['bank','domestic_stock','pension','us_stock','coin_upbit','coin_binance','real_estate','severance'];
  el.innerHTML = ORDER.map(cat => {
    const val = totals[cat] || 0;
    const pct = totalAssets > 0 ? ((val / totalAssets) * 100).toFixed(1) : '0.0';
    return `<div class="cat-card">
      <p class="cat-card-label">${labels[cat] || cat}</p>
      <p class="cat-card-value">${fmtShort(val)}</p>
      <p class="cat-card-pct">전체의 ${pct}%</p>
    </div>`;
  }).join('');
}

/* ── 자산 로드 & 렌더 분기 ────────────────────────────────── */
async function loadAssets() {
  try {
    _allAssets = await fetch('/api/assets').then(r => r.json());
    await renderPensionTab(_allAssets);
    renderOverviewTab(_allAssets);
    renderBankTab(_allAssets);
    await renderStocksTab(_allAssets);
    await renderCoinsTab(_allAssets);

    // 코인 중 조회 실패한 항목이 있으면 자동 재시도 (최대 3회, 3초 간격)
    scheduleRetryIfNeeded(1);
  } catch (e) { console.error('loadAssets error', e); }
}

let _retryTimer = null;
async function scheduleRetryIfNeeded(attempt) {
  if (attempt > 3) return;
  const coinCategories = ['coin_upbit', 'coin_binance'];
  const failed = _allAssets.filter(a =>
    coinCategories.includes(a.category) && a.current_price_krw == null
  );
  if (!failed.length) return;

  console.log(`조회 실패 ${failed.length}개 — ${attempt}번째 재시도 예정 (3초 후)`);
  clearTimeout(_retryTimer);
  _retryTimer = setTimeout(async () => {
    try {
      const fresh = await fetch('/api/assets').then(r => r.json());
      const failedIds = new Set(failed.map(a => a.id));
      // 실패했던 항목만 업데이트
      _allAssets = _allAssets.map(a =>
        failedIds.has(a.id) ? (fresh.find(f => f.id === a.id) || a) : a
      );
      await renderCoinsTab(_allAssets);
      renderOverviewTab(_allAssets);
      scheduleRetryIfNeeded(attempt + 1);
    } catch (e) { console.error('retry error', e); }
  }, 3000);
}

/* ── 자산현황 탭: 그룹 요약 ───────────────────────────────── */
function renderOverviewTab(assets) {
  const tbody = document.getElementById('overview-tbody');
  if (!assets.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">자산을 추가해 주세요.</td></tr>';
    return;
  }

  let rows = '';

  for (const group of OVERVIEW_GROUPS) {
    const items = assets.filter(group.filter);
    if (!items.length) continue;

    if (group.individual) {
      /* 부동산·퇴직금: 항목별 개별 행 */
      for (const a of items) {
        const hasPL     = a.profit_loss != null && a.purchase_amount > 0 && a.current_value !== a.purchase_amount;
        const pCls      = hasPL ? colorClass(a.profit_loss) : 'neutral';
        const isRE      = a.category === 'real_estate';
        const clickAttr = isRE ? `class="overview-group-row" onclick="switchTab('realestate')" style="cursor:pointer"` : '';
        rows += `<tr ${clickAttr}>
          <td class="td-left"><span class="cat-tag ${group.tagCls}">${group.label}</span></td>
          <td class="td-left" style="color:var(--color-ink)">${a.name}</td>
          <td style="color:var(--color-ink-muted-48)">—</td>
          <td>${fmt(a.purchase_amount)}</td>
          <td><strong>${fmt(a.current_value)}</strong></td>
          <td class="${pCls}">${hasPL ? fmt(a.profit_loss) : '—'}</td>
          <td class="${pCls}">${hasPL ? fmtRate(a.profit_rate) : '—'}</td>
        </tr>`;
      }
    } else {
      /* 그룹 합산 행 */
      let totalPurchase, totalValue;
      if (group.key === 'pension' && _pensionSummary._totals) {
        // 연금: 매입금액=누적원금, 평가금액=전체(개인연금회사 포함)
        totalPurchase = _pensionSummary._totals.cumulative;
        totalValue    = _pensionSummary._totals.current_value;
      } else {
        totalPurchase = items.reduce((s, a) => s + (a.purchase_amount || 0), 0);
        totalValue    = items.reduce((s, a) => s + (a.current_value   || 0), 0);
      }
      const totalPL       = totalValue - totalPurchase;
      const totalRate     = totalPurchase > 0 ? (totalPL / totalPurchase) * 100 : null;
      const pCls          = colorClass(totalPL);
      const isFixed       = group.key === 'bank';

      rows += `<tr class="overview-group-row" onclick="jumpToDetail('${group.key}')">
        <td class="td-left"><span class="cat-tag ${group.tagCls}">${group.label}</span></td>
        <td class="td-left" style="color:var(--color-ink)">${group.accountLabel}</td>
        <td style="color:var(--color-ink-muted-48)">${items.length}종목</td>
        <td>${fmt(totalPurchase)}</td>
        <td><strong>${fmt(totalValue)}</strong></td>
        <td class="${isFixed ? 'neutral' : pCls}">${isFixed ? '—' : fmt(totalPL)}</td>
        <td class="${isFixed ? 'neutral' : pCls}">${isFixed ? '—' : fmtRate(totalRate)}</td>
      </tr>`;
    }
  }

  tbody.innerHTML = rows || '<tr><td colspan="7" class="table-empty">자산을 추가해 주세요.</td></tr>';
}

/* 그룹 행 클릭 → 해당 탭으로 이동 */
function jumpToDetail(groupKey) {
  if (['coin_upbit','coin_binance'].includes(groupKey)) {
    switchTab('coins');
  } else if (groupKey === 'pension') {
    switchTab('pension');
  } else if (['domestic_regular','domestic_isa','us_stock'].includes(groupKey)) {
    switchTab('stocks');
  }
}

/* ── 예/적금 탭 ───────────────────────────────────────────── */
function renderBankTab(assets) {
  const el = document.getElementById('bank-content');

  const BANK_SECTIONS = [
    { label: '예금', filter: a => a.category === 'bank' && a.subcategory === 'savings' },
    { label: '적금', filter: a => a.category === 'bank' && a.subcategory === 'installment' },
    { label: '기타 은행 자산', filter: a => a.category === 'bank' && !['savings','installment'].includes(a.subcategory) },
  ];

  const rows = BANK_SECTIONS.map(sec => {
    const items = assets.filter(sec.filter);
    if (!items.length) return '';

    const totalValue = items.reduce((s, a) => s + (a.current_value || 0), 0);

    const tableRows = items.map(a => `<tr>
      <td class="td-left" style="font-weight:600">${a.name}</td>
      <td>${fmt(a.purchase_amount)}</td>
      <td style="color:var(--color-ink-muted-48)">${a.notes || '—'}</td>
      <td>
        <button class="btn-icon-sm" onclick="openEditModal(${a.id})" title="편집">✏</button>
        <button class="btn-icon-sm" onclick="deleteAsset(${a.id})" title="삭제" style="color:var(--color-loss)">✕</button>
      </td>
    </tr>`).join('');

    return `
      <div class="section-group">
        <div class="section-group-header">
          <span class="section-label" style="margin-bottom:0">${sec.label}</span>
          <div class="section-group-totals">
            <span class="sg-total-item">합계 <strong>${fmtShort(totalValue)}</strong></span>
          </div>
        </div>
        <div class="table-card" style="margin-bottom:0">
          <table class="asset-table">
            <thead>
              <tr>
                <th class="th-left">상품명</th>
                <th style="min-width:120px">금액</th>
                <th class="th-left">메모</th>
                <th style="min-width:56px"></th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = rows || '<p class="table-empty" style="padding:40px">등록된 예/적금이 없습니다.</p>';
}

/* ── 파이차트 공통 헬퍼 ───────────────────────────────────── */
const PIE_PALETTE = [
  '#0066cc','#34c759','#ff9500','#5e5ce6','#ff3b30',
  '#30b0c7','#ff6b35','#bf5af2','#32ade6','#8e8e93',
  '#ffd60a','#ac8e68','#6ac4dc','#4caf50','#e91e63',
];

function buildPieChart(canvasId, items, chartRef) {
  if (chartRef) chartRef.destroy();

  const total = items.reduce((s, a) => s + (a.current_value || 0), 0);
  const labels = items.map(a => a.name);
  const data   = items.map(a => a.current_value || 0);
  const colors = items.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]);

  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  /* 중앙 총액 텍스트 플러그인 */
  const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart) {
      const { ctx, chartArea: { top, bottom, left, right } } = chart;
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = "600 15px 'Pretendard', -apple-system, sans-serif";
      ctx.fillStyle = '#1d1d1f';
      ctx.fillText(fmtShort(total), cx, cy - 8);
      ctx.font = "400 11px 'Pretendard', -apple-system, sans-serif";
      ctx.fillStyle = '#7a7a7a';
      ctx.fillText('총 평가금액', cx, cy + 10);
      ctx.restore();
    },
  };

  return new Chart(canvas, {
    type: 'doughnut',
    plugins: [centerTextPlugin],
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor:     colors,
        borderWidth: 1.5,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderColor: '#e0e0e0',
          borderWidth: 1,
          titleColor: '#1d1d1f',
          bodyColor: '#333',
          padding: 12,
          callbacks: {
            label: c => {
              const pct = total > 0 ? ((c.parsed / total) * 100).toFixed(1) : '0.0';
              return `  ${fmtShort(c.parsed)}  (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function pieHTML(canvasId, items) {
  const total = items.reduce((s, a) => s + (a.current_value || 0), 0);
  const legendItems = items.map((a, i) => {
    const pct  = total > 0 ? ((a.current_value / total) * 100).toFixed(1) : '0.0';
    const color = PIE_PALETTE[i % PIE_PALETTE.length];
    return `<div class="pie-legend-item">
      <span class="pie-legend-dot" style="background:${color}"></span>
      <span class="pie-legend-name">${a.name}</span>
      <span class="pie-legend-right">
        <span class="pie-legend-pct">${pct}%</span>
        <span class="pie-legend-val">${fmtShort(a.current_value)}</span>
      </span>
    </div>`;
  }).join('');

  return `<div class="pie-section">
    <div class="pie-chart-wrap">
      <canvas id="${canvasId}" width="200" height="200"></canvas>
    </div>
    <div class="pie-legend-list">${legendItems}</div>
  </div>`;
}

/* ── 주식 탭 ──────────────────────────────────────────────── */
async function renderStocksTab(assets) {
  const el = document.getElementById('stocks-content');

  const STOCK_SECTIONS = [
    { label: '국내주식 · 일반계좌', filter: a => a.category === 'domestic_stock' && a.subcategory === 'regular' },
    { label: '국내주식 · ISA',      filter: a => a.category === 'domestic_stock' && a.subcategory === 'isa' },
    { label: '해외주식',             filter: a => a.category === 'us_stock' },
  ];

  const allStocks = assets
    .filter(a => (a.category === 'domestic_stock' && ['regular','isa'].includes(a.subcategory)) || a.category === 'us_stock')
    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0));

  const pnlBtn = `<div style="display:flex;justify-content:flex-end;margin-bottom:16px">
    <button class="btn-secondary-pill" style="font-size:13px;padding:7px 18px" onclick="openPnlPopup('stocks')">실현손익 보기</button>
  </div>`;

  if (!allStocks.length) {
    el.innerHTML = pnlBtn;
    return;
  }

  el.innerHTML = pnlBtn + pieHTML('stocks-pie-canvas', allStocks) + multiSectionTable(STOCK_SECTIONS, assets);
  stocksChart = buildPieChart('stocks-pie-canvas', allStocks, stocksChart);
}

/* ── 실현손익 섹션 ────────────────────────────────────────── */
async function renderRealizedPnlSection(category) {
  const rows = await fetch(`/api/realized-pnl?category=${category}`).then(r => r.json());
  const thisYear = new Date().getFullYear();

  const fmtPnl = v => {
    const cls = v > 0 ? 'profit' : v < 0 ? 'loss' : 'neutral';
    const sign = v > 0 ? '+' : '';
    return `<span class="${cls}">${sign}${Math.round(v).toLocaleString('ko-KR')}</span>`;
  };

  if (category === 'coins') {
    // ── 코인: 거래별 목록 ──────────────────────────────────
    const sorted = [...rows].sort((a,b) => (b.deal_date||'').localeCompare(a.deal_date||''));
    const grandTotal = sorted.reduce((s,r) => s + r.amount, 0);

    const trs = sorted.map(r => `
      <tr>
        <td class="td-left" style="color:var(--color-ink-muted-48)">${r.deal_date || '—'}</td>
        <td class="td-left"><strong>${r.ticker || '—'}</strong></td>
        <td style="color:var(--color-ink-muted-48)">${r.trade_amount ? fmt(r.trade_amount) : '—'}</td>
        <td style="color:var(--color-ink-muted-48)">${r.profit_rate ? (r.profit_rate > 0 ? '+' : '') + r.profit_rate.toFixed(2) + '%' : '—'}</td>
        <td>${fmtPnl(r.amount)}</td>
        <td>
          <button class="btn-icon-sm" style="color:var(--color-loss)" onclick="deleteRealizedPnl(${r.id},'coins')" title="삭제">✕</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="6" class="table-empty">거래 기록이 없습니다.</td></tr>';

    const totalRow = `
      <tr style="font-weight:700;background:var(--color-surface-raised)">
        <td class="td-left" colspan="4">누적 합계</td>
        <td>${fmtPnl(grandTotal)}</td>
        <td></td>
      </tr>`;

    return `
    <div class="table-card" style="margin-bottom:0">
      <table class="asset-table">
        <thead><tr>
          <th class="th-left" style="min-width:100px">거래일</th>
          <th class="th-left" style="min-width:70px">코인</th>
          <th style="min-width:110px">거래금액</th>
          <th style="min-width:80px">수익률</th>
          <th style="min-width:120px">실현손익</th>
          <th style="min-width:40px"></th>
        </tr></thead>
        <tbody>${trs}${totalRow}</tbody>
      </table>
    </div>`;
  }

  // ── 주식: 연간 합산 + 올해 월별 ──────────────────────────
  const annualRows  = rows.filter(r => r.month === 0).sort((a,b) => a.year - b.year);
  const monthlyRows = rows.filter(r => r.month > 0 && r.year === thisYear).sort((a,b) => a.month - b.month);
  const thisYearMonthlySum = monthlyRows.reduce((s,r) => s + r.amount, 0);
  const grandTotal = annualRows.reduce((s,r) => s + r.amount, 0) + thisYearMonthlySum;

  const annualTrs = annualRows.map(r => `
    <tr>
      <td class="td-left" style="color:var(--color-ink-muted-48)">${r.year}년</td>
      <td>${fmtPnl(r.amount)}</td>
      <td>
        <button class="btn-icon-sm" onclick="openPnlModal('stocks',${r.year},0,${r.amount})" title="편집">✏</button>
        <button class="btn-icon-sm" style="color:var(--color-loss)" onclick="deleteRealizedPnl(${r.id},'stocks')" title="삭제">✕</button>
      </td>
    </tr>`).join('');

  const monthlyTrs = monthlyRows.map(r => `
    <tr>
      <td class="td-left" style="color:var(--color-ink-muted-48)">${r.month}월</td>
      <td>${fmtPnl(r.amount)}</td>
      <td>
        <button class="btn-icon-sm" onclick="openPnlModal('stocks',${r.year},${r.month},${r.amount})" title="편집">✏</button>
        <button class="btn-icon-sm" style="color:var(--color-loss)" onclick="deleteRealizedPnl(${r.id},'stocks')" title="삭제">✕</button>
      </td>
    </tr>`).join('');

  const thisYearRow = monthlyRows.length ? `
    <tr style="font-weight:700;border-top:2px solid var(--color-separator)">
      <td class="td-left">${thisYear}년 합계</td>
      <td>${fmtPnl(thisYearMonthlySum)}</td><td></td>
    </tr>` : '';

  const totalRow = `
    <tr style="font-weight:700;background:var(--color-surface-raised)">
      <td class="td-left">누적 합계</td>
      <td>${fmtPnl(grandTotal)}</td><td></td>
    </tr>`;

  return `
  <div class="table-card" style="margin-bottom:0">
    <table class="asset-table">
      <thead><tr>
        <th class="th-left" style="min-width:100px">정산일</th>
        <th style="min-width:140px">실현손익</th>
        <th style="min-width:56px"></th>
      </tr></thead>
        <tbody>
          ${annualTrs}
          ${monthlyTrs ? `
            <tr class="section-subhead">
              <td class="td-left" colspan="3" style="font-size:12px;font-weight:600;color:var(--color-ink-muted-48)">${thisYear}년</td>
            </tr>
            ${monthlyTrs}
            ${thisYearRow}` : ''}
          ${totalRow}
        </tbody>
      </table>
    </div>`;
}

/* ── 실현손익 팝업 ──────────────────────────────────────────── */
async function openPnlPopup(category) {
  const label = category === 'stocks' ? '주식' : '코인';
  document.getElementById('pnl-popup-title').textContent = `실현손익 · ${label}`;
  document.getElementById('pnl-popup-category').value = category;
  await refreshPnlPopup(category);
  document.getElementById('pnl-popup').classList.remove('hidden');
}

async function refreshPnlPopup(category) {
  const body = document.getElementById('pnl-popup-body');
  body.innerHTML = await renderRealizedPnlSection(category);
}

function closePnlPopup() {
  document.getElementById('pnl-popup').classList.add('hidden');
}

async function deleteRealizedPnl(id, category) {
  if (!confirm('삭제할까요?')) return;
  await fetch(`/api/realized-pnl/${id}`, { method: 'DELETE' });
  await refreshPnlPopup(category);
}

/* ── 연금 탭 ──────────────────────────────────────────────── */
async function renderPensionTab(assets) {
  const el = document.getElementById('pension-content');

  const PENSION_SECTIONS = [
    { label: '연금저축', filter: a => a.category === 'pension' && a.subcategory === 'pension_savings' },
    { label: 'IRP',      filter: a => a.category === 'pension' && a.subcategory === 'irp' },
  ];

  const allPension = assets
    .filter(a => a.category === 'pension')
    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0));

  // 연금 원금 추적 데이터 (병렬 로딩)
  let pensionSummary = {};
  let contributions  = [];
  try {
    [pensionSummary, contributions] = await Promise.all([
      fetch('/api/pension/summary').then(r => r.json()),
      fetch('/api/pension/contributions').then(r => r.json()),
    ]);
    _pensionSummary = pensionSummary;
  } catch(e) { console.error('pension summary error', e); }

  // ── 원금 추적 카드 ──────────────────────────────────────
  const ACCOUNT_ORDER = ['pension_savings', 'irp', 'personal_company'];
  const ANNUAL_TARGETS = { pension_savings: 2640000, irp: 3000000, personal_company: null };
  const ACCOUNT_LABELS = { pension_savings: '연금저축', irp: 'IRP', personal_company: '개인연금(회사)' };

  const trackCards = ACCOUNT_ORDER.map(atype => {
    const s = pensionSummary[atype] || {};
    const cum   = s.cumulative    || 0;
    const cur   = s.current_value || 0;
    const prof  = s.profit        || 0;
    const rate  = s.profit_rate   || 0;
    const yc    = s.year_contrib  || 0;
    const target = ANNUAL_TARGETS[atype];
    const pCls  = colorClass(prof);

    let targetBadge = '';
    if (target) {
      const pct = Math.min((yc / target) * 100, 100).toFixed(0);
      const remaining = Math.max(target - yc, 0);
      targetBadge = `
        <div class="pension-target-wrap">
          <div class="pension-target-header">
            <span class="pension-target-label">올해 납입 <strong>${fmtShort(yc)}</strong> / 목표 ${fmtShort(target)}</span>
            <span class="pension-target-pct">${pct}%</span>
          </div>
          <div class="pension-progress-bar">
            <div class="pension-progress-fill" style="width:${pct}%"></div>
          </div>
          ${remaining > 0 ? `<p class="pension-target-remain">잔여 <strong>${fmtShort(remaining)}</strong></p>` : '<p class="pension-target-remain" style="color:var(--color-profit)">✓ 목표 달성</p>'}
        </div>`;
    }

    const editBtn = atype === 'personal_company'
      ? `<button class="btn-icon-sm" style="float:right;margin-top:-2px" onclick="openPcValueModal()" title="평가액 수정">✏</button>`
      : '';

    return `<div class="pension-track-card">
      <p class="pension-track-title">${ACCOUNT_LABELS[atype]}${editBtn}</p>
      <div class="pension-track-grid">
        <div class="pension-track-item">
          <p class="pension-track-label">누적 원금</p>
          <p class="pension-track-value">${fmtShort(cum)}</p>
        </div>
        <div class="pension-track-item">
          <p class="pension-track-label">현재 평가액</p>
          <p class="pension-track-value">${cur > 0 ? fmtShort(cur) : '<span style="color:var(--color-ink-muted-48)">—</span>'}</p>
        </div>
        <div class="pension-track-item">
          <p class="pension-track-label">순수익</p>
          <p class="pension-track-value ${pCls}">${cum > 0 ? fmtShort(prof) : '—'}</p>
        </div>
        <div class="pension-track-item">
          <p class="pension-track-label">원금 대비 수익률</p>
          <p class="pension-track-value ${pCls}">${cum > 0 ? fmtRate(rate) : '—'}</p>
        </div>
      </div>
      ${targetBadge}
    </div>`;
  }).join('');

  // ── 납입 이력 피벗 테이블 ───────────────────────────────────
  const COL_ORDER  = ['personal_company', 'pension_savings', 'irp'];
  const COL_LABELS = { personal_company: '개인연금\n/회사', pension_savings: '연금저축\n/연264', irp: 'IRP\n/연300' };
  const thisYear   = new Date().getFullYear();

  // 전년도까지 누적 (account별 합계)
  const prevSum = {};
  COL_ORDER.forEach(k => prevSum[k] = 0);
  contributions.forEach(c => {
    if (parseInt(c.contributed_date.slice(0,4)) < thisYear)
      prevSum[c.account_type] = (prevSum[c.account_type] || 0) + c.amount;
  });
  const prevTotal = COL_ORDER.reduce((s,k) => s + prevSum[k], 0);

  // 올해 월별 피벗 { 'YYYY-MM': { account_type: amount } }
  const monthMap = {};
  const idMap    = {};  // 삭제 버튼용 첫 번째 id
  contributions.forEach(c => {
    if (parseInt(c.contributed_date.slice(0,4)) !== thisYear) return;
    const ym = c.contributed_date.slice(0,7);
    if (!monthMap[ym]) { monthMap[ym] = {}; idMap[ym] = {}; }
    monthMap[ym][c.account_type] = (monthMap[ym][c.account_type] || 0) + c.amount;
    if (!idMap[ym][c.account_type]) idMap[ym][c.account_type] = c.id;
  });
  const months = Object.keys(monthMap).sort();

  // 올해 합계
  const yearSum  = {};
  COL_ORDER.forEach(k => yearSum[k] = months.reduce((s,m) => s + (monthMap[m][k]||0), 0));
  const yearTotal = COL_ORDER.reduce((s,k) => s + yearSum[k], 0);

  // 누적 합계
  const cumSum   = {};
  COL_ORDER.forEach(k => cumSum[k] = prevSum[k] + yearSum[k]);
  const cumTotal  = COL_ORDER.reduce((s,k) => s + cumSum[k], 0);

  const fmtCell = v => v ? fmt(v) : '<span style="color:var(--color-ink-muted-48)">—</span>';

  const prevRow = prevTotal > 0 ? `<tr style="color:var(--color-ink-muted-48);font-size:13px">
    <td class="td-left">~${thisYear-1}년 누적</td>
    ${COL_ORDER.map(k => `<td>${fmtCell(prevSum[k])}</td>`).join('')}
    <td style="font-weight:600">${fmt(prevTotal)}</td>
    <td></td>
  </tr>` : '';

  const monthRows = months.map(ym => {
    const label = ym.replace('-', '-').slice(2).replace('-0','-').replace(/-(\d)$/,'-0$1'); // YY-M
    const rowTotal = COL_ORDER.reduce((s,k) => s + (monthMap[ym][k]||0), 0);
    return `<tr>
      <td class="td-left">${ym.slice(2).replace('-','년 ')}월</td>
      ${COL_ORDER.map(k => {
        const v = monthMap[ym][k];
        const id = idMap[ym][k];
        return `<td>${v ? `<span>${fmt(v)}</span>` : '<span style="color:var(--color-ink-muted-48)">—</span>'}${id ? `<button class="btn-icon-sm" onclick="deletePensionContrib(${id})" title="삭제" style="color:var(--color-loss);margin-left:4px;font-size:10px">✕</button>` : ''}</td>`;
      }).join('')}
      <td style="font-weight:600">${fmt(rowTotal)}</td>
      <td></td>
    </tr>`;
  }).join('');

  const emptyRow = !months.length ? `<tr><td colspan="${COL_ORDER.length+2}" class="table-empty">올해 납입 기록이 없습니다.</td></tr>` : '';

  const yearRow = `<tr style="border-top:2px solid var(--color-separator);font-weight:700">
    <td class="td-left">${thisYear}년 합계</td>
    ${COL_ORDER.map(k => `<td>${fmtCell(yearSum[k])}</td>`).join('')}
    <td>${fmt(yearTotal)}</td>
    <td></td>
  </tr>`;

  const cumRow = `<tr style="background:var(--color-surface-raised);font-weight:700">
    <td class="td-left">누적 원금 합계</td>
    ${COL_ORDER.map(k => `<td>${fmtCell(cumSum[k])}</td>`).join('')}
    <td>${fmt(cumTotal)}</td>
    <td></td>
  </tr>`;

  const trackCardsSection = `
    <div class="pension-track-section">
      <div class="section-group-header" style="margin-bottom:16px">
        <span class="section-label" style="margin-bottom:0">원금 납입 추적</span>
        <button class="btn-primary" style="font-size:12px;padding:7px 16px" onclick="openPensionContribModal()">원금 납입 기록</button>
      </div>
      <div class="pension-track-cards">${trackCards}</div>
    </div>`;

  const contribTable = `
    <div class="pension-track-section" style="margin-top:32px">
      <div class="section-label" style="margin-bottom:8px">납입 이력</div>
      <div class="table-card" style="margin-bottom:0;overflow-x:auto">
        <table class="asset-table">
          <thead>
            <tr>
              <th class="th-left" style="min-width:90px">기간</th>
              ${COL_ORDER.map(k => `<th style="min-width:120px">${COL_LABELS[k].replace('\n','<br>')}</th>`).join('')}
              <th style="min-width:110px">합계</th>
              <th style="min-width:40px"></th>
            </tr>
          </thead>
          <tbody>
            ${prevRow}
            ${monthRows}
            ${emptyRow}
            ${yearRow}
            ${cumRow}
          </tbody>
        </table>
      </div>
    </div>`;

  // ── 보유 종목 테이블 ───────────────────────────────────
  let holdingSection = '';
  if (allPension.length) {
    holdingSection = multiSectionTable(PENSION_SECTIONS, assets);
  }

  el.innerHTML = trackCardsSection
    + (holdingSection ? `<div class="pension-track-section">${holdingSection}</div>` : '')
    + contribTable;

}

/* ── 연금 납입 기록 모달 ────────────────────────────────────── */
function openPensionContribModal(defaultType) {
  document.getElementById('pc-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('pc-amount').value = '';
  document.getElementById('pc-memo').value = '';
  if (defaultType) document.getElementById('pc-account-type').value = defaultType;
  document.getElementById('pension-contrib-modal').classList.remove('hidden');
}

async function submitPensionContrib(e) {
  e.preventDefault();
  await fetch('/api/pension/contributions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_type:     document.getElementById('pc-account-type').value,
      amount:           parseFloat(document.getElementById('pc-amount').value),
      contributed_date: document.getElementById('pc-date').value,
      memo:             document.getElementById('pc-memo').value,
    }),
  });
  closeModal('pension-contrib-modal');
  // 연금 탭만 재렌더
  renderPensionTab(_allAssets);
}

function openAddRealEstateModal() {
  editingAssetId = null;
  document.getElementById('modal-title').textContent = '부동산 자산 추가';
  document.getElementById('asset-form').reset();
  document.getElementById('asset-id').value = '';
  document.getElementById('f-category').value = 'real_estate';
  onCategoryChange();
  document.getElementById('asset-modal').classList.remove('hidden');
}

async function deletePensionContrib(id) {
  if (!confirm('이 납입 기록을 삭제하시겠습니까?')) return;
  await fetch(`/api/pension/contributions/${id}`, { method: 'DELETE' });
  renderPensionTab(_allAssets);
}

/* ── 개인연금(회사) 평가액 수정 ─────────────────────────────── */
function openPcValueModal() {
  const cur = (_pensionSummary?.personal_company?.current_value) || 0;
  document.getElementById('pc-value-input').value = cur ? Math.round(cur) : '';
  document.getElementById('pc-value-modal').classList.remove('hidden');
}

async function savePcValue() {
  const v = parseFloat(document.getElementById('pc-value-input').value);
  if (!v || v <= 0) { alert('금액을 입력해주세요.'); return; }
  await fetch('/api/pension/personal-company-value', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: v }),
  });
  closeModal('pc-value-modal');
  await renderPensionTab(_allAssets);
  renderOverviewTab(_allAssets);
}

/* ── 코인 탭 ──────────────────────────────────────────────── */
async function renderCoinsTab(assets) {
  const el = document.getElementById('coins-content');

  const COIN_SECTIONS = [
    { label: '업비트 · 현물',    filter: a => a.category === 'coin_upbit'  && !a.is_staking },
    { label: '업비트 · 스테이킹', filter: a => a.category === 'coin_upbit' &&  a.is_staking },
    { label: '바이낸스',          filter: a => a.category === 'coin_binance' },
  ];

  const allCoins = assets
    .filter(a => ['coin_upbit','coin_binance'].includes(a.category))
    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0));

  if (!allCoins.length) {
    el.innerHTML = `<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px">
      <button class="btn-secondary-pill" style="font-size:13px;padding:7px 18px" onclick="openBuyMoreModal()">추가 매수</button>
      <button class="btn-secondary-pill" style="font-size:13px;padding:7px 18px" onclick="openPnlPopup('coins')">실현손익 보기</button>
    </div>`;
    return;
  }

  el.innerHTML = `<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px">
    <button class="btn-secondary-pill" style="font-size:13px;padding:7px 18px" onclick="openBuyMoreModal()">추가 매수</button>
    <button class="btn-secondary-pill" style="font-size:13px;padding:7px 18px" onclick="openPnlPopup('coins')">실현손익 보기</button>
  </div>` + pieHTML('coins-pie-canvas', allCoins) + multiSectionTable(COIN_SECTIONS, assets);
  coinsChart = buildPieChart('coins-pie-canvas', allCoins, coinsChart);
}

/* ── 추가 매수 모달 ──────────────────────────────────────────── */
function openBuyMoreModal() {
  const coins = _allAssets.filter(a => ['coin_upbit','coin_binance'].includes(a.category));
  const sel = document.getElementById('bm-asset-id');
  sel.innerHTML = coins.map(a =>
    `<option value="${a.id}" data-qty="${a.quantity||0}" data-avg="${a.avg_price||0}" data-amt="${a.purchase_amount||0}">
      ${a.name} (${a.ticker || '—'})
    </option>`
  ).join('');
  document.getElementById('bm-add-amount').value = '';
  document.getElementById('bm-add-price').value  = '';
  document.getElementById('bm-preview').classList.add('hidden');
  document.getElementById('buy-more-modal').classList.remove('hidden');
}

function updateBuyMorePreview() {
  const sel      = document.getElementById('bm-asset-id');
  const opt      = sel.options[sel.selectedIndex];
  if (!opt) return;
  const oldQty   = parseFloat(opt.dataset.qty) || 0;
  const oldAvg   = parseFloat(opt.dataset.avg) || 0;
  const oldAmt   = parseFloat(opt.dataset.amt) || 0;
  const addAmt   = parseFloat(document.getElementById('bm-add-amount').value) || 0;
  const addPrice = parseFloat(document.getElementById('bm-add-price').value)  || 0;

  const preview = document.getElementById('bm-preview');
  if (!addAmt || !addPrice) { preview.classList.add('hidden'); return; }

  const addQty   = addAmt / addPrice;
  const newQty   = oldQty + addQty;
  const newAmt   = oldAmt + addAmt;
  const newAvg   = newQty > 0 ? newAmt / newQty : 0;

  const fmtQ = v => Number(v.toFixed(6)).toLocaleString('ko-KR', { maximumFractionDigits: 6 });
  const fmtW = v => Math.round(v).toLocaleString('ko-KR') + '원';

  document.getElementById('bm-pre-qty').textContent  = '+' + fmtQ(addQty);
  document.getElementById('bm-old-qty').textContent  = fmtQ(oldQty);
  document.getElementById('bm-new-qty').textContent  = fmtQ(newQty);
  document.getElementById('bm-old-avg').textContent  = fmtW(oldAvg);
  document.getElementById('bm-new-avg').textContent  = fmtW(newAvg);
  document.getElementById('bm-old-amt').textContent  = fmtW(oldAmt);
  document.getElementById('bm-new-amt').textContent  = fmtW(newAmt);
  preview.classList.remove('hidden');
}

async function submitBuyMore() {
  const assetId  = document.getElementById('bm-asset-id').value;
  const addAmt   = parseFloat(document.getElementById('bm-add-amount').value);
  const addPrice = parseFloat(document.getElementById('bm-add-price').value);
  if (!assetId || !addAmt || !addPrice) { alert('모든 항목을 입력해주세요.'); return; }
  const res = await fetch(`/api/assets/${assetId}/buy-more`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ add_amount: addAmt, add_price: addPrice }),
  }).then(r => r.json());
  if (res.ok) { closeModal('buy-more-modal'); loadAssets(); }
  else alert(res.error || '오류 발생');
}

/* ── 공통: 섹션 테이블 빌더 ──────────────────────────────── */
/* 공통 thead (주식·코인·연금 보유 테이블 공유) */
const HOLDING_THEAD = `<thead>
  <tr>
    <th class="th-left">종목명</th>
    <th class="th-left" style="min-width:70px">티커</th>
    <th style="min-width:70px">수량</th>
    <th style="min-width:90px">평균단가</th>
    <th style="min-width:100px">매입금액</th>
    <th style="min-width:110px">현재가 (KRW)</th>
    <th style="min-width:100px">평가금액</th>
    <th style="min-width:100px">손익</th>
    <th style="min-width:70px">수익률</th>
    <th style="min-width:56px"></th>
  </tr>
</thead>`;

/* 섹션 하나의 tbody 반환 (label=섹션명, items=자산 배열) */
function sectionTbody(label, items) {
  const totalPurchase = items.reduce((s, a) => s + (a.purchase_amount || 0), 0);
  const totalValue    = items.reduce((s, a) => s + (a.current_value   || 0), 0);
  const totalPL       = totalValue - totalPurchase;
  const totalRate     = totalPurchase > 0 ? (totalPL / totalPurchase) * 100 : 0;
  const pCls          = colorClass(totalPL);

  const rows = items.map(a => {
    const pCls2 = colorClass(a.profit_loss);
    const curPrice = a.current_price_krw != null
      ? Math.round(a.current_price_krw).toLocaleString('ko-KR')
      : '<span class="neutral">조회 실패</span>';
    const stakingDot = a.is_staking ? '<span class="staking-dot" title="스테이킹"></span>' : '';
    return `<tr>
      <td class="td-left" style="font-weight:600">${a.name}${stakingDot}</td>
      <td class="td-left" style="color:var(--color-ink-muted-48)">${a.ticker || '—'}</td>
      <td>${a.quantity ? Number(a.quantity).toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : '—'}</td>
      <td>${a.avg_price ? Math.round(a.avg_price).toLocaleString('ko-KR') : '—'}</td>
      <td>${fmt(a.purchase_amount)}</td>
      <td>${curPrice}</td>
      <td><strong>${fmt(a.current_value)}</strong></td>
      <td class="${pCls2}">${fmt(a.profit_loss)}</td>
      <td class="${pCls2}">${fmtRate(a.profit_rate)}</td>
      <td>
        <button class="btn-icon-sm" onclick="openEditModal(${a.id})" title="편집">✏</button>
        <button class="btn-icon-sm" onclick="deleteAsset(${a.id})" title="삭제" style="color:var(--color-loss)">✕</button>
      </td>
    </tr>`;
  }).join('');

  return `<tbody class="section-tbody">
    <tr class="section-subhead">
      <td class="td-left" colspan="6">
        <span class="section-label" style="margin:0;font-size:13px">${label}</span>
      </td>
      <td colspan="4" style="text-align:right">
        <span class="sg-total-item">평가 <strong>${fmtShort(totalValue)}</strong> <span class="${pCls}">(${totalPL >= 0 ? '+' : ''}${fmtShort(totalPL)})</span></span>
        <span class="sg-total-item ${pCls}" style="margin-left:16px"><strong>${fmtRate(totalRate)}</strong></span>
      </td>
    </tr>
    ${rows}
  </tbody>`;
}

/* 여러 섹션을 하나의 테이블로 (열 정렬 일치) */
function multiSectionTable(sections, allItems) {
  const tbodies = sections
    .map(s => ({ label: s.label, items: allItems.filter(s.filter) }))
    .filter(s => s.items.length)
    .map(s => sectionTbody(s.label, s.items))
    .join('');

  return `<div class="table-card" style="margin-bottom:0;overflow-x:auto">
    <table class="asset-table">
      ${HOLDING_THEAD}
      ${tbodies}
    </table>
  </div>`;
}

/* 하위 호환: 단일 섹션 테이블 */
function sectionTable(label, items) {
  return `<div class="table-card" style="margin-bottom:0">
    <table class="asset-table">
      ${HOLDING_THEAD}
      ${sectionTbody(label, items)}
    </table>
  </div>`;
}

/* ── 부동산 탭 ────────────────────────────────────────────── */
async function renderRealEstateTab() {
  const el = document.getElementById('realestate-content');

  // 자산 관리 헤더 (항상 표시)
  const reAssets = _allAssets.filter(a => a.category === 'real_estate');
  const assetRows = reAssets.map(a => `
    <tr>
      <td class="td-left" style="font-weight:600">${a.name}</td>
      <td class="td-left" style="color:var(--color-ink-muted-48)">${a.ticker || '—'}</td>
      <td>${fmt(a.purchase_amount)}</td>
      <td><strong>${fmt(a.current_value)}</strong></td>
      <td>
        <button class="btn-icon-sm" onclick="openEditModal(${a.id})" title="편집">✏</button>
        <button class="btn-icon-sm" onclick="deleteAsset(${a.id})" title="삭제" style="color:var(--color-loss)">✕</button>
      </td>
    </tr>`).join('');

  const assetTable = `
    <div class="section-group" style="margin-bottom:28px">
      <div class="section-group-header">
        <span class="section-label" style="margin-bottom:0">부동산 자산 목록</span>
        <button class="btn-primary" style="font-size:12px;padding:7px 16px" onclick="openAddRealEstateModal()">자산 추가</button>
      </div>
      <div class="table-card" style="margin-bottom:0">
        <table class="asset-table">
          <thead>
            <tr>
              <th class="th-left">자산명</th>
              <th class="th-left">아파트명 (티커)</th>
              <th style="min-width:120px">매입금액</th>
              <th style="min-width:120px">현재 평가액</th>
              <th style="min-width:56px"></th>
            </tr>
          </thead>
          <tbody>${assetRows || '<tr><td colspan="5" class="table-empty">등록된 부동산이 없습니다.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;

  el.innerHTML = assetTable + '<div id="realestate-charts"><p class="table-empty" style="padding:32px">실거래가 불러오는 중...</p></div>';

  const chartsEl = document.getElementById('realestate-charts');

  let data = [];
  try {
    data = await fetch('/api/realestate/history').then(r => r.json());
  } catch(e) { console.error(e); }

  if (!data.length || data.every(d => !d.history.length)) {
    chartsEl.innerHTML = '<p class="table-empty" style="padding:32px;color:var(--color-ink-muted-48)">티커(아파트명)를 입력하면 실거래가 추이가 표시됩니다.</p>';
    return;
  }

  const sections = data.filter(d => d.history.length).map(apt => {
    const history = apt.history;
    if (!history.length) return `<div class="section-group"><p class="table-empty" style="padding:20px">${apt.apt_name} — 최근 거래 없음</p></div>`;

    // 면적별 그룹핑 (5㎡ 단위 반올림)
    const areaGroups = {};
    history.forEach(h => {
      const areaKey = Math.round(h.area * 10) / 10;
      if (!areaGroups[areaKey]) areaGroups[areaKey] = [];
      areaGroups[areaKey].push(h);
    });

    // 거래 건수 많은 면적 순으로 정렬
    const sortedAreas = Object.keys(areaGroups)
      .sort((a, b) => areaGroups[b].length - areaGroups[a].length);

    const AREA_COLORS = ['#0066cc','#34c759','#ff9500','#bf5af2','#ff3b30','#30b0c7'];

    // 최신 거래 요약
    const latest = [...history].sort((a,b) => b.date.localeCompare(a.date))[0];
    const oldest = history[0];
    const priceDiff = latest.price_man - oldest.price_man;
    const pricePct  = oldest.price_man > 0 ? ((priceDiff / oldest.price_man) * 100).toFixed(1) : 0;
    const pCls = colorClass(priceDiff);

    // 차트 캔버스 ID
    const canvasId = `re-chart-${apt.asset_id}`;

    // 테이블 (최근 15건)
    const recentRows = [...history]
      .sort((a,b) => b.date.localeCompare(a.date))
      .slice(0, 20)
      .map(h => `<tr>
        <td class="td-left" style="color:var(--color-ink-muted-48)">${h.date}</td>
        <td class="td-left">${h.name}</td>
        <td style="color:var(--color-ink-muted-48)">${h.area}㎡</td>
        <td style="color:var(--color-ink-muted-48)">${h.floor}층</td>
        <td style="font-weight:600">${h.price_man.toLocaleString('ko-KR')}만원</td>
      </tr>`).join('');

    return `
      <div class="section-group" style="margin-bottom:32px">
        <div class="section-group-header">
          <span class="section-label" style="margin-bottom:0">${apt.asset_name}</span>
          <div class="section-group-totals">
            <span class="sg-total-item">최근 거래 <strong>${latest.price_man.toLocaleString('ko-KR')}만원</strong> (${latest.date})</span>
            <span class="sg-total-item ${pCls}">조회 시작 대비 <strong>${priceDiff >= 0 ? '+' : ''}${priceDiff.toLocaleString('ko-KR')}만원 (${pricePct}%)</strong></span>
          </div>
        </div>

        <div class="re-chart-card">
          <div class="re-chart-legend" id="${canvasId}-legend"></div>
          <div style="position:relative;height:320px">
            <canvas id="${canvasId}"></canvas>
          </div>
        </div>

        <div class="section-label" style="margin-top:24px;margin-bottom:8px">최근 실거래 내역 (최근 20건)</div>
        <div class="table-card" style="margin-bottom:0">
          <table class="asset-table">
            <thead>
              <tr>
                <th class="th-left">거래일</th>
                <th class="th-left">아파트명</th>
                <th>전용면적</th>
                <th>층수</th>
                <th>거래금액</th>
              </tr>
            </thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  chartsEl.innerHTML = sections;

  // 차트 렌더
  data.forEach(apt => {
    const history = apt.history;
    if (!history.length) return;

    const canvasId = `re-chart-${apt.asset_id}`;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (_reCharts[canvasId]) { _reCharts[canvasId].destroy(); }

    // 면적별 그룹핑 — x를 타임스탬프로 변환
    const areaGroups = {};
    history.forEach(h => {
      const k = h.area + '㎡';
      if (!areaGroups[k]) areaGroups[k] = [];
      areaGroups[k].push({
        x:       new Date(h.date).getTime(),
        y:       h.price_man,
        floor:   h.floor,
        area:    k,
        dateStr: h.date,
      });
    });

    const sortedAreas = Object.keys(areaGroups)
      .sort((a, b) => areaGroups[b].length - areaGroups[a].length);

    const COLORS = ['#0066cc','#34c759','#ff9500','#bf5af2','#ff3b30','#30b0c7','#8e8e93'];

    const datasets = sortedAreas.map((area, i) => {
      const color = COLORS[i % COLORS.length];
      const pts = [...areaGroups[area]].sort((a, b) => a.x - b.x);
      return {
        label:           area,
        data:            pts,
        parsing:         false,
        borderColor:     color,
        backgroundColor: color + 'cc',
        pointRadius:     7,
        pointHoverRadius: 10,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        showLine:        pts.length > 1,
        borderWidth:     1.5,
        tension:         0,
        fill:            false,
      };
    });

    // 커스텀 범례
    const legendEl = document.getElementById(`${canvasId}-legend`);
    if (legendEl) {
      legendEl.innerHTML = sortedAreas.map((area, i) =>
        `<span class="re-legend-item">
          <span class="re-legend-dot" style="background:${COLORS[i % COLORS.length]}"></span>
          ${area} (${areaGroups[area].length}건)
        </span>`
      ).join('');
    }

    _reCharts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(255,255,255,0.97)',
            borderColor: '#e0e0e0',
            borderWidth: 1,
            titleColor: '#1d1d1f',
            bodyColor: '#333',
            padding: 12,
            callbacks: {
              title: items => items[0].raw.dateStr,
              label: item => `  ${item.raw.area}  ${item.raw.floor}층  ${item.raw.y.toLocaleString('ko-KR')}만원`,
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'month',
              tooltipFormat: 'yyyy-MM-dd',
              displayFormats: { month: 'yy.MM' },
            },
            ticks: {
              color: '#7a7a7a',
              font: { family: 'Pretendard', size: 11 },
              maxTicksLimit: 14,
            },
            grid:  { color: 'rgba(0,0,0,0.04)' },
            border: { color: '#e0e0e0' },
          },
          y: {
            ticks: {
              color: '#7a7a7a',
              font: { family: 'Pretendard', size: 11 },
              callback: v => v.toLocaleString('ko-KR') + '만',
            },
            grid:  { color: 'rgba(0,0,0,0.04)' },
            border: { color: '#e0e0e0' },
          },
        },
      },
    });
  });
}

/* ── 탭 전환 ──────────────────────────────────────────────── */
function switchTab(name) {
  document.querySelectorAll('.sub-tab').forEach((t, i) =>
    t.classList.toggle('active', ALL_TABS[i] === name));
  document.querySelectorAll('.tab-content').forEach(tc =>
    tc.classList.add('hidden'));
  document.getElementById(`tab-${name}`).classList.remove('hidden');
  if (name === 'realestate') renderRealEstateTab();
}

/* ── 대출 ─────────────────────────────────────────────────── */
async function loadLoans() {
  try {
    const loans = await fetch('/api/loans').then(r => r.json());
    renderLoans(loans);
  } catch (e) { console.error('loans error', e); }
}

function renderLoans(loans) {
  const el = document.getElementById('loans-container');
  const REPAY = { equal_payment: '원리금균등상환', equal_principal: '원금균등상환' };

  el.innerHTML = loans.map(l => {
    const paidPct = Math.min((l.payments_made / l.term_months) * 100, 100).toFixed(1);
    const rateTag = l.repayment_type === 'equal_payment'
      ? `<span class="loan-type-tag">${l.current_annual_rate}% 변동금리</span>`
      : `<span class="loan-type-tag">${l.annual_rate}% 고정금리</span>`;

    const rateChangeBtn = l.repayment_type === 'equal_payment'
      ? `<button class="btn-primary" style="font-size:12px;padding:7px 16px"
           onclick="openRateChangeModal(${l.id}, ${l.payments_made}, ${l.remaining_principal})">
           금리 변경
         </button>` : '';

    return `<div class="loan-card">
      <div class="loan-card-top">
        <h3 class="loan-name">${l.name}</h3>
        ${rateTag}
      </div>
      <div class="loan-stats">
        <div>
          <p class="loan-stat-label">최초 대출금</p>
          <p class="loan-stat-value">${fmtShort(l.original_principal)}</p>
        </div>
        <div>
          <p class="loan-stat-label">남은 원금</p>
          <p class="loan-stat-value loan-stat-value--red">${fmtShort(l.remaining_principal)}</p>
        </div>
        <div>
          <p class="loan-stat-label">납부 원금 누계</p>
          <p class="loan-stat-value">${fmtShort(l.principal_paid_so_far)}</p>
        </div>
        <div>
          <p class="loan-stat-label">납부 이자 누계</p>
          <p class="loan-stat-value">${fmtShort(l.interest_paid_so_far)}</p>
        </div>
        <div>
          <p class="loan-stat-label">잔여 기간</p>
          <p class="loan-stat-value">${l.payments_left}개월</p>
        </div>
      </div>
      <div class="loan-progress-meta">
        <span>${l.payments_made}회 완료 / 총 ${l.term_months}회</span>
        <span>${paidPct}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${paidPct}%"></div>
      </div>
      <div class="loan-next">
        <div class="loan-next-row">
          <span class="loan-next-row-label">다음 납부일</span>
          <span class="loan-next-row-value loan-next-row-value--date">${l.next_payment_date}</span>
        </div>
        <div class="loan-next-row">
          <span class="loan-next-row-label">원금</span>
          <span class="loan-next-row-value">${fmt(l.next_principal)}</span>
        </div>
        <div class="loan-next-row">
          <span class="loan-next-row-label">이자</span>
          <span class="loan-next-row-value">${fmt(l.next_interest)}</span>
        </div>
        <div class="loan-next-row" style="border-top:1px solid var(--color-hairline);padding-top:8px;margin-top:6px">
          <span class="loan-next-row-label">이번 달 합계</span>
          <span class="loan-next-row-value" style="font-size:17px">${fmt(l.monthly_payment)}</span>
        </div>
      </div>
      ${renderRateHistory(l.rate_history || [], l.payments_made)}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
        ${rateChangeBtn}
        <button class="btn-secondary-pill" style="font-size:12px;padding:7px 16px"
          onclick="openLoanModal(${l.id},'${l.name}',${l.payments_made},'${(l.notes||'').replace(/'/g,"\\'")}')">
          납부 회차 수정
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderRateHistory(history, totalPayments) {
  if (!history || history.length === 0) return '';
  const segments = [...history].sort((a, b) => a.from_payment - b.from_payment);
  const items = segments.map(seg => {
    const isActive = seg.to_payment === null;
    const fromLabel = seg.from_payment === 0 ? '최초 실행' : `${seg.from_payment}회차 납부 후`;
    const toLabel = isActive ? `현재 (${totalPayments}회차)` : `${seg.to_payment}회차까지`;
    const termUsed = isActive ? totalPayments - seg.from_payment : seg.to_payment - seg.from_payment;
    return `<div class="rate-segment ${isActive ? 'rate-segment--active' : ''}">
      <p class="rate-segment-rate">${seg.annual_rate}%</p>
      <p class="rate-segment-meta">${fromLabel} → ${toLabel} · ${termUsed}회 적용</p>
    </div>`;
  }).join('');
  return `<div class="rate-history">
    <p class="rate-history-title">금리 변경 이력</p>
    <div class="rate-timeline">${items}</div>
  </div>`;
}

/* ── 히스토리 ─────────────────────────────────────────────── */
async function loadHistory() {
  try {
    const history = await fetch('/api/history').then(r => r.json());
    renderHistoryChart(history);
    renderHistoryTable(history);
  } catch (e) { console.error('history error', e); }
}

function renderHistoryChart(history) {
  const ctx = document.getElementById('history-chart').getContext('2d');
  if (historyChart) historyChart.destroy();

  const GROUPS = [
    /* 아래부터 위 순서로 쌓임 */
    {
      label: '부동산', color: '#30b0c7',
      value: h => (h.breakdown?.real_estate || 0) / 1e8,
    },
    {
      label: '예금/적금·퇴직금', color: '#34c759',
      value: h => ((h.breakdown?.bank || 0) + (h.breakdown?.severance || 0)) / 1e8,
    },
    {
      label: '연금', color: '#bf5af2',
      value: h => (h.breakdown?.pension || 0) / 1e8,
    },
    {
      label: '주식', color: '#0066cc',
      value: h => ((h.breakdown?.domestic_stock || 0) + (h.breakdown?.us_stock || 0)) / 1e8,
    },
    {
      label: '코인', color: '#ff9500',
      value: h => ((h.breakdown?.coin_upbit || 0) + (h.breakdown?.coin_binance || 0)) / 1e8,
    },
  ];

  const labels = history.map(h => h.snapshot_date);

  /* 누적 영역 — 자산 그룹별 */
  const stackedDatasets = GROUPS.map(g => ({
    label: g.label,
    data: history.map(h => g.value(h)),
    backgroundColor: g.color + 'b3',   /* 70% alpha */
    borderColor:     g.color,
    borderWidth: 1.5,
    fill: true,
    stack: 'assets',
    tension: 0.35,
    pointRadius: history.length > 1 ? 3 : 5,
    pointBackgroundColor: g.color,
    pointBorderColor: '#fff',
    pointBorderWidth: 1.5,
  }));

  /* 순자산 — 별도 우측 y축 (스택에서 분리) */
  const netWorthDataset = {
    label: '순자산',
    data: history.map(h => h.net_worth / 1e8),
    borderColor: '#1d1d1f',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderDash: [6, 3],
    fill: false,
    tension: 0.35,
    pointRadius: history.length > 1 ? 4 : 6,
    pointBackgroundColor: '#1d1d1f',
    pointBorderColor: '#fff',
    pointBorderWidth: 2,
    yAxisID: 'y2',
    order: 0,
  };

  historyChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [...stackedDatasets, netWorthDataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#7a7a7a',
            font: { family: 'Pretendard, -apple-system, sans-serif', size: 12 },
            usePointStyle: true,
            pointStyleWidth: 10,
            boxHeight: 8,
            padding: 16,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderColor: '#e0e0e0',
          borderWidth: 1,
          titleColor: '#1d1d1f',
          bodyColor: '#333',
          padding: 14,
          callbacks: {
            label: c => {
              const v = c.parsed.y;
              if (v === 0 && c.dataset.label !== '순자산') return null;
              return `  ${c.dataset.label}: ${v.toFixed(2)}억원`;
            },
            footer: items => {
              /* 총자산 합계 표시 (순자산 제외한 스택 합계) */
              const total = items
                .filter(i => i.dataset.label !== '순자산')
                .reduce((s, i) => s + i.parsed.y, 0);
              return total > 0 ? `  총자산: ${total.toFixed(2)}억원` : '';
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#7a7a7a', font: { family: 'Pretendard', size: 11 } },
          grid:  { color: 'rgba(0,0,0,0.04)' },
          border: { color: '#e0e0e0' },
        },
        y: {
          stacked: true,
          ticks: { color: '#7a7a7a', font: { family: 'Pretendard', size: 11 }, callback: v => v + '억' },
          grid:  { color: 'rgba(0,0,0,0.04)' },
          border: { color: '#e0e0e0' },
        },
        y2: {
          /* 순자산 축 — 눈금 숨김, y와 같은 범위로 동기화 */
          display: false,
          stacked: false,
        },
      },
    },
  });
}

function renderHistoryTable(history) {
  const tbody = document.getElementById('history-tbody');
  if (!history.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">저장된 스냅샷이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = [...history].reverse().map(h => `<tr>
    <td class="td-left" style="font-weight:600">${h.snapshot_date}</td>
    <td style="color:var(--color-profit)">${fmtShort(h.total_assets)}</td>
    <td style="color:var(--color-loss)">${fmtShort(h.total_liabilities)}</td>
    <td style="font-weight:600;color:var(--color-primary)">${fmtShort(h.net_worth)}</td>
    <td class="td-left" style="color:var(--color-ink-muted-48)">${h.memo || ''}</td>
    <td><button class="btn-icon-sm" onclick="deleteSnapshot(${h.id})" style="color:var(--color-loss)">✕</button></td>
  </tr>`).join('');
}

/* ── 모달 ─────────────────────────────────────────────────── */
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

/* ── 실현손익 모달 ──────────────────────────────────────────── */
let _pnlCategory = 'stocks';
let _pnlEditId   = null;

function openPnlModal(category, year, month, currentAmount) {
  _pnlCategory = category;
  _pnlEditId   = null;
  document.getElementById('pnl-modal-title').textContent =
    `실현손익 입력 · ${category === 'stocks' ? '주식' : '코인'}`;

  const thisYear = new Date().getFullYear();
  const today    = new Date().toISOString().slice(0,10);

  // 코인: 날짜 입력 / 주식: 연도+월 선택 토글
  const isCoins = category === 'coins';
  document.getElementById('pnl-period-stocks').style.display = isCoins ? 'none' : '';
  document.getElementById('pnl-period-coins').style.display  = isCoins ? '' : 'none';

  if (!isCoins) {
    const ySel = document.getElementById('pnl-year');
    ySel.innerHTML = '';
    for (let y = thisYear; y >= 2020; y--) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = `${y}년`;
      if (y === (year || thisYear)) opt.selected = true;
      ySel.appendChild(opt);
    }
    document.getElementById('pnl-month').value = month || 0;
  } else {
    document.getElementById('pnl-deal-date').value = today;
    // 보유 코인 목록 채우기
    const coinSel = document.getElementById('pnl-coin-ticker');
    coinSel.innerHTML = '';
    const coins = _allAssets.filter(a => ['coin_upbit','coin_binance'].includes(a.category));
    const seen = new Set();
    coins.forEach(a => {
      if (!a.ticker || seen.has(a.ticker)) return;
      seen.add(a.ticker);
      const opt = document.createElement('option');
      opt.value = a.ticker;
      opt.textContent = `${a.name} (${a.ticker})`;
      coinSel.appendChild(opt);
    });
    document.getElementById('pnl-trade-amount').value = '';
    document.getElementById('pnl-profit-rate').value  = '';
    document.getElementById('pnl-calc-result').style.display = 'none';
  }

  const amt = currentAmount != null ? currentAmount : '';
  document.getElementById('pnl-amount-display').value = amt !== '' ? Number(amt).toLocaleString('ko-KR') : '';
  document.getElementById('pnl-amount-value').value   = amt;
  document.getElementById('pnl-memo').value = '';
  braunReset();
  if (amt !== '') braunSetValue(amt);
  document.getElementById('pnl-modal').classList.remove('hidden');
}

function closePnlModal() {
  document.getElementById('pnl-modal').classList.add('hidden');
}

async function submitPnl() {
  const raw    = document.getElementById('pnl-amount-value').value;
  const amount = parseFloat(raw);
  if (isNaN(amount)) { alert('금액을 입력해주세요.'); return; }
  const memo = document.getElementById('pnl-memo').value;

  let body;
  if (_pnlCategory === 'coins') {
    const deal_date    = document.getElementById('pnl-deal-date').value;
    const ticker       = document.getElementById('pnl-coin-ticker').value;
    const trade_amount = parseFloat(document.getElementById('pnl-trade-amount').value) || 0;
    const profit_rate  = parseFloat(document.getElementById('pnl-profit-rate').value)  || 0;
    if (!deal_date) { alert('거래일을 입력해주세요.'); return; }
    body = { category: 'coins', deal_date, amount, memo, ticker, trade_amount, profit_rate };
  } else {
    const year  = parseInt(document.getElementById('pnl-year').value);
    const month = parseInt(document.getElementById('pnl-month').value);
    body = { category: _pnlCategory, year, month, amount, memo };
  }

  await fetch('/api/realized-pnl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  closePnlModal();
  await refreshPnlPopup(_pnlCategory);
}

/* ── Braun 계산기 로직 ──────────────────────────────────────── */
let _bExpr    = '';   // 현재 입력 표현식
let _bResult  = null; // 마지막 = 결과
let _bNewNum  = true; // 다음 숫자 입력 시 새 숫자 시작 여부

function braunReset() {
  _bExpr = ''; _bResult = null; _bNewNum = true;
  _braunShow('0');
}
function braunSetValue(v) {
  _bExpr = String(v); _bResult = v; _bNewNum = true;
  _braunShow(v);
}
function _braunShow(v) {
  const n = parseFloat(v);
  const display = isNaN(n) ? '오류'
    : n.toLocaleString('ko-KR', { maximumFractionDigits: 8 });
  document.getElementById('braun-display').textContent = display;
}

function braunKey(k) {
  if (k === 'AC') { braunReset(); return; }
  if (k === '+/-') {
    if (_bExpr !== '' && _bExpr !== '0') {
      _bExpr = _bExpr.startsWith('-') ? _bExpr.slice(1) : '-' + _bExpr;
      _bNewNum = false;
      try { _braunShow(eval(_bExpr)); } catch(e) {}
    }
    return;
  }
  if (k === '%') {
    try {
      const v = eval(_bExpr) / 100;
      _bExpr = String(v); _bResult = v; _bNewNum = true;
      _braunShow(v);
    } catch(e) {}
    return;
  }
  if (['+','-','*','/'].includes(k)) {
    if (_bExpr === '') return;
    _bExpr += k; _bNewNum = true;
    return;
  }
  if (k === '=') {
    if (_bExpr === '') return;
    try {
      const v = eval(_bExpr);
      _bResult = v; _bExpr = String(v); _bNewNum = true;
      _braunShow(v);
    } catch(e) { _braunShow('오류'); }
    return;
  }
  // 숫자 / 소수점
  if (_bNewNum && ['+','-','*','/'].every(op => !_bExpr.endsWith(op))) {
    _bExpr = ''; _bNewNum = false;
  }
  if (k === '.' && _bExpr.split(/[+\-*/]/).pop().includes('.')) return;
  _bExpr += k;
  try { _braunShow(eval(_bExpr)); } catch(e) {}
}

function braunApply() {
  let v;
  try { v = eval(_bExpr); } catch(e) { return; }
  if (isNaN(v)) return;
  v = Math.round(v * 100) / 100;
  document.getElementById('pnl-amount-display').value = v.toLocaleString('ko-KR');
  document.getElementById('pnl-amount-value').value   = v;
  braunSetValue(v);
}

/* 코인 손익 자동계산 */
function calcCoinPnl() {
  const tradeAmt  = parseFloat(document.getElementById('pnl-trade-amount').value);
  const rate      = parseFloat(document.getElementById('pnl-profit-rate').value);
  const resultEl  = document.getElementById('pnl-calc-result');
  const valueEl   = document.getElementById('pnl-calc-value');
  if (isNaN(tradeAmt) || isNaN(rate)) { resultEl.style.display = 'none'; return; }

  // 실현손익 = 거래금액 × (수익률/100)
  const pnl = Math.round(tradeAmt * rate / 100);
  const cls  = pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : 'neutral';
  const sign = pnl > 0 ? '+' : '';
  valueEl.innerHTML = `<span class="${cls}">${sign}${pnl.toLocaleString('ko-KR')}원</span>`;
  resultEl.style.display = 'flex';

  // hidden 필드에도 반영
  document.getElementById('pnl-amount-display').value = pnl.toLocaleString('ko-KR');
  document.getElementById('pnl-amount-value').value   = pnl;
  braunSetValue(pnl);
}

/* 직접 숫자 입력 시 hidden value 동기화 */
function pnlAmountInput(el) {
  const raw = el.value.replace(/,/g, '').trim();
  const v   = parseFloat(raw);
  document.getElementById('pnl-amount-value').value = isNaN(v) ? '' : v;
  if (!isNaN(v)) braunSetValue(v);
}

function openAddModal() {
  editingAssetId = null;
  document.getElementById('modal-title').textContent = '자산 추가';
  document.getElementById('asset-form').reset();
  document.getElementById('asset-id').value = '';
  onCategoryChange();
  document.getElementById('asset-modal').classList.remove('hidden');
}

async function openEditModal(id) {
  const a = _allAssets.find(x => x.id === id);
  if (!a) return;
  editingAssetId = id;
  document.getElementById('modal-title').textContent = '자산 편집';
  document.getElementById('asset-id').value = id;
  document.getElementById('f-category').value = a.category;
  onCategoryChange();
  document.getElementById('f-subcategory').value = a.subcategory || '';
  document.getElementById('f-name').value        = a.name;
  document.getElementById('f-ticker').value      = a.ticker || '';
  document.getElementById('f-quantity').value    = a.quantity || '';
  document.getElementById('f-avg-price').value   = a.avg_price || '';
  document.getElementById('f-purchase-amount').value = a.purchase_amount || '';
  document.getElementById('f-staking').value     = a.is_staking ? '1' : '0';
  document.getElementById('f-notes').value       = a.notes || '';
  document.getElementById('asset-modal').classList.remove('hidden');
}

function onCategoryChange() {
  const cat = document.getElementById('f-category').value;
  const opts = SUBCATS[cat] || [];
  const subcatSel = document.getElementById('f-subcategory');
  subcatSel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  document.getElementById('subcategory-group').style.display = opts.length > 1 ? '' : 'none';
  const hasTicker = ['domestic_stock','us_stock','coin_upbit','coin_binance','real_estate'].includes(cat);
  document.getElementById('ticker-group').style.display  = hasTicker ? '' : 'none';
  document.getElementById('quantity-row').style.display  = (hasTicker && cat !== 'real_estate') ? '' : 'none';
  document.getElementById('staking-group').style.display = cat === 'coin_upbit' ? '' : 'none';

  // 부동산: 티커 라벨 변경 + 자동완성 활성화
  const tickerLabel = document.querySelector('#ticker-group .form-label');
  const tickerInput = document.getElementById('f-ticker');
  if (cat === 'real_estate') {
    if (tickerLabel) tickerLabel.textContent = '아파트명 (티커)';
    tickerInput.setAttribute('placeholder', '예) 신설동역자이르네');
    tickerInput.setAttribute('autocomplete', 'off');
    tickerInput.oninput = debounceAptSearch;
  } else {
    if (tickerLabel) tickerLabel.textContent = '티커 / 심볼';
    tickerInput.setAttribute('placeholder', '예) 005930, BTC');
    tickerInput.oninput = null;
    closeAptDropdown();
  }
}

/* ── 아파트명 자동완성 ────────────────────────────────────── */
let _aptSearchTimer = null;

function debounceAptSearch() {
  clearTimeout(_aptSearchTimer);
  _aptSearchTimer = setTimeout(doAptSearch, 300);
}

async function doAptSearch() {
  const q = document.getElementById('f-ticker').value.trim();
  closeAptDropdown();
  if (q.length < 1) return;
  try {
    const results = await fetch(`/api/realestate/search?q=${encodeURIComponent(q)}&lawd_cd=11230`)
      .then(r => r.json());
    if (!results.length) return;
    showAptDropdown(results);
  } catch(e) {}
}

function showAptDropdown(items) {
  closeAptDropdown();
  const input = document.getElementById('f-ticker');
  const wrap  = input.closest('.form-group');

  const dropdown = document.createElement('div');
  dropdown.id = 'apt-autocomplete';
  dropdown.className = 'apt-autocomplete';
  items.forEach(name => {
    const item = document.createElement('div');
    item.className = 'apt-autocomplete-item';
    item.textContent = name;
    item.onmousedown = (e) => {
      e.preventDefault();
      input.value = name;
      closeAptDropdown();
    };
    dropdown.appendChild(item);
  });
  wrap.style.position = 'relative';
  wrap.appendChild(dropdown);
}

function closeAptDropdown() {
  const el = document.getElementById('apt-autocomplete');
  if (el) el.remove();
}

document.addEventListener('click', e => {
  if (!e.target.closest('#ticker-group')) closeAptDropdown();
});

async function submitAsset(e) {
  e.preventDefault();
  const cat = document.getElementById('f-category').value;
  const data = {
    category:        cat,
    subcategory:     document.getElementById('f-subcategory').value,
    name:            document.getElementById('f-name').value,
    ticker:          document.getElementById('f-ticker').value.trim().toUpperCase(),
    quantity:        parseFloat(document.getElementById('f-quantity').value) || 0,
    avg_price:       parseFloat(document.getElementById('f-avg-price').value) || 0,
    purchase_amount: parseFloat(document.getElementById('f-purchase-amount').value) || 0,
    is_staking:      document.getElementById('f-staking').value,
    notes:           document.getElementById('f-notes').value,
    currency:        ['us_stock','coin_binance'].includes(cat) ? 'USD' : 'KRW',
  };
  const id = editingAssetId;
  await fetch(id ? `/api/assets/${id}` : '/api/assets', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  closeModal('asset-modal');
  await refreshAll();
  // 부동산 탭이 열려 있으면 차트도 재렌더
  if (!document.getElementById('tab-realestate').classList.contains('hidden')) {
    renderRealEstateTab();
  }
}

async function deleteAsset(id) {
  if (!confirm('이 자산을 삭제하시겠습니까?')) return;
  await fetch(`/api/assets/${id}`, { method: 'DELETE' });
  refreshAll();
}

/* ── 대출 편집 ────────────────────────────────────────────── */
function openLoanModal(id, name, paymentsMade, notes) {
  document.getElementById('loan-id').value            = id;
  document.getElementById('loan-name').value          = name;
  document.getElementById('loan-payments-made').value = paymentsMade;
  document.getElementById('loan-notes').value         = notes;
  document.getElementById('loan-modal').classList.remove('hidden');
}

async function submitLoan(e) {
  e.preventDefault();
  const id = document.getElementById('loan-id').value;
  await fetch(`/api/loans/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name:          document.getElementById('loan-name').value,
      payments_made: parseInt(document.getElementById('loan-payments-made').value),
      notes:         document.getElementById('loan-notes').value,
    }),
  });
  closeModal('loan-modal');
  loadLoans(); loadSummary();
}

/* ── 금리 변경 ────────────────────────────────────────────── */
let _rcDebounce = null;

function openRateChangeModal(loanId, paymentsMade, remaining) {
  document.getElementById('rc-loan-id').value = loanId;
  document.getElementById('rc-payments-made').textContent = `${paymentsMade}회`;
  document.getElementById('rc-remaining').textContent     = fmtShort(remaining);
  document.getElementById('rc-new-rate').value   = '';
  document.getElementById('rc-term-left').textContent = '—';
  document.getElementById('rc-preview').classList.add('hidden');
  document.getElementById('rate-change-modal').classList.remove('hidden');
}

function previewRateChange() {
  clearTimeout(_rcDebounce);
  const rate = parseFloat(document.getElementById('rc-new-rate').value);
  if (!rate || rate <= 0) { document.getElementById('rc-preview').classList.add('hidden'); return; }
  _rcDebounce = setTimeout(async () => {
    const loanId = document.getElementById('rc-loan-id').value;
    const d = await fetch(`/api/loans/${loanId}/rate-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annual_rate: rate }),
    }).then(r => r.json());
    document.getElementById('rc-term-left').textContent    = `${d.term_left}개월`;
    document.getElementById('rc-old-payment').textContent  = fmt(d.old_monthly_payment);
    document.getElementById('rc-new-payment').textContent  = fmt(d.new_monthly_payment);
    const diff = d.monthly_diff;
    const diffEl = document.getElementById('rc-diff');
    diffEl.textContent  = (diff >= 0 ? '+' : '') + fmt(diff).replace('원','') + '원';
    diffEl.style.color  = diff > 0 ? 'var(--color-loss)' : diff < 0 ? 'var(--color-profit)' : 'var(--color-ink)';
    document.getElementById('rc-preview').classList.remove('hidden');
  }, 400);
}

async function confirmRateChange() {
  const loanId  = document.getElementById('rc-loan-id').value;
  const newRate = parseFloat(document.getElementById('rc-new-rate').value);
  if (!newRate || newRate <= 0) { alert('새 연이율을 입력해 주세요.'); return; }
  const d = await fetch(`/api/loans/${loanId}/rate-change`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annual_rate: newRate }),
  }).then(r => r.json());
  if (!d.ok) { alert(d.error || '오류가 발생했습니다.'); return; }
  closeModal('rate-change-modal');
  alert(`금리가 ${newRate}%로 변경되었습니다.\n변경 후 월 납부액: ${fmt(d.new_monthly_payment)}`);
  loadLoans(); loadSummary();
}

/* ── 스냅샷 ───────────────────────────────────────────────── */
function openSnapshotModal() {
  document.getElementById('snap-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('snapshot-modal').classList.remove('hidden');
}

async function saveSnapshot() {
  const d = await fetch('/api/snapshot', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: document.getElementById('snap-date').value, memo: document.getElementById('snap-memo').value }),
  }).then(r => r.json());
  closeModal('snapshot-modal');
  alert(`스냅샷이 저장되었습니다.\n순자산 ${fmtShort(d.net_worth)}`);
  loadHistory();
}

async function deleteSnapshot(id) {
  if (!confirm('이 스냅샷을 삭제하시겠습니까?')) return;
  await fetch(`/api/history/${id}`, { method: 'DELETE' });
  loadHistory();
}
