// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, the early radar, a filterable table, a
// per-protocol detail drawer with the model's own inputs and the protocol's farm plan, and a
// model sandbox that re-ranks the board live. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var sandbox = { growthWeight: DATA.model.growth_weight, maturityRange: DATA.model.maturity_range, multipleMode: 'category' };
  var DEFAULTS = { growthWeight: DATA.model.growth_weight, maturityRange: DATA.model.maturity_range, multipleMode: 'category' };
  function sandboxActive() {
    return sandbox.growthWeight !== DEFAULTS.growthWeight || sandbox.maturityRange !== DEFAULTS.maturityRange || sandbox.multipleMode !== DEFAULTS.multipleMode;
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(2) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. The sandbox changes only the weights, never the inputs.
  function impliedOf(row, s) {
    var m = DATA.model;
    var multiple = s.multipleMode === 'flat' ? 0.25 : row.multiple;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * s.growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * s.maturityRange;
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the actions, the capital, the hold and every cost and time. No name is
  // special-cased. Gas is priced by the protocol's own first chain: Ethereum costs real money.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('option') >= 0) return 'Buy one small option on ' + name + ' and let it settle on its own expiry.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + " of " + name + "'s index on " + chain + ' and hold the shares.';
    if (c.indexOf('basis') >= 0) return 'Open a $' + capital + ' basis position on ' + name + ' and keep the hedge balanced.';
    if (c.indexOf('chain') >= 0) return 'Use ' + name + ' once a week on ' + chain + ': one swap or one stake, so the address stays active on it.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(10, Math.round(capital / 3));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow about $' + small + ' against the supply and repay it within the week, so the position shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap a small amount through the pool once a week, so the position also records trading activity.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount back once, so the position records both directions of the route.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the receipt token once, or delegate a second small stake, and keep both receipts.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge and open a fresh one each month, so the position stays active.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market and open another each week, instead of holding a single position.';
    if (c.indexOf('rwa') >= 0) return 'Mint a second small position in the yield asset and hold both, so the activity is not a single deposit.';
    if (c.indexOf('stable') >= 0) return 'Mint and redeem a small amount once, so the position records both actions.';
    if (c.indexOf('insurance') >= 0) return 'Renew or top up the cover once before it lapses, and keep the policy number in the farm log.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Allocate a second small deposit into another vault the curator runs, and keep both sets of shares.';
    if (c.indexOf('option') >= 0) return 'Write or buy one small option each month and let it settle on expiry.';
    if (c.indexOf('index') >= 0) return 'Rebalance into a second index the protocol lists and hold both.';
    if (c.indexOf('basis') >= 0) return 'Roll the basis position once a month and keep the hedge balanced.';
    if (c.indexOf('chain') >= 0) return "Stake a small amount through the chain's own staking page once, and keep the receipt.";
    return 'Repeat the deposit once with a second small amount of $' + small + ' and keep both positions open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var eth = p.chains && p.chains.length > 0 && p.chains[0] === 'Ethereum';
    var firstGas = eth ? 'about $5 of gas for the first transaction' : 'under $1 of gas for the first transaction';
    var setupGas = eth ? 'about $8 of gas' : 'about $2 of gas';
    var weeklyGas = eth ? 'about $5 of gas a week' : 'under $1 of gas a week';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: firstGas, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + setupGas, time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + Math.max(10, Math.round(capital / 3)) + ' of capital and ' + setupGas, time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: weeklyGas, time: '10 minutes a week' },
      { text: "Open the protocol's own points or rewards page once a week and confirm the position is counted, claiming only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and unwind the position in two moves so no dust is left behind.', cost: 'nothing but the log', time: '5 minutes to log, 15 minutes to unwind' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('wl') === '1') state.watchlistOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function isEarly(r) {
    return r.age_days !== null && r.age_days !== undefined && r.age_days < 365 && (r.change_7d === null ? 0 : r.change_7d) > 10;
  }
  function earlyRows() {
    return DATA.rows.filter(isEarly).slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; }).slice(0, 9);
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.rows.filter(function (r) {
      if (state.tab === 'early' && !isEarly(r)) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    return list.map(function (r) {
      return { row: r, shown: impliedOf(r, sandbox) };
    });
  }
  function sortedShown(list) {
    var key = state.sort;
    var ranked = list.slice().sort(function (a, b) { return b.shown - a.shown || (a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0); });
    var rankOf = {};
    ranked.forEach(function (x, i) { rankOf[x.row.slug] = i + 1; });
    var sorted = list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.row.name.toLowerCase(); bv = b.row.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.row.tvl_usd; bv = b.row.tvl_usd; }
      else if (key === 'growth') { av = a.row.change_7d === null ? -Infinity : a.row.change_7d; bv = b.row.change_7d === null ? -Infinity : b.row.change_7d; }
      else if (key === 'age') { av = a.row.age_days === null ? Infinity : a.row.age_days; bv = b.row.age_days === null ? Infinity : b.row.age_days; }
      else if (key === 'multiple') { av = a.row.multiple; bv = b.row.multiple; }
      else { av = a.shown; bv = b.shown; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0;
    });
    return sorted.map(function (x) { return { row: x.row, shown: x.shown, shownRank: rankOf[x.row.slug] }; });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null, 'Every protocol the watchlist rule keeps, without its $50M floor — ', el('b', { text: String(DATA.board_size) + ' rows' }), ' — priced at what live tokens in its own category already trade at per dollar of TVL. No wrapped, staked or bridged product: WBTC, USDT0 and the bridges are off this board, as the field guide says. Implied value is a model, not a promise.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { class: 'gold', text: fmtUsd(DATA.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function earlyStrip() {
    var rows = earlyRows();
    if (rows.length === 0) return null;
    return el('section', { class: 'early' },
      el('h2', null, 'Early radar', el('span', { class: 'tag', text: 'find them first' })),
      el('p', { class: 'sub', text: 'Young and fast-growing: listed under a year ago and up more than 10% in seven days. The protocols a launch would find earliest — ranked by the same implied value.' }),
      el('div', { class: 'chips' }, rows.map(function (r) {
        return el('button', { class: 'chip', type: 'button', onclick: function () { openDetail(r.slug); } },
          el('b', { text: '#' + r.rank + ' ' + r.name }),
          ' ' + fmtAge(r.age_days) + ' old, ',
          el('span', { class: r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(r.change_7d) }),
          ' · ' + fmtUsd(r.implied_value_usd));
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'min-tvl', 'aria-label': 'Minimum TVL' },
      [['0', 'Any TVL'], ['50000000', 'TVL $50M+'], ['100000000', 'TVL $100M+'], ['500000000', 'TVL $500M+'], ['1000000000', 'TVL $1B+']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: String(state.minTvl) === o[0] ? 'selected' : null });
      })
    );
    tvlSelect.addEventListener('change', function () { state.minTvl = Number(tvlSelect.value); writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'wl', checked: state.watchlistOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var shown = state.tab === 'live' ? DATA.live.length : filteredRows().length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'min-tvl', text: 'Minimum TVL' }), tvlSelect),
      el('label', { class: 'check', for: 'wl' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }),
        el('div', { class: 'tabs' }, tabBtn('pre-token', 'Pre-token'), tabBtn('early', 'Early'), tabBtn('live', 'Live token'))),
      el('span', { class: 'count', text: shown + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedShown(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, x) { return Math.max(m, x.shown); }, 1);
    var tbody = el('tbody');
    list.forEach(function (x) {
      var r = x.row;
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rank = sandboxActive() ? x.shownRank : r.rank;
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.watchlist ? el('span', { class: 'star', text: '★ ' }) : null, r.name),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num mult', text: fmtMult(r.multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((x.shown / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(x.shown) })
        )),
        el('td', null, el('span', { class: 'status pre', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    var caption = state.tab === 'early'
      ? 'Early radar: listed under a year ago and up more than 10% in seven days, strongest implied value first.'
      : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.';
    if (sandboxActive()) caption += ' Sandbox is on: ranks below are re-ranked by your weights.';
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: caption }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their mcap per dollar of TVL is what prices the board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cats = Object.keys(DATA.multiples).map(function (k) { return { name: k, v: DATA.multiples[k] }; })
      .sort(function (a, b) { return b.v.live_count - a.v.live_count || (a.name < b.name ? -1 : 1); })
      .slice(0, 12);
    var gw = el('input', { type: 'range', id: 'gw', min: '0', max: '1', step: '0.05', value: String(sandbox.growthWeight), 'aria-label': 'Growth weight' });
    var gwOut = el('output', { for: 'gw', text: sandbox.growthWeight.toFixed(2) });
    gw.addEventListener('input', function () { sandbox.growthWeight = Number(gw.value); gwOut.textContent = sandbox.growthWeight.toFixed(2); render(); });
    var mr = el('input', { type: 'range', id: 'mr', min: '0', max: '0.6', step: '0.05', value: String(sandbox.maturityRange), 'aria-label': 'Maturity range' });
    var mrOut = el('output', { for: 'mr', text: sandbox.maturityRange.toFixed(2) });
    mr.addEventListener('input', function () { sandbox.maturityRange = Number(mr.value); mrOut.textContent = sandbox.maturityRange.toFixed(2); render(); });
    var mm = el('select', { id: 'mm', 'aria-label': 'Multiple mode' },
      el('option', { value: 'category', text: 'Category median multiple', selected: sandbox.multipleMode === 'category' ? 'selected' : null }),
      el('option', { value: 'flat', text: 'Flat 0.25x multiple', selected: sandbox.multipleMode === 'flat' ? 'selected' : null })
    );
    mm.addEventListener('change', function () { sandbox.multipleMode = mm.value; render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset model', onclick: function () { sandbox.growthWeight = DEFAULTS.growthWeight; sandbox.maturityRange = DEFAULTS.maturityRange; sandbox.multipleMode = DEFAULTS.multipleMode; render(); } });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. A pre-token protocol is priced at what live tokens in its own category already trade at per dollar of TVL.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ', el('b', { text: 'multiple' }), ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The multiple is the category median mcap / TVL of its live-token peers, shrunk toward the global median of ' + DATA.global_median.toFixed(2) + 'x (prior weight ' + m.multiple_prior_weight + ') and clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. The board ranks only what the watchlist rule keeps: no bridge, liquid-staking, restaking or exchange product, no versioned pool, no wrapped or staked name.' }),
      el('div', { class: 'model-grid' },
        el('div', null,
          el('h3', { text: 'Category multiples (live peers)' }),
          el('table', null,
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live peers' }), el('th', { scope: 'col', text: 'Median' }), el('th', { scope: 'col', text: 'Multiple used' }))),
            el('tbody', null, cats.map(function (c) {
              return el('tr', null,
                el('td', { text: c.name }),
                el('td', { class: 'num', text: String(c.v.live_count) }),
                el('td', { class: 'num', text: fmtMult(c.v.median) }),
                el('td', { class: 'num mult', text: fmtMult(c.v.used) }));
            }))
          ),
          el('p', { class: 'sub', text: 'Twelve largest categories shown. A category with no live peers uses the global median.' })
        ),
        el('div', { class: 'sandbox' },
          el('h3', { text: 'Model sandbox — re-rank the board live' }),
          el('label', { for: 'gw' }, 'Growth weight ', gwOut),
          gw,
          el('label', { for: 'mr' }, 'Maturity range ', mrOut),
          mr,
          el('div', { class: 'row' },
            el('label', { for: 'mm', text: 'Multiple' }),
            mm,
            reset
          ),
          el('p', { class: 'sub sandbox-note', text: sandboxActive() ? 'Sandbox is on: the board above is re-ranked by these weights. Reset to return to the published model.' : 'Move a slider and the board re-ranks at once. The published board always uses the weights above: growth ' + m.growth_weight + ', maturity ' + m.maturity_range + ', category multiples.' })
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, sandbox);
    var mult = DATA.multiples[row.category || 'Other'];
    var comparable;
    if (!mult || mult.live_count === 0) {
      comparable = 'No live peers in this category: this row is priced at the global live median of ' + fmtMult(DATA.global_median) + '.';
    } else if (mult.live_count < 3) {
      comparable = 'Only ' + mult.live_count + ' live ' + (row.category || 'Other') + ' peer' + (mult.live_count === 1 ? '' : 's') + ' in the snapshot (median ' + fmtMult(mult.median) + 'x), so the model leans on the global median of ' + fmtMult(DATA.global_median) + ' and prices this row at ' + fmtMult(row.multiple) + 'x.';
    } else {
      comparable = 'Live ' + (row.category || 'Other') + ' protocols trade at a median ' + fmtMult(mult.median) + 'x TVL (' + mult.live_count + ' live peers); this row is priced at ' + fmtMult(row.multiple) + 'x after shrinkage toward the global median of ' + fmtMult(DATA.global_median) + '.';
    }
    var growthNote = row.change_7d !== null && (row.change_7d > DATA.model.growth_cap || row.change_7d < DATA.model.growth_floor)
      ? 'Seven-day growth (clamped to ' + (row.change_7d > 0 ? '+' : '') + (row.change_7d > 0 ? DATA.model.growth_cap : DATA.model.growth_floor) + '% in the model)'
      : 'Seven-day growth';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · ★ Watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num mult', text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: growthNote }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num gold', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: comparable }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ' under the sandbox weights; the board carries ' + fmtUsd(row.implied_value_usd) + '.') + ' This is an estimate, not a price. The record says no token — never that it has none.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — 7 steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Record' }),
      el('div', { class: 'meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Listed ' + (row.listed_at || 'unknown') }),
        el('span', { text: row.watchlist ? 'On the watchlist' : 'Below the watchlist floor' }),
        el('span', { text: 'No token on record' })
      )
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(earlyStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'live' ? liveTable() : boardTable());
    if (state.tab !== 'live') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'foot', text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '. Implied values are this radar\u2019s own model, not a price and not a promise; a protocol that records no token may still have one its DefiLlama record does not carry.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
