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
const ALL_TABS = ['assets', 'bank', 'stocks', 'pension', 'coins', 'loans', 'realestate', 'history'];

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
    // 연금 탭을 먼저 로드해서 _pensionSummary 채운 뒤 overview 렌더
    await renderPensionTab(_allAssets);
    renderOverviewTab(_allAssets);
    renderBankTab(_allAssets);
    renderStocksTab(_allAssets);
    renderCoinsTab(_allAssets);
  } catch (e) { console.error('assets error', e); }
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
                <th>금액</th>
                <th class="th-left">메모</th>
                <th></th>
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
function renderStocksTab(assets) {
  const el = document.getElementById('stocks-content');

  const STOCK_SECTIONS = [
    { label: '국내주식 · 일반계좌', filter: a => a.category === 'domestic_stock' && a.subcategory === 'regular' },
    { label: '국내주식 · ISA',      filter: a => a.category === 'domestic_stock' && a.subcategory === 'isa' },
    { label: '해외주식',             filter: a => a.category === 'us_stock' },
  ];

  const allStocks = assets
    .filter(a => (a.category === 'domestic_stock' && ['regular','isa'].includes(a.subcategory)) || a.category === 'us_stock')
    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0));

  if (!allStocks.length) {
    el.innerHTML = '<p class="table-empty" style="padding:40px">등록된 주식 종목이 없습니다.</p>';
    return;
  }

  const tables = STOCK_SECTIONS.map(sec => {
    const items = assets.filter(sec.filter);
    return items.length ? sectionTable(sec.label, items) : '';
  }).join('');

  el.innerHTML = pieHTML('stocks-pie-canvas', allStocks) + tables;
  stocksChart = buildPieChart('stocks-pie-canvas', allStocks, stocksChart);
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

  // ── 납입 이력 테이블 ───────────────────────────────────
  const contribRows = contributions.length
    ? contributions.map(c => `<tr>
        <td class="td-left" style="color:var(--color-ink-muted-48)">${c.contributed_date}</td>
        <td class="td-left"><span class="cat-tag cat-tag--pension">${ACCOUNT_LABELS[c.account_type] || c.account_type}</span></td>
        <td style="font-weight:600">${fmt(c.amount)}</td>
        <td class="td-left" style="color:var(--color-ink-muted-48)">${c.memo || '—'}</td>
        <td><button class="btn-icon-sm" onclick="deletePensionContrib(${c.id})" title="삭제" style="color:var(--color-loss)">✕</button></td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="table-empty">납입 기록이 없습니다.</td></tr>';

  const trackSection = `
    <div class="pension-track-section">
      <div class="section-group-header" style="margin-bottom:16px">
        <span class="section-label" style="margin-bottom:0">원금 납입 추적</span>
        <button class="btn-primary" style="font-size:12px;padding:7px 16px" onclick="openPensionContribModal()">원금 납입 기록</button>
      </div>
      <div class="pension-track-cards">${trackCards}</div>
      <div class="section-label" style="margin-top:28px;margin-bottom:8px">납입 이력</div>
      <div class="table-card" style="margin-bottom:0">
        <table class="asset-table">
          <thead>
            <tr>
              <th class="th-left">날짜</th>
              <th class="th-left">계좌</th>
              <th>납입금액</th>
              <th class="th-left">메모</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="pension-contrib-tbody">${contribRows}</tbody>
        </table>
      </div>
    </div>`;

  // ── 보유 종목 테이블 ───────────────────────────────────
  let holdingSection = '';
  if (allPension.length) {
    const tables = PENSION_SECTIONS.map(sec => {
      const items = assets.filter(sec.filter);
      return items.length ? sectionTable(sec.label, items) : '';
    }).join('');
    holdingSection = pieHTML('pension-pie-canvas', allPension) + tables;
  }

  el.innerHTML = trackSection + (holdingSection ? `<div style="margin-top:32px">${holdingSection}</div>` : '');

  if (allPension.length) {
    window._pensionChart = buildPieChart('pension-pie-canvas', allPension, window._pensionChart || null);
  }
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
function renderCoinsTab(assets) {
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
    el.innerHTML = '<p class="table-empty" style="padding:40px">등록된 코인 종목이 없습니다.</p>';
    return;
  }

  const tables = COIN_SECTIONS.map(sec => {
    const items = assets.filter(sec.filter);
    return items.length ? sectionTable(sec.label, items) : '';
  }).join('');

  el.innerHTML = pieHTML('coins-pie-canvas', allCoins) + tables;
  coinsChart = buildPieChart('coins-pie-canvas', allCoins, coinsChart);
}

/* ── 공통: 섹션 테이블 빌더 ──────────────────────────────── */
function sectionTable(label, items, type) {
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

  return `
    <div class="section-group">
      <div class="section-group-header">
        <span class="section-label" style="margin-bottom:0">${label}</span>
        <div class="section-group-totals">
          <span class="sg-total-item">평가 <strong>${fmtShort(totalValue)}</strong></span>
          <span class="sg-total-item ${pCls}">손익 <strong>${fmtRate(totalRate)}</strong> (${fmtShort(totalPL)})</span>
        </div>
      </div>
      <div class="table-card" style="margin-bottom:0">
        <table class="asset-table">
          <thead>
            <tr>
              <th class="th-left">종목명</th>
              <th class="th-left">티커</th>
              <th>수량</th>
              <th>평균단가</th>
              <th>매입금액</th>
              <th>현재가 (KRW)</th>
              <th>평가금액</th>
              <th>손익</th>
              <th>수익률</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
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
              <th>매입금액</th>
              <th>현재 평가액</th>
              <th></th>
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
