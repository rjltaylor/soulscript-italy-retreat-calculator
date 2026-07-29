(function () {
  'use strict';

  /* ---------------------------------------------------------------
     Theme toggle (no localStorage — sandboxed iframes block it)
  --------------------------------------------------------------- */
  const root = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  let currentTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', currentTheme);

  function setThemeIcon() {
    themeToggle.setAttribute('aria-label', 'Switch to ' + (currentTheme === 'dark' ? 'light' : 'dark') + ' mode');
    themeToggle.innerHTML = currentTheme === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  setThemeIcon();
  themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', currentTheme);
    setThemeIcon();
    recalc(true);
  });

  document.getElementById('printBtn').addEventListener('click', () => window.print());

  /* ---------------------------------------------------------------
     Formatters
  --------------------------------------------------------------- */
  const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const fmtUSD2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const fmtPct = (v) => (isFinite(v) ? v.toFixed(0) + '%' : '—');
  const fmtPct1 = (v) => (isFinite(v) ? v.toFixed(1) + '%' : '—');

  /* ---------------------------------------------------------------
     DOM refs
  --------------------------------------------------------------- */
  const el = (id) => document.getElementById(id);
  const inputs = {
    nights: el('nights'), minGuests: el('minGuests'), maxCapacity: el('maxCapacity'),
    guestCount: el('guestCount'), guestCountOut: el('guestCountOut'),
    villaWeeklyRate: el('villaWeeklyRate'), villaDailyRate: el('villaDailyRate'),
    chefFee: el('chefFee'), foodPerGuestDay: el('foodPerGuestDay'),
    transportFixed: el('transportFixed'), transportPerGuest: el('transportPerGuest'),
    excursionPerGuest: el('excursionPerGuest'), excursionFixed: el('excursionFixed'),
    hostTravel: el('hostTravel'), marketing: el('marketing'),
    contingencyPct: el('contingencyPct'), paymentFeePct: el('paymentFeePct'),
    tier1Price: el('tier1Price'), tier1Pct: el('tier1Pct'),
    tier2Price: el('tier2Price'), tier2Pct: el('tier2Pct'),
    tier3Price: el('tier3Price'), tier3Pct: el('tier3Pct'),
    monthlyTarget: el('monthlyTarget'), retreatsPerYear: el('retreatsPerYear'),
  };

  let villaMode = 'weekly';
  const villaToggleBtns = document.querySelectorAll('[data-villa-mode]');
  villaToggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      villaMode = btn.getAttribute('data-villa-mode');
      villaToggleBtns.forEach((b) => b.classList.toggle('active', b === btn));
      el('villaWeeklyField').style.display = villaMode === 'weekly' ? '' : 'none';
      el('villaDailyField').style.display = villaMode === 'daily' ? '' : 'none';
      recalc();
    });
  });

  /* ---------------------------------------------------------------
     Read numeric value safely
  --------------------------------------------------------------- */
  function num(node, fallback = 0) {
    const v = parseFloat(node.value);
    return isFinite(v) ? v : fallback;
  }

  /* ---------------------------------------------------------------
     Core model
  --------------------------------------------------------------- */
  function readState() {
    const nights = Math.max(1, num(inputs.nights, 10));
    let minGuests = Math.max(1, num(inputs.minGuests, 6));
    let maxCapacity = Math.max(minGuests, num(inputs.maxCapacity, 12));

    // keep slider bounds in sync
    inputs.guestCount.min = minGuests;
    inputs.guestCount.max = maxCapacity;
    let guestCount = num(inputs.guestCount, 10);
    guestCount = Math.min(maxCapacity, Math.max(minGuests, guestCount));
    inputs.guestCount.value = guestCount;

    const villaCost = villaMode === 'weekly'
      ? (nights / 7) * num(inputs.villaWeeklyRate, 0)
      : nights * num(inputs.villaDailyRate, 0);

    const fixedCosts =
      villaCost +
      num(inputs.chefFee, 0) +
      num(inputs.transportFixed, 0) +
      num(inputs.excursionFixed, 0) +
      num(inputs.hostTravel, 0) +
      num(inputs.marketing, 0);

    const varCostBase =
      num(inputs.foodPerGuestDay, 0) * nights +
      num(inputs.transportPerGuest, 0) +
      num(inputs.excursionPerGuest, 0);

    const contingencyPct = Math.max(0, num(inputs.contingencyPct, 0)) / 100;
    const paymentFeePct = Math.max(0, num(inputs.paymentFeePct, 0)) / 100;

    // Pricing tiers — normalize percentages
    const tiers = [
      { price: Math.max(0, num(inputs.tier1Price, 0)), pct: Math.max(0, num(inputs.tier1Pct, 0)) },
      { price: Math.max(0, num(inputs.tier2Price, 0)), pct: Math.max(0, num(inputs.tier2Pct, 0)) },
      { price: Math.max(0, num(inputs.tier3Price, 0)), pct: Math.max(0, num(inputs.tier3Pct, 0)) },
    ];
    let pctSum = tiers.reduce((s, t) => s + t.pct, 0);
    if (pctSum <= 0) { tiers.forEach((t) => (t.norm = 1 / 3)); pctSum = 1; }
    else { tiers.forEach((t) => (t.norm = t.pct / pctSum)); }

    const avgPrice = tiers.reduce((s, t) => s + t.price * t.norm, 0);

    const monthlyTarget = Math.max(0, num(inputs.monthlyTarget, 0));
    const retreatsPerYear = Math.max(1, num(inputs.retreatsPerYear, 4));

    return { nights, minGuests, maxCapacity, guestCount, villaCost, fixedCosts, varCostBase,
      contingencyPct, paymentFeePct, tiers, avgPrice, monthlyTarget, retreatsPerYear };
  }

  // Effective variable cost per guest (includes payment processing fee on price)
  function effVarCost(state) {
    return state.varCostBase + state.paymentFeePct * state.avgPrice;
  }

  function computeForGuests(state, guests) {
    const ev = effVarCost(state);
    const revenue = guests * state.avgPrice;
    const subtotal = state.fixedCosts + guests * ev;
    const cost = subtotal * (1 + state.contingencyPct);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, margin };
  }

  function computeBreakeven(state) {
    const ev = effVarCost(state);
    const evAdj = ev * (1 + state.contingencyPct);
    const fixedAdj = state.fixedCosts * (1 + state.contingencyPct);
    const denom = state.avgPrice - evAdj;
    const contributionPerGuest = state.avgPrice - ev; // before contingency, for display
    if (denom <= 0 || state.avgPrice <= 0) {
      return { guests: null, occupancy: null, contribution: contributionPerGuest };
    }
    const guests = fixedAdj / denom;
    const occupancy = (guests / state.maxCapacity) * 100;
    return { guests, occupancy, contribution: contributionPerGuest };
  }

  /* ---------------------------------------------------------------
     Chart
  --------------------------------------------------------------- */
  let chart = null;
  function themeColor(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function renderChart(state, rows) {
    const ctx = document.getElementById('profitChart').getContext('2d');
    const textColor = themeColor('--color-text-muted');
    const gridColor = themeColor('--color-divider');
    const revenueColor = themeColor('--color-secondary');
    const costColor = themeColor('--color-primary');
    const profitColor = themeColor('--color-success');

    const labels = rows.map((r) => r.guests + ' guests');
    const revenueData = rows.map((r) => Math.round(r.revenue));
    const costData = rows.map((r) => Math.round(r.cost));
    const profitData = rows.map((r) => Math.round(r.profit));

    const data = {
      labels,
      datasets: [
        { type: 'bar', label: 'Revenue', data: revenueData, backgroundColor: color(revenueColor, 0.75), borderRadius: 4, order: 2 },
        { type: 'bar', label: 'Total cost', data: costData, backgroundColor: color(costColor, 0.75), borderRadius: 4, order: 2 },
        { type: 'line', label: 'Net profit', data: profitData, borderColor: profitColor, backgroundColor: profitColor, tension: 0.3, pointRadius: 4, pointBackgroundColor: profitColor, borderWidth: 2.5, order: 1 },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: textColor, usePointStyle: true, boxWidth: 8, font: { family: getComputedStyle(document.body).fontFamily, size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtUSD.format(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 12 } }, grid: { display: false } },
        y: {
          ticks: { color: textColor, font: { size: 12 }, callback: (v) => fmtUSD.format(v) },
          grid: { color: gridColor },
        },
      },
    };

    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { data, options });
    }
  }

  function color(hex, alpha) {
    // hex like #c1622d -> rgba
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /* ---------------------------------------------------------------
     Main recalc — reads all inputs, updates every output
  --------------------------------------------------------------- */
  function recalc() {
    const state = readState();

    // slider fill + output
    inputs.guestCountOut.textContent = state.guestCount;
    const fillPct = ((state.guestCount - state.minGuests) / (state.maxCapacity - state.minGuests || 1)) * 100;
    inputs.guestCount.style.setProperty('--range-fill', fillPct + '%');

    // villa total
    el('villaTotalOut').textContent = fmtUSD.format(state.villaCost);

    // tiers guest breakdown + avg price
    const t1 = Math.round(state.guestCount * state.tiers[0].norm);
    const t2 = Math.round(state.guestCount * state.tiers[1].norm);
    let t3 = state.guestCount - t1 - t2;
    if (t3 < 0) t3 = 0;
    el('tier1Guests').textContent = `${t1} guest${t1 === 1 ? '' : 's'} · ${Math.round(state.tiers[0].norm * 100)}%`;
    el('tier2Guests').textContent = `${t2} guest${t2 === 1 ? '' : 's'} · ${Math.round(state.tiers[1].norm * 100)}%`;
    el('tier3Guests').textContent = `${t3} guest${t3 === 1 ? '' : 's'} · ${Math.round(state.tiers[2].norm * 100)}%`;
    el('avgPriceOut').textContent = fmtUSD2.format(state.avgPrice) + ' / guest';

    // current retreat numbers
    const current = computeForGuests(state, state.guestCount);
    const ev = effVarCost(state);

    el('sumGuests').textContent = state.guestCount;
    el('sumRevenue').textContent = fmtUSD.format(current.revenue);
    el('sumCost').textContent = fmtUSD.format(current.cost);
    el('sumProfit').textContent = fmtUSD.format(current.profit);
    el('sumMargin').textContent = fmtPct1(current.margin);

    el('occupancyBadge').textContent = fmtPct((state.guestCount / state.maxCapacity) * 100) + ' occupancy';

    el('kpiFixed').textContent = fmtUSD.format(state.fixedCosts);
    el('kpiVarPerGuest').textContent = fmtUSD2.format(ev);
    el('kpiTotalCost').textContent = fmtUSD.format(current.cost);
    el('kpiRevenue').textContent = fmtUSD.format(current.revenue);
    const kpiProfitEl = el('kpiProfit');
    kpiProfitEl.textContent = fmtUSD.format(current.profit);
    kpiProfitEl.classList.toggle('negative', current.profit < 0);
    kpiProfitEl.classList.toggle('positive', current.profit >= 0);
    el('kpiMargin').textContent = fmtPct1(current.margin);

    // break-even
    const be = computeBreakeven(state);
    const beNote = el('beNote');
    if (be.guests === null) {
      el('beGuests').textContent = '—';
      el('beOccupancy').textContent = '—';
      beNote.textContent = 'Your blended price per guest is at or below your variable cost per guest — no occupancy level breaks even. Raise prices or cut variable costs.';
    } else {
      el('beGuests').textContent = be.guests.toFixed(1) + ' guests';
      el('beOccupancy').textContent = fmtPct(be.occupancy);
      if (be.guests > state.maxCapacity) {
        beNote.textContent = `Break-even exceeds your ${state.maxCapacity}-guest capacity — this retreat can't break even at any sellable occupancy with current costs and pricing.`;
      } else {
        beNote.textContent = `Book ${Math.ceil(be.guests)} or more guests to cover fixed and variable costs (plus buffer) at this blended price.`;
      }
    }
    el('beContribution').textContent = fmtUSD2.format(be.contribution) + ' / guest';

    // sensitivity table + chart data
    const rows = [];
    for (let g = state.minGuests; g <= state.maxCapacity; g++) {
      const r = computeForGuests(state, g);
      rows.push({ guests: g, ...r, occupancy: (g / state.maxCapacity) * 100 });
    }

    const tbody = el('sensitivityBody');
    tbody.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const isCurrent = r.guests === state.guestCount;
      const isBreakeven = be.guests !== null && Math.round(be.guests) === r.guests;
      if (isCurrent) tr.classList.add('row-current');
      if (isBreakeven) tr.classList.add('row-breakeven');
      tr.innerHTML = `
        <td>${r.guests}</td>
        <td>${fmtPct(r.occupancy)}</td>
        <td>${fmtUSD.format(r.revenue)}</td>
        <td>${fmtUSD.format(r.cost)}</td>
        <td class="${r.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${fmtUSD.format(r.profit)}</td>
        <td>${fmtPct1(r.margin)}</td>
      `;
      tbody.appendChild(tr);
    });

    renderChart(state, rows);

    // Monthly income goal
    const profitPerRetreat = current.profit;
    const annualProfit = profitPerRetreat * state.retreatsPerYear;
    const monthlyProfit = annualProfit / 12;
    const gap = state.monthlyTarget - monthlyProfit;

    el('goalProfitPerRetreat').textContent = fmtUSD.format(profitPerRetreat);
    el('goalAnnualProfit').textContent = fmtUSD.format(annualProfit);
    el('goalMonthlyProfit').textContent = fmtUSD.format(monthlyProfit);
    const gapEl = el('goalGap');
    gapEl.textContent = (gap > 0 ? '+' : '') + fmtUSD.format(gap) + (gap > 0 ? ' short' : ' ahead');
    gapEl.classList.toggle('negative', gap > 0);
    gapEl.classList.toggle('positive', gap <= 0);

    el('goalRetreatsLabel').textContent = state.retreatsPerYear;
    el('goalCurrentPrice').textContent = fmtUSD2.format(state.avgPrice);

    // required price per guest to hit target at current guests & retreats/year
    const requiredAnnualProfit = state.monthlyTarget * 12;
    const requiredProfitPerRetreat = requiredAnnualProfit / state.retreatsPerYear;
    const fixedAdj = state.fixedCosts * (1 + state.contingencyPct);
    const denomPrice = state.guestCount * (1 - state.paymentFeePct * (1 + state.contingencyPct));
    let requiredPrice = null;
    if (denomPrice > 0) {
      requiredPrice = (requiredProfitPerRetreat + fixedAdj + state.guestCount * state.varCostBase * (1 + state.contingencyPct)) / denomPrice;
    }
    el('goalRequiredPrice').textContent = requiredPrice !== null && isFinite(requiredPrice) ? fmtUSD2.format(Math.max(0, requiredPrice)) : '—';

    // required retreats/year to hit target at current price
    let requiredRetreats = null;
    if (profitPerRetreat > 0) {
      requiredRetreats = requiredAnnualProfit / profitPerRetreat;
    }
    el('goalRequiredRetreats').textContent = requiredRetreats !== null && isFinite(requiredRetreats) && requiredRetreats > 0
      ? Math.ceil(requiredRetreats) + ' / year'
      : 'not achievable at a loss — reprice first';
  }

  /* ---------------------------------------------------------------
     Wire up events
  --------------------------------------------------------------- */
  Object.values(inputs).forEach((node) => {
    if (!node || node.tagName !== 'INPUT') return;
    node.addEventListener('input', () => recalc());
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    const defaults = {
      nights: 10, minGuests: 6, maxCapacity: 12, guestCount: 10,
      villaWeeklyRate: 8500, villaDailyRate: 1400,
      chefFee: 3000, foodPerGuestDay: 45,
      transportFixed: 1200, transportPerGuest: 50,
      excursionPerGuest: 350, excursionFixed: 500,
      hostTravel: 2500, marketing: 3000,
      contingencyPct: 8, paymentFeePct: 3,
      tier1Price: 3800, tier1Pct: 50,
      tier2Price: 4800, tier2Pct: 35,
      tier3Price: 5800, tier3Pct: 15,
      monthlyTarget: 10000, retreatsPerYear: 4,
    };
    Object.entries(defaults).forEach(([key, val]) => { if (inputs[key]) inputs[key].value = val; });
    villaMode = 'weekly';
    villaToggleBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-villa-mode') === 'weekly'));
    el('villaWeeklyField').style.display = '';
    el('villaDailyField').style.display = 'none';
    recalc();
  });

  // initial render
  recalc();
})();
