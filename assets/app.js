/* 《光·遇》国服复刻先祖统计 —— 纯前端，无依赖 */
(function () {
  'use strict';

  var DATA = window.__SKY_DATA__;
  var view = document.getElementById('view');
  var mask = document.getElementById('mask');
  var drawer = document.getElementById('drawer');

  if (!DATA) {
    view.innerHTML = '<div class="empty">数据未加载：请确认 data/app-data.js 存在（运行 <code>node scripts/build.mjs</code>）。</div>';
    return;
  }

  var META = DATA.meta;
  var SPIRITS = DATA.spirits;
  var OCC = DATA.occurrences;
  var GROUPS = DATA.groupEvents;
  var PENDING = DATA.pending;
  var UNMATCHED = DATA.unmatched;

  var spiritByName = new Map(SPIRITS.map(function (s) { return [s.name, s]; }));
  var groupById = new Map(GROUPS.map(function (g) { return [g.id, g]; }));

  var KIND = {
    regular: { label: '常规复刻', short: '常规', cls: 'regular' },
    extra: { label: '加塞复刻', short: '加塞', cls: 'extra' },
    group: { label: '集体复刻', short: '集体', cls: 'group' }
  };

  var state = {
    q: '',
    season: '',
    mode: 'sum3',
    sortKey: 'total',
    sortDir: 'desc',
    timelineKind: 'all'
  };

  /* ---------------- 工具 ---------------- */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    return String(iso || '').slice(0, 10);
  }

  function fmtMD(iso) {
    var s = fmtDate(iso);
    return s.slice(5).replace('-', '.');
  }

  function fmtRange(start, end) {
    var a = fmtDate(start);
    var b = fmtDate(end);
    if (!a) return '—';
    if (!b) return a;
    if (a.slice(0, 4) !== b.slice(0, 4)) return a + ' – ' + b;
    return fmtMD(start) + ' – ' + fmtMD(end);
  }

  function fmtBeijing(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
    var map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    return map.year + '-' + map.month + '-' + map.day + ' ' + map.hour + ':' + map.minute;
  }

  function latestOccurrence() {
    var list = OCC.filter(function (occ) { return occ.kind !== 'group'; });
    return list[0] || null;
  }

  function occurrenceStatus(occ) {
    if (!occ) return '';
    var now = Date.now();
    if (now < Date.parse(occ.start)) return '未开始';
    if (now <= Date.parse(occ.end)) return '进行中';
    return '已结束';
  }

  function kindBadge(kind, extraCls) {
    var k = KIND[kind] || KIND.regular;
    return '<span class="badge ' + k.cls + (extraCls ? ' ' + extraCls : '') + '">' +
      '<i class="kind-dot k-' + k.cls + '"></i>' + k.short + '</span>';
  }

  function totalFor(spirit) {
    return state.mode === 'sum3' ? spirit.total : spirit.totalRC;
  }

  function occurrenceLink(occ) {
    if (!occ.source || !occ.source.url) return '';
    return '<a href="' + esc(occ.source.url) + '" target="_blank" rel="noopener">官方原文</a>';
  }

  function imageLinks(occ) {
    if (!occ.source || !occ.source.imageUrls || !occ.source.imageUrls.length) return '';
    return occ.source.imageUrls.slice(0, 2).map(function (url, index) {
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener">公告图' + (index ? index + 1 : '') + '</a>';
    }).join('');
  }

  /* ---------------- 数据加工 ---------------- */
  var SEASON_COUNTS = {};
  var SEASONS = (function () {
    SPIRITS.forEach(function (s) {
      var key = s.season || '未知';
      SEASON_COUNTS[key] = (SEASON_COUNTS[key] || 0) + 1;
    });
    return Object.keys(SEASON_COUNTS).sort(function (a, b) { return SEASON_COUNTS[b] - SEASON_COUNTS[a]; });
  })();

  var occurrencesBySpirit = (function () {
    var map = new Map();
    OCC.forEach(function (occ) {
      if (!occ.spiritName) return;
      var list = map.get(occ.spiritName) || [];
      list.push(occ);
      map.set(occ.spiritName, list);
    });
    map.forEach(function (list) {
      list.sort(function (a, b) { return b.start.localeCompare(a.start); });
    });
    return map;
  })();

  function filteredSpirits() {
    var q = state.q.trim();
    var rows = SPIRITS.filter(function (s) {
      if (state.season && s.season !== state.season) return false;
      if (!q) return true;
      if (s.name.indexOf(q) >= 0) return true;
      if (s.season && s.season.indexOf(q) >= 0) return true;
      if (s.map && s.map.indexOf(q) >= 0) return true;
      return false;
    });
    var key = state.sortKey;
    var dir = state.sortDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'total') { av = totalFor(a); bv = totalFor(b); }
      else if (key === 'name' || key === 'season') { av = a[key] || ''; bv = b[key] || ''; }
      else if (key === 'lastAt' || key === 'firstAt') { av = a[key] || ''; bv = b[key] || ''; }
      else { av = a[key] || 0; bv = b[key] || 0; }
      if (av === bv) return (a.name > b.name ? 1 : -1) * dir;
      return (av > bv ? 1 : -1) * dir;
    });
    return rows;
  }

  /* ---------------- 概览 ---------------- */
  function renderOverview() {
    var latest = latestOccurrence();
    var top = SPIRITS.slice(0, 12);
    var max = top.length ? totalFor(top[0]) || 1 : 1;
    var recent = OCC.filter(function (o) { return o.kind !== 'group'; }).slice(0, 7);
    var groupCount = GROUPS.length;

    var topHtml = top.map(function (s, index) {
      var value = totalFor(s);
      return '<div class="rank-item" data-open-spirit="' + esc(s.name) + '">' +
        '<div class="name">' + (index + 1) + '. ' + esc(s.name) + '</div>' +
        '<div class="bar"><i style="width:' + Math.max(6, Math.round(value / max * 100)) + '%"></i></div>' +
        '<div class="cnt">' + value + '</div></div>';
    }).join('');

    var recentHtml = recent.map(function (occ) {
      return '<div class="tl-item" data-open-spirit="' + esc(occ.spiritName || '') + '">' +
        '<div class="tl-date">' + fmtRange(occ.start, occ.end) + '</div>' +
        '<div>' + kindBadge(occ.kind) + '</div>' +
        '<div><div class="tl-name">' + esc(occ.spiritName || '未确认') + '</div>' +
        '<div class="tl-meta">' + esc(occ.season || '') + (occ.map ? ' · ' + esc(occ.map) : '') + '</div></div>' +
        '<div class="tl-link">' + occurrenceLink(occ) + '</div></div>';
    }).join('');

    view.innerHTML =
      '<div class="wrap">' +
        '<div class="banner"><span class="dot"></span><div>' +
          '<strong>复刻事实只认官方公告</strong>：每条记录都带网易大神「Sky光遇」官方原文链接；' +
          '先祖名字在官方未写名时取自社区 Wiki，并在明细里标注来源。<br>' +
          '数据更新于 <strong>' + esc(fmtBeijing(META.generatedAt)) + '</strong>' +
          (latest ? ' · 最近一次复刻：<strong>' + esc(latest.spiritName || '') + '</strong> ' +
            esc(fmtRange(latest.start, latest.end)) + '（' + esc(occurrenceStatus(latest)) + '）' : '') +
        '</div></div>' +

        '<div class="grid grid-4 section">' +
          '<div class="card stat gold"><div class="num mono">' + META.counts.occurrences + '</div>' +
            '<div class="label">已核验复刻段数</div><div class="sub">常规 ' + META.counts.regular + ' · 加塞 ' + META.counts.extra + ' · 集体 ' + META.counts.groupOccurrences + '</div></div>' +
          '<div class="card stat cyan"><div class="num mono">' + META.counts.spirits + '</div>' +
            '<div class="label">有复刻记录的先祖</div><div class="sub">含集体复刻出场</div></div>' +
          '<div class="card stat violet"><div class="num mono">' + groupCount + '</div>' +
            '<div class="label">集体复刻活动</div><div class="sub">同一活动内每位先祖计 1 次</div></div>' +
          '<div class="card stat green"><div class="num mono">' + PENDING.length + '</div>' +
            '<div class="label">待考证记录</div><div class="sub">社区有记录、缺官方公告，不计入统计</div></div>' +
        '</div>' +

        '<div class="grid grid-2 section">' +
          '<div class="card"><h2>复刻次数 Top 12 <small>当前口径：' + (state.mode === 'sum3' ? '常规+加塞+集体' : '常规+集体') + '</small></h2>' +
            '<div class="rank-list">' + topHtml + '</div></div>' +
          '<div class="card"><h2>最近复刻 <small>点击查看详情</small></h2>' + recentHtml + '</div>' +
        '</div>' +

        '<div class="grid grid-2 section">' +
          '<div class="card"><h2>数据覆盖</h2><dl class="kv">' +
            '<dt>数据更新</dt><dd>' + esc(fmtBeijing(META.generatedAt)) + '（北京时间）</dd>' +
            '<dt>官方公告归档</dt><dd>' + esc(META.archiveSince) + ' 起（大神官方账号公开动态）</dd>' +
            '<dt>覆盖至</dt><dd>' + esc(fmtDate(META.coverage && META.coverage.from)) + ' ~ ' + esc(fmtDate(META.dataCutoff)) +
              '<span class="muted">（含进行中的复刻，以其结束时间计）</span></dd>' +
            '<dt>已知缺口</dt><dd>' + PENDING.length + ' 条社区记录缺官方公告（多为 2024-08~11、2020 上半年）；' + UNMATCHED.length + ' 条官方复刻未确认名字</dd>' +
            '<dt>交叉核对</dt><dd>与 BWiki 记录的“常规复刻次数”比对，差异会显示在先祖详情里</dd>' +
            '</dl></div>' +
          '<div class="card"><h2>怎么用</h2><ul class="list-clean">' +
            '<li>「先祖榜」：搜索、按季节筛选、切换统计口径，点任意一行看每次复刻明细。</li>' +
            '<li>「时间轴」：按年份倒序看全部复刻，可按常规 / 加塞 / 集体过滤。</li>' +
            '<li>「集体复刻」：看每场活动的出场先祖与活动区间。</li>' +
            '<li>「来源与口径」：核对数据来源、待考证清单，导出 CSV / JSON。</li>' +
            '</ul></div>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- 先祖榜 ---------------- */
  function spiritRows() {
    var rows = filteredSpirits();
    if (!rows.length) return '<tr><td colspan="9"><div class="empty">没有匹配的先祖</div></td></tr>';
    return rows.map(function (s, index) {
      var total = totalFor(s);
      var check = s.crossCheckDiff
        ? '<span class="badge warn mini" title="官方记录与社区 Wiki 的累计常规复刻次数不一致，差异多来自缺少官方公告的历史空档">差 ' + (s.crossCheckDiff > 0 ? '+' : '') + s.crossCheckDiff + '</span>'
        : '';
      var extraDim = state.mode === 'rc' ? ' dim-cell' : '';
      return '<tr data-open-spirit="' + esc(s.name) + '">' +
        '<td class="rank">' + (index + 1) + '</td>' +
        '<td><div class="spirit-name">' + esc(s.name) + check + '</div></td>' +
        '<td>' + (s.season ? '<span class="season-tag">' + esc(s.season) + '</span>' : '—') + '</td>' +
        '<td class="num-cell">' + s.regular + '</td>' +
        '<td class="num-cell' + extraDim + '">' + (s.extra ? s.extra : '—') + '</td>' +
        '<td class="num-cell">' + (s.group ? s.group : '—') + '</td>' +
        '<td class="num-cell total-cell">' + total + '</td>' +
        '<td class="small mono">' + (s.lastAt ? fmtDate(s.lastAt) : '—') + '</td>' +
        '<td class="small mono">' + (s.firstAt ? fmtDate(s.firstAt) : '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  function spiritHeader() {
    var cols = [
      ['rank', '#', false, false],
      ['name', '先祖', true, false],
      ['season', '季节', true, false],
      ['regular', '常规', true, true],
      ['extra', '加塞', true, true],
      ['group', '集体', true, true],
      ['total', '总次数', true, true],
      ['lastAt', '最近复刻', true, false],
      ['firstAt', '首次复刻', true, false]
    ];
    return cols.map(function (col) {
      var key = col[0];
      var arrow = state.sortKey === key ? '<span class="arrow">' + (state.sortDir === 'asc' ? '▲' : '▼') + '</span>' : '';
      var classes = [];
      if (col[2]) classes.push('sortable');
      if (col[3]) classes.push('num-head');
      return '<th class="' + classes.join(' ') + '" data-sort="' + key + '">' + col[1] + arrow + '</th>';
    }).join('');
  }

  function seasonOptions() {
    var items = ['<button type="button" data-season="" class="' + (state.season ? '' : 'active') + '">' +
      '全部季节<small>' + SPIRITS.length + '</small></button>'];
    SEASONS.forEach(function (season) {
      items.push('<button type="button" data-season="' + esc(season) + '" class="' + (state.season === season ? 'active' : '') + '">' +
        esc(season) + '<small>' + (SEASON_COUNTS[season] || 0) + '</small></button>');
    });
    return items.join('');
  }

  function seasonDropdown() {
    return '<div class="dropdown" id="season-dd">' +
      '<button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false">' +
        '<span id="season-label">' + esc(state.season || '全部季节') + '</span><span class="caret">▾</span>' +
      '</button>' +
      '<div class="dd-panel" hidden>' + seasonOptions() + '</div>' +
    '</div>';
  }

  function renderSpirits() {
    view.innerHTML =
      '<div class="wrap">' +
        '<div class="section-head"><h2>先祖榜</h2><span class="hint">共 ' + SPIRITS.length + ' 位先祖 · 点行看明细</span></div>' +
        '<div class="controls">' +
          '<input id="search" type="search" placeholder="搜索先祖 / 季节 / 地图" value="' + esc(state.q) + '" autocomplete="off">' +
          seasonDropdown() +
          '<span class="seg" id="mode">' +
            '<button data-mode="sum3" class="' + (state.mode === 'sum3' ? 'active' : '') + '">常规+加塞+集体</button>' +
            '<button data-mode="rc" class="' + (state.mode === 'rc' ? 'active' : '') + '">常规+集体</button>' +
          '</span>' +
        '</div>' +
        '<div class="table-wrap"><table><thead><tr id="spirit-head">' + spiritHeader() + '</tr></thead>' +
        '<tbody id="spirit-body">' + spiritRows() + '</tbody></table></div>' +
        '<p class="small muted section">口径说明：默认「总次数 = 常规 + 加塞 + 集体」；切到「常规 + 集体」时，加塞仅展示不计入。' +
        '集体复刻中同一位先祖只计 1 次。带「差 N」角标的先祖表示官方记录与社区 Wiki 的累计次数不一致，通常是历史缺口所致。</p>' +
      '</div>';
  }

  function updateSpiritTable() {
    var head = document.getElementById('spirit-head');
    var body = document.getElementById('spirit-body');
    if (!head || !body) return;
    head.innerHTML = spiritHeader();
    body.innerHTML = spiritRows();
  }

  /* ---------------- 时间轴 ---------------- */
  function renderTimeline() {
    var list = OCC.slice().sort(function (a, b) { return b.start.localeCompare(a.start); });
    if (state.timelineKind !== 'all') {
      list = list.filter(function (o) { return o.kind === state.timelineKind; });
    }
    var byYear = {};
    list.forEach(function (occ) {
      var year = fmtDate(occ.start).slice(0, 4);
      (byYear[year] = byYear[year] || []).push(occ);
    });
    var years = Object.keys(byYear).sort().reverse();

    var html = years.map(function (year) {
      var items = byYear[year].map(function (occ) {
        var group = occ.kind === 'group' ? groupById.get(occ.groupEventId) : null;
        var name = group
          ? group.name + '（' + (group.spiritNames.length || 0) + ' 位先祖）'
          : (occ.spiritName || '名字未确认');
        var meta = group
          ? (group.listStatus === 'community-compiled' ? '名单：社区 Wiki' : '官方未公布名单')
          : [occ.season, occ.map].filter(Boolean).join(' · ');
        return '<div class="tl-item">' +
          '<div class="tl-date">' + fmtRange(occ.start, occ.end) + '</div>' +
          '<div>' + kindBadge(occ.kind) + '</div>' +
          '<div><div class="tl-name">' + (group ? esc(name) : '<a href="javascript:void(0)" data-open-spirit="' + esc(occ.spiritName || '') + '">' + esc(name) + '</a>') + '</div>' +
          '<div class="tl-meta">' + esc(meta || '') + ' · 公告 ' + esc(fmtDate(occ.source && occ.source.announcedAt)) + '</div></div>' +
          '<div class="tl-link">' + occurrenceLink(occ) + '</div></div>';
      }).join('');
      return '<div class="year-block"><div class="year-label">' + year + ' 年 · ' + byYear[year].length + ' 条</div>' + items + '</div>';
    }).join('');

    view.innerHTML =
      '<div class="wrap">' +
        '<div class="section-head"><h2>时间轴</h2><span class="hint">' + list.length + ' 条记录</span></div>' +
        '<div class="controls"><span class="seg" id="tl-kind">' +
          ['all', 'regular', 'extra', 'group'].map(function (kind) {
            var label = kind === 'all' ? '全部' : KIND[kind].short;
            return '<button data-kind="' + kind + '" class="' + (state.timelineKind === kind ? 'active' : '') + '">' + label + '</button>';
          }).join('') +
        '</span></div>' +
        (html || '<div class="empty">没有记录</div>') +
      '</div>';
  }

  /* ---------------- 集体复刻 ---------------- */
  function renderGroups() {
    var cards = GROUPS.slice().sort(function (a, b) { return b.start.localeCompare(a.start); }).map(function (group) {
      var members = group.members && group.members.length
        ? group.members.map(function (member) {
            return '<span class="member">' + esc(member.name) + (member.season ? '<small>' + esc(member.season) + '</small>' : '') + '</span>';
          }).join('')
        : '<span class="badge warn">官方未公布名单，暂不计入任何先祖</span>';
      var extra = group.extraAnnouncements && group.extraAnnouncements.length
        ? '<div class="small muted">另有 ' + group.extraAnnouncements.length + ' 条补充公告（' +
          group.extraAnnouncements.map(function (item) {
            return '<a href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(fmtDate(item.announcedAt)) + '</a>';
          }).join('、') + '）</div>'
        : '';
      return '<div class="card group-card">' +
        '<div class="group-top"><div class="group-title">' + esc(group.name) + '</div><div>' + kindBadge('group') + '</div></div>' +
        '<div class="small muted mono">' + fmtRange(group.start, group.end) + ' · ' +
          (group.spiritNames.length ? group.spiritNames.length + ' 位先祖' : '名单待确认') + '</div>' +
        '<div class="group-members">' + members + '</div>' +
        '<div class="small">' + (group.source && group.source.url ? '<a href="' + esc(group.source.url) + '" target="_blank" rel="noopener">官方原文</a>' : '') +
          ' <span class="muted">· ' + esc(group.listStatus === 'community-compiled' ? '名单来源：社区 Wiki（官方公告未逐一列名）' : '名单待官方确认') + '</span></div>' +
        extra +
      '</div>';
    }).join('');

    view.innerHTML =
      '<div class="wrap">' +
        '<div class="section-head"><h2>集体复刻</h2><span class="hint">' + GROUPS.length + ' 场活动 · 同一活动内每位先祖计 1 次出场</span></div>' +
        '<div class="banner section"><span class="dot"></span><div>集体复刻的<b>时间与是否存在</b>以官方公告为准；' +
          '官方公告常只写“某季先祖集体回归”而不逐一列名，此处的<b>名单来自社区 Wiki</b>，仅用于识别“哪位先祖出场”，并已在每张卡片上标注。</div></div>' +
        '<div class="grid grid-2 section">' + cards + '</div>' +
      '</div>';
  }

  /* ---------------- 来源与口径 ---------------- */
  function renderAbout() {
    var sources = (META.sources || []).map(function (source) {
      return '<tr><td>' + esc(source.name) + '</td><td class="small">' + esc(source.role) + '</td>' +
        '<td class="small"><a href="' + esc(source.url) + '" target="_blank" rel="noopener">打开</a></td></tr>';
    }).join('');

    var pending = PENDING.slice().sort(function (a, b) { return b.start.localeCompare(a.start); }).map(function (item) {
      return '<tr><td class="mono small">' + fmtRange(item.start, item.end) + '</td><td>' + esc(item.name) + '</td>' +
        '<td class="small">' + esc([item.season, item.map].filter(Boolean).join(' · ')) + '</td>' +
        '<td class="small"><a href="' + esc(item.source.url) + '" target="_blank" rel="noopener">社区记录</a></td></tr>';
    }).join('');

    var unmatched = UNMATCHED.map(function (item) {
      return '<tr><td class="mono small">' + fmtRange(item.start, item.end) + '</td>' +
        '<td class="small">名字未确认（官方未写名、社区也无对应条目）</td>' +
        '<td class="small"><a href="' + esc(item.url) + '" target="_blank" rel="noopener">官方原文</a></td></tr>';
    }).join('');

    view.innerHTML =
      '<div class="wrap">' +
        '<div class="section-head"><h2>来源与口径</h2><span class="hint">数据生成于 ' + esc(fmtBeijing(META.generatedAt)) + '</span></div>' +

        '<div class="card"><h2>统计口径</h2><ul class="list-clean">' +
          '<li><b>复刻事实</b>：是否存在、开始/结束时间，只采用官方公告（网易大神官方认证账号「Sky光遇」为主，官网/官方微博/游戏内公告为辅），每条记录都保留官方原文链接。</li>' +
          '<li><b>常规复刻</b>：按常规档期（周四 06:00 → 周一 12:00 左右）开启的单次复刻。</li>' +
          '<li><b>加塞复刻</b>：与上一条常规复刻间隔 ≤ 9 天的额外复刻，多为春节/五一/国庆等假期的加场。官方公告不会自称“加塞”，此处为按档期推断，明细中标注“加塞（推断）”。</li>' +
          '<li><b>集体复刻</b>：多先祖同时回归的限时活动，单独计数；同一活动内同一位先祖只计 1 次出场。</li>' +
          '<li><b>总次数</b>：默认 = 常规 + 加塞 + 集体；可切换为“常规 + 集体”（加塞只展示不计入）。</li>' +
          '<li><b>名字来源</b>：官方公告正文 > 官方公告图 > 游戏内实拍 > 社区 Wiki。官方未写名时用社区 Wiki 补名字，并在明细里标注。</li>' +
          '<li><b>不猜名单</b>：官方只说“某季先祖集体回归”而未列名时，名单保持“社区整理/待确认”，不会编造。</li>' +
        '</ul></div>' +

        '<div class="card section"><h2>数据来源</h2><div class="table-wrap"><table><thead><tr><th>来源</th><th>用途</th><th></th></tr></thead><tbody>' + sources + '</tbody></table></div></div>' +

        '<div class="card section"><h2>待考证：社区有记录、缺官方公告 <small>' + PENDING.length + ' 条，未计入任何统计</small></h2>' +
          '<p class="small muted">这些记录来自社区 Wiki，多半是 2024-08~11 与 2020 上半年的空档（官方账号当期没有发布复刻公告）。找到官方公告后可补入主数据。</p>' +
          '<div class="table-wrap"><table><thead><tr><th>时间</th><th>先祖</th><th>季节 / 地图</th><th>来源</th></tr></thead><tbody>' + pending + '</tbody></table></div></div>' +

        '<div class="card section"><h2>未归属：官方有复刻、名字未确认 <small>' + UNMATCHED.length + ' 条</small></h2>' +
          '<div class="table-wrap"><table><thead><tr><th>时间</th><th>说明</th><th>来源</th></tr></thead><tbody>' + unmatched + '</tbody></table></div></div>' +

        '<div class="card section"><h2>导出与更新</h2>' +
        '<p class="small">代码、数据与自动更新工作流都在 <a href="https://github.com/Qianzhihe0224/Sky-Children-of-the-Light-Returning-Spirit-Lookup-Tool" target="_blank" rel="noopener">GitHub 仓库</a>，欢迎提 issue 或 PR 补充史料。</p>' +
        '<div class="controls">' +
          '<button class="action" id="export-spirits">导出先祖统计 CSV</button>' +
          '<button class="action" id="export-occurrences">导出复刻明细 JSON</button>' +
        '</div>' +
        '<dl class="kv section">' +
          '<dt>重新抓取公告</dt><dd><code>node scripts/sync-dashen.mjs</code></dd>' +
          '<dt>重新分类</dt><dd><code>node scripts/classify.mjs</code></dd>' +
          '<dt>合并社区名字</dt><dd><code>node scripts/fetch-wiki.mjs &amp;&amp; node scripts/import-data.mjs</code></dd>' +
          '<dt>重新生成页面数据</dt><dd><code>node scripts/build.mjs</code></dd>' +
        '</dl></div>' +

        '<div class="card section"><h2>免责声明</h2><p class="small muted">非官方粉丝工具，与网易、thatgamecompany 无关。' +
          '所有游戏内容版权归原权利方所有。工具只读取公开公告页，限速访问，不绕过登录、不存储账号数据；' +
          '公告图片仅保留外链。若权利方要求，会立即停止相关功能。</p></div>' +
      '</div>';

    var btnSpirits = document.getElementById('export-spirits');
    var btnOcc = document.getElementById('export-occurrences');
    if (btnSpirits) btnSpirits.addEventListener('click', exportSpiritsCsv);
    if (btnOcc) btnOcc.addEventListener('click', exportOccurrencesJson);
  }

  /* ---------------- 抽屉 ---------------- */
  function openSpirit(name) {
    var spirit = spiritByName.get(name);
    if (!spirit) return;
    var occs = occurrencesBySpirit.get(name) || [];
    var groups = GROUPS.filter(function (group) { return group.spiritNames.indexOf(name) >= 0; })
      .sort(function (a, b) { return b.start.localeCompare(a.start); });

    var occHtml = occs.length ? occs.map(function (occ) {
      var inferred = occ.kind === 'extra' && occ.kindConfidence === 'inferred'
        ? ' <span class="badge ghost" title="官方公告不会自称加塞，这是按档期推断">推断</span>' : '';
      var nameNote = occ.nameVerification && occ.nameVerification.status === 'community'
        ? '<div class="small muted">名字来源：社区 Wiki（官方公告正文未写名）</div>' : '';
      return '<div class="occ"><div class="row1"><div class="date mono">' + fmtRange(occ.start, occ.end) + '</div>' +
        '<div>' + kindBadge(occ.kind) + inferred + '</div></div>' +
        '<div class="small muted">公告 ' + esc(fmtDate(occ.source && occ.source.announcedAt)) +
          (occ.source && occ.source.deleted ? ' · 官方已删除' : '') + '</div>' +
        (occ.source && occ.source.excerpt ? '<div class="excerpt">「' + esc(occ.source.excerpt.replace(/\n+/g, ' ').slice(0, 90)) + '…」</div>' : '') +
        '<div class="links">' + occurrenceLink(occ) + ' ' + imageLinks(occ) + '</div>' + nameNote + '</div>';
    }).join('') : '<div class="empty">暂无单次复刻记录</div>';

    var groupHtml = groups.length ? groups.map(function (group) {
      return '<div class="occ"><div class="row1"><div class="date mono">' + fmtRange(group.start, group.end) + '</div>' +
        '<div>' + kindBadge('group') + '</div></div>' +
        '<div class="small">' + esc(group.name) + ' · 同场 ' + group.spiritNames.length + ' 位先祖</div>' +
        '<div class="links">' + (group.source && group.source.url ? '<a href="' + esc(group.source.url) + '" target="_blank" rel="noopener">官方原文</a>' : '') + '</div></div>';
    }).join('') : '';

    var checkNote = '';
    if (spirit.wikiRegularCount != null && spirit.crossCheckDiff) {
      checkNote = '<p class="small muted">交叉核对：社区 Wiki 记录的累计常规复刻次数为 <b>' + spirit.wikiRegularCount +
        '</b>，本站已核验 ' + (spirit.regular + spirit.extra) + ' 次（差 ' + (spirit.crossCheckDiff > 0 ? '+' : '') + spirit.crossCheckDiff +
        '）。差异通常来自缺少官方公告的历史空档。</p>';
    }

    drawer.innerHTML =
      '<div class="drawer-head"><div><h3>' + esc(spirit.name) + '</h3>' +
        '<div class="small muted">' + esc([spirit.season, spirit.map].filter(Boolean).join(' · ')) + '</div></div>' +
        '<button class="close" data-close aria-label="关闭">×</button></div>' +
      '<div class="grid grid-4 section">' +
        '<div class="stat"><div class="num mono">' + totalFor(spirit) + '</div><div class="label">总次数</div></div>' +
        '<div class="stat"><div class="num mono">' + spirit.regular + '</div><div class="label">常规</div></div>' +
        '<div class="stat"><div class="num mono">' + spirit.extra + '</div><div class="label">加塞</div></div>' +
        '<div class="stat"><div class="num mono">' + spirit.group + '</div><div class="label">集体</div></div>' +
      '</div>' +
      '<p class="small muted">最近复刻 ' + esc(fmtDate(spirit.lastAt)) + ' · 首次 ' + esc(fmtDate(spirit.firstAt)) + '</p>' +
      checkNote +
      '<h4 class="section">单次复刻（' + occs.length + '）</h4>' + occHtml +
      (groups.length ? '<h4 class="section">集体复刻出场（' + groups.length + '）</h4>' + groupHtml : '') +
      '<p class="small muted section">名字与季节来自社区 Wiki；时间与是否存在来自官方公告。' +
        '<a href="' + esc((META.sources || []).find(function (s) { return s.type === 'wiki'; })?.url || '#') + '" target="_blank" rel="noopener">查看 Wiki 记录</a></p>';

    mask.classList.add('show');
    drawer.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    mask.classList.remove('show');
    drawer.classList.remove('show');
    document.body.style.overflow = '';
  }

  /* ---------------- 导出 ---------------- */
  function download(filename, content, type) {
    var blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function exportSpiritsCsv() {
    var header = ['先祖', '季节', '地图', '常规', '加塞', '集体', '总次数(三项)', '总次数(常规+集体)', '首次复刻', '最近复刻', 'Wiki累计常规次数'];
    var lines = [header.join(',')];
    SPIRITS.forEach(function (s) {
      lines.push([
        s.name, s.season || '', s.map || '', s.regular, s.extra, s.group,
        s.total, s.totalRC, fmtDate(s.firstAt), fmtDate(s.lastAt), s.wikiRegularCount == null ? '' : s.wikiRegularCount
      ].map(function (cell) {
        var text = String(cell == null ? '' : cell);
        return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join(','));
    });
    download('光遇国服复刻先祖统计.csv', '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
  }

  function exportOccurrencesJson() {
    download('光遇国服复刻明细.json', JSON.stringify({ meta: META, occurrences: OCC, groupEvents: GROUPS, pending: PENDING }, null, 2), 'application/json');
  }

  /* ---------------- 路由与事件 ---------------- */
  function currentRoute() {
    var hash = (location.hash || '').replace(/^#\/?/, '');
    if (['overview', 'spirits', 'timeline', 'groups', 'about'].indexOf(hash) < 0) return 'overview';
    return hash;
  }

  function updateTabs() {
    var route = currentRoute();
    document.querySelectorAll('.tabs a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#/' + route);
    });
  }

  function render() {
    var route = currentRoute();
    updateTabs();
    closeDrawer();
    if (route === 'overview') renderOverview();
    else if (route === 'spirits') renderSpirits();
    else if (route === 'timeline') renderTimeline();
    else if (route === 'groups') renderGroups();
    else renderAbout();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function closeDropdowns(except) {
    document.querySelectorAll('.dropdown').forEach(function (dd) {
      if (dd === except) return;
      var panel = dd.querySelector('.dd-panel');
      var trigger = dd.querySelector('.dd-trigger');
      if (panel) panel.hidden = true;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', function (event) {
    var target = event.target;

    var trigger = target.closest ? target.closest('.dd-trigger') : null;
    if (trigger) {
      var dd = trigger.parentElement;
      var panel = dd.querySelector('.dd-panel');
      var willOpen = panel.hidden;
      closeDropdowns(dd);
      panel.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }

    var seasonBtn = target.closest ? target.closest('[data-season]') : null;
    if (seasonBtn) {
      state.season = seasonBtn.getAttribute('data-season') || '';
      var label = document.getElementById('season-label');
      if (label) label.textContent = state.season || '全部季节';
      var host = seasonBtn.parentElement;
      if (host) {
        host.querySelectorAll('[data-season]').forEach(function (btn) {
          btn.classList.toggle('active', btn === seasonBtn);
        });
      }
      closeDropdowns(null);
      updateSpiritTable();
      return;
    }

    closeDropdowns(null);

    var opener = target.closest ? target.closest('[data-open-spirit]') : null;
    if (opener) {
      var name = opener.getAttribute('data-open-spirit');
      if (name) openSpirit(name);
      return;
    }

    if (target.closest && target.closest('[data-close]')) {
      closeDrawer();
      return;
    }

    if (target === mask) {
      closeDrawer();
      return;
    }

    var sortTh = target.closest ? target.closest('th[data-sort]') : null;
    if (sortTh) {
      if (!sortTh.classList.contains('sortable')) return;
      var key = sortTh.getAttribute('data-sort');
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = key; state.sortDir = key === 'name' || key === 'season' ? 'asc' : 'desc'; }
      updateSpiritTable();
      return;
    }

    var modeBtn = target.closest ? target.closest('[data-mode]') : null;
    if (modeBtn) {
      state.mode = modeBtn.getAttribute('data-mode');
      document.querySelectorAll('[data-mode]').forEach(function (btn) {
        btn.classList.toggle('active', btn === modeBtn);
      });
      updateSpiritTable();
      return;
    }

    var kindBtn = target.closest ? target.closest('[data-kind]') : null;
    if (kindBtn) {
      state.timelineKind = kindBtn.getAttribute('data-kind');
      renderTimeline();
    }
  });

  document.addEventListener('input', function (event) {
    if (event.target.id === 'search') {
      state.q = event.target.value;
      updateSpiritTable();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeDrawer();
      closeDropdowns(null);
    }
  });

  window.addEventListener('hashchange', render);

  if (!location.hash) location.hash = '#/overview';
  render();
})();
