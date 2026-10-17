// 抓取网易大神官方认证账号「Sky光遇」的全部公开动态，落成本地快照
// 用法：node scripts/sync-dashen.mjs [--since=2021-07-01] [--out=data/raw/dashen.json] [--max-pages=200]
import fs from 'node:fs';
import path from 'node:path';
import {
  OFFICIAL_UID,
  LIST_URL,
  DETAIL_URL,
  FEED_TYPES,
  FEED_PAGE_URL,
  USER_AGENT,
} from './lib/constants.mjs';
import { msToISO } from './lib/dates.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [arg, 'true'];
  }),
);

const SINCE = args.since ? Date.parse(`${args.since}T00:00:00+08:00`) : Date.parse('2020-01-01T00:00:00+08:00');
const OUT = path.resolve(args.out || 'data/raw/dashen.json');
const MAX_PAGES = Number(args['max-pages'] || 400);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJSON(url, attempt = 0) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,*/*' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt < 3) {
      await sleep(1000 * (attempt + 1));
      return fetchJSON(url, attempt + 1);
    }
    throw err;
  }
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseContent(raw) {
  if (!raw || typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return { text: trimmed };
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && parsed.body ? parsed.body : parsed;
  } catch {
    return { text: trimmed };
  }
}

function normalizeFeed(raw) {
  const body = parseContent(raw.content);
  const media = Array.isArray(body.media) ? body.media : [];
  const images = media
    .filter(item => item && item.url && String(item.mimeType || '').startsWith('image/'))
    .map(item => item.url);
  const videos = media
    .filter(item => item && item.url && String(item.mimeType || '').startsWith('video/'))
    .map(item => item.url);
  const text = stripHtml(body.text || '');
  const longText = stripHtml(body.longText || '');
  const title = stripHtml(body.title || '').replace(/\s+/g, ' ').trim();
  const createTime = Number(raw.createTime || raw.record?.createTime || 0);
  const id = String(raw.id || '');
  return {
    id,
    postUrl: FEED_PAGE_URL(id),
    announcedAt: createTime ? msToISO(createTime) : null,
    createTime,
    type: raw.type ?? null,
    title,
    text,
    longText,
    images,
    videos,
    topics: (raw.topicInfoList || []).map(t => t?.topicName).filter(Boolean),
    deleted: Number(raw.deleteTime || 0) > 0,
  };
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { feeds: [] };
  const map = new Map((existing.feeds || []).map(feed => [feed.id, feed]));

  let maxTime = Date.now() + 86400000;
  let minTime = 0;
  let page = 0;
  let added = 0;

  while (page < MAX_PAGES) {
    const url = new URL(LIST_URL);
    url.searchParams.set('feedTypes', FEED_TYPES);
    url.searchParams.set('someOneUid', OFFICIAL_UID);
    url.searchParams.set('maxTime', String(maxTime));
    url.searchParams.set('minTime', String(minTime));
    const payload = await fetchJSON(url.toString());
    const feeds = payload?.result?.feeds || [];
    if (!feeds.length) break;

    let oldest = Infinity;
    for (const raw of feeds) {
      const feed = normalizeFeed(raw);
      if (!feed.id || !feed.createTime) continue;
      oldest = Math.min(oldest, feed.createTime);
      if (feed.createTime < SINCE) continue;
      if (!map.has(feed.id)) {
        map.set(feed.id, feed);
        added += 1;
      }
    }

    const next = Number(payload?.result?.nextRangeParam?.maxTime);
    if (!Number.isFinite(next) || next <= 0 || next >= maxTime) break;
    maxTime = next;
    minTime = Number(payload?.result?.nextRangeParam?.minTime || 0);
    page += 1;
    if (oldest < SINCE) break;
    process.stdout.write(`\r已抓取 ${map.size} 条（第 ${page} 页）`);
    await sleep(300);
  }

  const feeds = [...map.values()]
    .filter(feed => feed.createTime >= SINCE)
    .sort((a, b) => b.createTime - a.createTime);

  const output = {
    source: 'dashen-official',
    officialUid: OFFICIAL_UID,
    officialNick: 'Sky光遇',
    fetchedAt: new Date().toISOString(),
    since: new Date(SINCE).toISOString(),
    count: feeds.length,
    feeds,
  };
  fs.writeFileSync(OUT, JSON.stringify(output, null, 1), 'utf8');
  console.log(`\n完成：${feeds.length} 条（本次新增 ${added}），写入 ${OUT}`);
}

main().catch(err => {
  console.error('抓取失败：', err);
  process.exit(1);
});
