// 合并「官方公告（事实）」与「社区 Wiki 记录（补名字/交叉核对）」，产出最终数据文件
// 用法：node scripts/import-data.mjs [--since=2020-03-01]
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [arg, 'true'];
  }),
);
const SINCE = args.since || '2020-03-01';
const DAY = 86400000;

const rawFeeds = JSON.parse(fs.readFileSync('data/raw/dashen.json', 'utf8')).feeds;
const queue = JSON.parse(fs.readFileSync('data/review-queue.json', 'utf8'));
const wiki = JSON.parse(fs.readFileSync('data/raw/wiki-records.json', 'utf8'));

const WIKI_URL = wiki.sourceUrl;
const feedById = new Map(rawFeeds.map(feed => [feed.id, feed]));

const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);
const ymd = value => String(value).slice(0, 10);
const pick = (record, key) => record?.[key] ?? null;

// ---------- 1. 先祖目录（名字/季节/地图来自社区 Wiki，标注来源） ----------
const spiritMeta = new Map();
const rememberSpirit = (name, season, map) => {
  if (!name) return;
  const prev = spiritMeta.get(name) || { name, seasons: new Set(), maps: new Set() };
  if (season) prev.seasons.add(season);
  if (map) prev.maps.add(map);
  spiritMeta.set(name, prev);
};
for (const entry of wiki.entries) {
  entry.spirits.forEach((name, index) => {
    if (entry.isGroup) {
      rememberSpirit(name, entry.seasons[index] || entry.seasons[0], entry.maps[index] || entry.maps[0]);
    } else {
      rememberSpirit(name, entry.seasons[0], entry.maps[0]);
    }
  });
}

// ---------- 2. 集体复刻活动（按起止时间聚合 Wiki 行） ----------
const wikiGroups = new Map();
for (const entry of wiki.entries.filter(item => item.isGroup)) {
  const key = `${entry.start}|${entry.end}`;
  const group = wikiGroups.get(key) || {
    start: entry.start,
    end: entry.end,
    members: [],
    wikiIds: [],
  };
  entry.spirits.forEach((name, index) => {
    group.members.push({
      name,
      season: entry.seasons[index] || entry.seasons[0] || null,
      map: entry.maps[index] || entry.maps[0] || null,
    });
  });
  group.wikiIds.push(entry.wikiId);
  wikiGroups.set(key, group);
}
const groupList = [...wikiGroups.values()].sort((a, b) => a.start.localeCompare(b.start));

// ---------- 3. 官方事件 → 复刻记录 ----------
const occurrences = [];
const unmatched = [];
const usedWikiRegularStarts = new Set();
const usedGroups = new Set();

const officialEvents = queue.events
  .filter(event => event.start >= SINCE)
  .sort((a, b) => a.start.localeCompare(b.start));

// ---------- 3.0 两轮匹配：先精确同日，再 ±2 天兜底 ----------
const wikiRegularEntries = wiki.entries.filter(item => !item.isGroup);
const regularFor = new Map();
const groupFor = new Map();

const assignGroups = (tolerance, onlyGroupy = true) => {
  for (const event of officialEvents) {
    if (groupFor.has(event)) continue;
    if (regularFor.has(event) && tolerance > 0) continue;
    if (onlyGroupy && event.kindGuess !== 'group') continue;
    const best = groupList
      .filter(group => !usedGroups.has(group.start))
      .map(group => ({ group, diff: Math.abs(dayDiff(event.start, `${group.start}T00:00:00+08:00`)) }))
      .filter(item => item.diff <= tolerance)
      .sort((a, b) => a.diff - b.diff)[0];
    if (best) {
      groupFor.set(event, best.group);
      usedGroups.add(best.group.start);
    }
  }
};

const assignRegulars = tolerance => {
  for (const event of officialEvents) {
    if (regularFor.has(event)) continue;
    const best = wikiRegularEntries
      .filter(entry => !usedWikiRegularStarts.has(`${entry.start}|${entry.spirits[0]}`))
      .map(entry => ({ entry, diff: Math.abs(dayDiff(event.start, `${entry.start}T00:00:00+08:00`)) }))
      .filter(item => item.diff <= tolerance)
      .sort((a, b) => a.diff - b.diff)[0];
    if (best) {
      regularFor.set(event, best.entry);
      usedWikiRegularStarts.add(`${best.entry.start}|${best.entry.spirits[0]}`);
    }
  }
};

assignGroups(0, true);
assignRegulars(0);
assignRegulars(2);
assignGroups(2, false);

let prevNonGroupStart = null;

for (let index = 0; index < officialEvents.length; index += 1) {
  const event = officialEvents[index];

  const wikiGroup = groupFor.get(event) || null;
  const wikiRegular = regularFor.get(event) || null;

  const isGroup = Boolean(wikiGroup) || event.kindGuess === 'group';
  let kind = isGroup ? 'group' : 'regular';
  let kindEvidence = wikiGroup ? 'wiki-group' : event.kindGuess === 'group' ? 'official-window' : 'official-window';
  let kindConfidence = 'confirmed';

  // 加塞判定：与"上一条非常规复刻"的开档间隔 ≤ 9 天（社区口径，属推断）
  if (!isGroup && prevNonGroupStart) {
    const gap = dayDiff(event.start, prevNonGroupStart);
    if (gap > 0 && gap <= 9) {
      kind = 'extra';
      kindEvidence = 'cadence-inference';
      kindConfidence = 'inferred';
    }
  }
  if (!isGroup) prevNonGroupStart = event.start;

  const posts = event.posts
    .map(post => ({ ...post, feed: feedById.get(post.postId) }))
    .filter(post => post.feed);
  const primary = posts.find(post => post.postKind === 'arrival') || posts[0] || null;
  const officialText = posts.map(post => `${post.feed.title}\n${post.feed.text}`).join('\n');
  const images = [...new Set(posts.flatMap(post => post.feed.images || []))].slice(0, 4);

  const spiritName = isGroup ? null : wikiRegular?.spirits?.[0] || null;
  const nameVerification = (() => {
    if (!spiritName) return { status: 'unresolved', evidence: [], note: '' };
    const nameInText = officialText.includes(spiritName);
    return {
      status: nameInText ? 'official-text' : 'community',
      evidence: [{ type: 'wiki', url: WIKI_URL }],
      note: nameInText ? '官方公告正文直接出现该名字' : '官方公告正文未写名，名字取自社区 Wiki',
    };
  })();

  occurrences.push({
    id: `oc-${ymd(event.start)}-${spiritName || (isGroup ? 'group' : 'unknown')}`,
    spiritId: spiritName,
    spiritName,
    kind,
    kindEvidence,
    kindConfidence,
    groupEventId: isGroup && wikiGroup ? `ge-${ymd(wikiGroup.start)}` : null,
    start: event.start,
    end: event.end,
    windowSource: event.windowSource,
    factStatus: 'confirmed',
    nameVerification,
    source: {
      type: 'dashen',
      postId: primary?.postId || null,
      url: primary?.url || null,
      allPosts: posts.map(post => ({ postId: post.postId, url: post.url, title: post.title, announcedAt: post.feed.announcedAt, kind: post.postKind })),
      imageUrls: images,
      excerpt: (primary?.feed?.text || '').slice(0, 220),
      announcedAt: primary?.feed?.announcedAt || event.announcedAt,
      deleted: Boolean(primary?.feed?.deleted),
    },
    season: wikiRegular?.seasons?.[0] || null,
    map: wikiRegular?.maps?.[0] || null,
    wikiRef: wikiRegular ? { start: wikiRegular.start, end: wikiRegular.end, regularCount: wikiRegular.regularCount, url: WIKI_URL } : null,
    note: event.note || '',
  });

  if (!isGroup && !spiritName) unmatched.push({ start: event.start, end: event.end, url: primary?.url || null });
}

// ---------- 4. 集体复刻活动成品 ----------
const groupEvents = [];
for (const group of groupList) {
  if (group.start < SINCE) continue;
  const matched = occurrences.filter(item => item.kind === 'group' && item.groupEventId === `ge-${ymd(group.start)}`);
  if (!matched.length) continue;
  const primary = matched[0];
  const seasons = [...new Set(group.members.map(member => member.season).filter(Boolean))];
  // 集体活动的起止：官方公告写明了明确区间就用官方；否则用社区记录的区间兜底
  const useWikiWindow = primary.windowSource !== 'explicit-range';
  const groupStart = useWikiWindow ? `${group.start}T06:00:00+08:00` : primary.start;
  const groupEnd = useWikiWindow ? `${group.end}T23:59:00+08:00` : primary.end;
  groupEvents.push({
    id: `ge-${ymd(group.start)}`,
    name: seasons.length === 1 ? `${seasons[0]}集体复刻` : `集体复刻（${group.members.length} 位先祖）`,
    start: groupStart,
    end: groupEnd,
    windowSource: useWikiWindow ? 'wiki' : 'official',
    spiritNames: [...new Set(group.members.map(member => member.name))],
    members: group.members,
    listStatus: 'community-compiled',
    listSource: { type: 'wiki', url: WIKI_URL, note: '官方公告未逐一列名，名单取自社区 Wiki' },
    source: primary.source,
    wikiRef: { start: group.start, end: group.end, url: WIKI_URL },
    note: '集体复刻：同一场活动内每位先祖只计 1 次出场',
  });
}
// 官方判定为集体但 Wiki 没匹配上的，也保留活动本身
for (const occ of occurrences.filter(item => item.kind === 'group')) {
  if (groupEvents.some(group => group.id === occ.groupEventId)) continue;
  groupEvents.push({
    id: occ.groupEventId || `ge-${ymd(occ.start)}`,
    name: '集体复刻',
    start: occ.start,
    end: occ.end,
    spiritNames: [],
    members: [],
    listStatus: 'unpublished',
    listSource: null,
    source: occ.source,
    wikiRef: null,
    note: '官方公告未公布具体名单，暂不计入任何先祖',
  });
  occ.groupEventId = groupEvents.at(-1).id;
}
groupEvents.sort((a, b) => a.start.localeCompare(b.start));

// ---------- 4.1 统一集体活动窗口，并吸收落在活动区间内的补充公告 ----------
const groupById = new Map(groupEvents.map(group => [group.id, group]));
for (const occ of occurrences.filter(item => item.kind === 'group')) {
  const group = groupById.get(occ.groupEventId);
  if (group) {
    occ.start = group.start;
    occ.end = group.end;
  }
}

const absorbed = [];
for (const occ of occurrences.filter(item => item.kind !== 'group' && !item.wikiRef)) {
  const group = groupEvents.find(event => occ.start >= event.start && occ.start <= event.end);
  if (!group) continue;
  group.extraAnnouncements = group.extraAnnouncements || [];
  group.extraAnnouncements.push({
    postId: occ.source.postId,
    url: occ.source.url,
    announcedAt: occ.source.announcedAt,
    note: '同一场集体活动的补充公告（官方未列名单）',
  });
  occ.dropped = true;
  absorbed.push(occ);
}
if (absorbed.length) {
  const kept = occurrences.filter(item => !item.dropped);
  occurrences.length = 0;
  occurrences.push(...kept);
}

// 重新计算"官方有复刻但名字未确认"的清单
unmatched.length = 0;
for (const occ of occurrences) {
  if (occ.kind !== 'group' && !occ.spiritName) {
    unmatched.push({ start: occ.start, end: occ.end, url: occ.source.url });
  }
}

// ---------- 5. 只有 Wiki、没有官方公告的记录（待考证，不计入统计） ----------
const officialNonGroupStarts = new Set(
  occurrences.filter(item => item.kind !== 'group').map(item => item.start.slice(0, 10)),
);
const pending = wiki.entries
  .filter(
    entry =>
      !entry.isGroup &&
      entry.start >= SINCE &&
      !officialNonGroupStarts.has(entry.start) &&
      !usedWikiRegularStarts.has(`${entry.start}|${entry.spirits[0]}`),
  )
  .map(entry => ({
    start: `${entry.start}T06:00:00+08:00`,
    end: `${entry.end}T12:00:00+08:00`,
    name: entry.spirits[0],
    season: entry.seasons[0] || null,
    map: entry.maps[0] || null,
    factStatus: 'pending',
    reason: '社区 Wiki 有记录，但未找到对应的官方公告',
    source: { type: 'wiki', url: WIKI_URL },
  }));

// ---------- 6. 先祖统计 ----------
const spirits = [...spiritMeta.keys()].map(name => {
  const meta = spiritMeta.get(name);
  const list = occurrences.filter(item => item.spiritId === name);
  const groups = groupEvents.filter(group => group.spiritNames.includes(name));
  const wikiEntry = [...wiki.entries]
    .filter(entry => !entry.isGroup && entry.spirits[0] === name)
    .sort((a, b) => b.start.localeCompare(a.start))[0];
  const regular = list.filter(item => item.kind === 'regular').length;
  const extra = list.filter(item => item.kind === 'extra').length;
  const groupCount = groups.length;
  const allStarts = [...list.map(item => item.start), ...groups.map(group => group.start)].sort();
  return {
    id: name,
    name,
    seasons: [...meta.seasons],
    season: wikiEntry?.seasons?.[0] || [...meta.seasons][0] || null,
    maps: [...meta.maps],
    map: wikiEntry?.maps?.[0] || [...meta.maps][0] || null,
    regular,
    extra,
    group: groupCount,
    total: regular + extra + groupCount,
    totalRC: regular + groupCount,
    firstAt: allStarts[0] || null,
    lastAt: allStarts.at(-1) || null,
    groupEvents: groups.map(group => ({ id: group.id, start: group.start, end: group.end, name: group.name })),
    wikiRegularCount: wikiEntry?.regularCount ?? null,
    crossCheckDiff: wikiEntry ? regular + extra - wikiEntry.regularCount : null,
  };
});

spirits.sort((a, b) => b.total - a.total || b.lastAt?.localeCompare(a.lastAt || '') || 0);

// 只保留真正有官方复刻记录的先祖（目录里的其他名字留给"待考证"清单）
const activeSpirits = spirits.filter(spirit => spirit.total > 0);

// ---------- 7. 落盘 ----------
const meta = {
  generatedAt: new Date().toISOString(),
  dataCutoff: occurrences.map(item => item.end).sort().at(-1),
  coverage: {
    from: occurrences.map(item => item.start).sort()[0] || null,
    to: occurrences.map(item => item.end).sort().at(-1) || null,
  },
  archiveSince: SINCE,
  officialUid: queue.officialUid,
  officialName: '网易大神 · Sky光遇（官方认证）',
  counts: {
    occurrences: occurrences.length,
    regular: occurrences.filter(item => item.kind === 'regular').length,
    extra: occurrences.filter(item => item.kind === 'extra').length,
    groupOccurrences: occurrences.filter(item => item.kind === 'group').length,
    groups: groupEvents.length,
    spirits: activeSpirits.length,
    catalog: spirits.length,
    pending: pending.length,
    unmatched: unmatched.length,
  },
  sources: [
    { type: 'dashen', name: '网易大神「Sky光遇」官方认证账号', url: 'https://ds.163.com/user/154db622a20e4327ac277bc35d4f2e76/', role: '复刻事实（是否存在、起止时间）' },
    { type: 'sky163', name: '《光·遇》国服官网', url: 'https://sky.163.com/news/', role: '补充佐证' },
    { type: 'wiki', name: 'BWiki 旅行先祖回归记录', url: WIKI_URL, role: '先祖名字、季节、地图与交叉核对' },
    { type: 'community', name: '多特游戏 复刻先祖汇总', url: 'https://www.duotegame.com/zt/gy/fkxz/', role: '名字与“加塞”标注的辅助核对' },
  ],
};

const payload = { meta, spirits: activeSpirits, occurrences: occurrences.sort((a, b) => b.start.localeCompare(a.start)), groupEvents, pending, unmatched };
fs.writeFileSync('data/occurrences.json', JSON.stringify(payload, null, 1), 'utf8');
fs.writeFileSync(
  'data/spirits.json',
  JSON.stringify({ meta: { source: 'derived', note: '由 import-data.mjs 从 occurrences 聚合' }, spirits: activeSpirits }, null, 1),
  'utf8',
);

console.log('复刻记录：', payload.meta.counts);
console.log('未归属先祖的官方复刻：', unmatched.length);
console.log('只有 Wiki 记录的待考证：', pending.length);
console.log(
  '交叉核对不一致（官方计数 vs Wiki 常规次数）：',
  activeSpirits.filter(item => item.crossCheckDiff).length,
);
