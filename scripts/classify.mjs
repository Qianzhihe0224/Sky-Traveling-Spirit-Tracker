// 把官方动态整理成"复刻事件候选"，供人工核验
// 用法：node scripts/classify.mjs [--since=2021-07-01] [--out=data/review-queue.json]
import fs from 'node:fs';
import path from 'node:path';
import { SPIRIT_KEYWORDS } from './lib/constants.mjs';
import { beijingParts, weekdayCN } from './lib/dates.mjs';
import {
  extractGroupName,
  extractItemHints,
  extractLocationHint,
  isGroupAnnouncement,
  parseWindow,
  postKind,
} from './lib/parse.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [arg, 'true'];
  }),
);

const RAW = 'data/raw/dashen.json';
const OUT = path.resolve(args.out || 'data/review-queue.json');
const SINCE = args.since ? Date.parse(`${args.since}T00:00:00+08:00`) : 0;

const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const feeds = raw.feeds.filter(feed => feed.createTime >= SINCE);

const firstLine = text =>
  (text || '')
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';

const isCandidate = feed => {
  const all = `${feed.title}\n${feed.text}\n${(feed.topics || []).join(' ')}`;
  return SPIRIT_KEYWORDS.some(kw => all.includes(kw));
};

// 常规周窗口统一为 06:00 / 12:00（公告偶有"6:05"这类写法）
function normalizeWindow(window) {
  if (!['relative-weekday', 'weekly-default'].includes(window.source)) return window;
  const startHour = Number(window.start.slice(11, 13));
  const endHour = Number(window.end.slice(11, 13));
  let { start, end } = window;
  if (startHour >= 4 && startHour <= 8) start = `${start.slice(0, 11)}06:00:00+08:00`;
  if (endHour >= 10 && endHour <= 14) end = `${end.slice(0, 11)}12:00:00+08:00`;
  return { ...window, start, end };
}

const events = new Map();
const skipped = [];

for (const post of feeds.filter(isCandidate)) {
  const parsed = parseWindow(post);
  if (!parsed) {
    skipped.push({
      postId: post.id,
      url: post.postUrl,
      title: post.title || firstLine(post.text),
      announcedAt: post.announcedAt,
    });
    continue;
  }
  const window = normalizeWindow(parsed);
  const durationDays = (Date.parse(window.end) - Date.parse(window.start)) / 86400000;
  // 常驻 4 天左右的是单次复刻；跨度超过 8 天的活动视为集体回归（多先祖同场）
  const group = durationDays > 8 || (isGroupAnnouncement(post.title, `${post.text}\n${post.longText}`) && durationDays > 6);
  const kindGuess = group ? 'group' : 'regular';
  const key = `${kindGuess}|${window.start.slice(0, 10)}|${window.end.slice(0, 10)}`;
  const record = events.get(key) || {
    id: `cand-${window.start.slice(0, 10)}-${kindGuess}`,
    kindGuess,
    start: window.start,
    end: window.end,
    windowSource: window.source,
    groupName: group ? extractGroupName(post.title || firstLine(post.text), post.text) : null,
    posts: [],
    itemHints: [],
    locationHint: null,
    spiritId: null,
    nameStatus: 'unknown',
    status: 'pending-review',
    suggestedExtra: false,
    note: '',
  };
  record.posts.push({
    postId: post.id,
    url: post.postUrl,
    title: post.title || firstLine(post.text),
    announcedAt: post.announcedAt,
    postKind: postKind(post),
    images: post.images,
    excerpt: (post.text || '').slice(0, 300),
  });
  record.itemHints.push(...extractItemHints(post));
  const loc = extractLocationHint(post);
  if (loc) record.locationHint = loc;
  events.set(key, record);
}

let list = [...events.values()];

// 同一开始日的公告合并：只要有"集体"事件，就把同日其他公告并入集体活动
const byStartDay = new Map();
for (const record of list) {
  const key = record.start.slice(0, 10);
  const bucket = byStartDay.get(key) || [];
  bucket.push(record);
  byStartDay.set(key, bucket);
}
for (const [key, bucket] of byStartDay) {
  if (bucket.length < 2) continue;
  const group = bucket.find(item => item.kindGuess === 'group');
  const keeper = group || bucket[0];
  for (const record of bucket) {
    if (record === keeper) continue;
    if (group || record.kindGuess === keeper.kindGuess) {
      keeper.posts.push(...record.posts);
      keeper.itemHints.push(...record.itemHints);
      keeper.end = keeper.end > record.end ? keeper.end : record.end;
      record.dropped = true;
    }
  }
}
list = list.filter(e => !e.dropped);

// 同一开始日、同为集体的多条公告 → 合并（预告/到临/长图可能写法不同）
const groupByStart = new Map();
for (const record of list.filter(e => e.kindGuess === 'group')) {
  const key = record.start.slice(0, 10);
  const existing = groupByStart.get(key);
  if (!existing) {
    groupByStart.set(key, record);
    continue;
  }
  existing.posts.push(...record.posts);
  existing.itemHints.push(...record.itemHints);
  existing.end = existing.end > record.end ? existing.end : record.end;
  record.dropped = true;
}
list = list.filter(e => !e.dropped);

// 同一时间窗同时出现"集体"与"常规"公告 → 合并进集体活动
const groupKeys = new Set(
  list.filter(e => e.kindGuess === 'group').map(e => `${e.start.slice(0, 10)}|${e.end.slice(0, 10)}`),
);
for (const record of list.filter(e => e.kindGuess === 'regular')) {
  if (!groupKeys.has(`${record.start.slice(0, 10)}|${record.end.slice(0, 10)}`)) continue;
  const target = list.find(
    e => e.kindGuess === 'group' && e.start.slice(0, 10) === record.start.slice(0, 10),
  );
  target.posts.push(...record.posts);
  target.itemHints.push(...record.itemHints);
  record.dropped = true;
}
list = list.filter(e => !e.dropped);

for (const record of list) {
  record.posts.sort((a, b) => Date.parse(a.announcedAt) - Date.parse(b.announcedAt));
  record.itemHints = [...new Set(record.itemHints)].slice(0, 4);
  record.weekday = weekdayCN(record.start);
  record.announcedAt = record.posts[0]?.announcedAt || null;
}

// 相邻复刻间隔 ≤ 6 天 → 提示"疑似加塞"，交人工判定
list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
for (let i = 0; i < list.length; i += 1) {
  const prev = list[i - 1];
  const next = list[i + 1];
  const cur = Date.parse(list[i].start);
  const near = [prev, next].filter(Boolean).some(
    other => Math.abs(Date.parse(other.start) - cur) <= 6 * 86400000,
  );
  if (near && list[i].kindGuess === 'regular') list[i].suggestedExtra = true;
}
list.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

const coverageFrom = list.at(-1)?.start || null;
const coverageTo = list[0]?.start || null;

const result = {
  generatedAt: new Date().toISOString(),
  sourceSnapshot: RAW,
  sourceSnapshotCount: raw.count,
  officialUid: raw.officialUid,
  coverage: { from: coverageFrom, to: coverageTo },
  counts: {
    candidates: list.length,
    group: list.filter(e => e.kindGuess === 'group').length,
    regular: list.filter(e => e.kindGuess === 'regular').length,
    suggestedExtra: list.filter(e => e.suggestedExtra).length,
    skipped: skipped.length,
  },
  skipped,
  events: list,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1), 'utf8');

// review.html 需要能通过 file:// 直接打开，因此额外生成一份 JS 版本
const reviewJs = `// 由 scripts/classify.mjs 生成，供 review.html 读取\nwindow.__REVIEW__ = ${JSON.stringify({
  generatedAt: result.generatedAt,
  counts: result.counts,
  skipped: result.skipped,
  events: result.events,
})};\n`;
fs.writeFileSync('data/review-data.js', reviewJs, 'utf8');

console.log('候选事件：', list.length, result.counts);
const byYear = {};
for (const e of list) byYear[e.start.slice(0, 4)] = (byYear[e.start.slice(0, 4)] || 0) + 1;
console.log('按年：', byYear);
console.log('未解析时间的候选：', skipped.length);
for (const s of skipped) console.log('  -', (s.announcedAt || '').slice(0, 10), s.title || s.postId);
