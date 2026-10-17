// 从社区资料站（多特游戏 光遇复刻先祖 专题）抓取"日期 → 先祖名/季节"的对照
// 仅用于补名字，不作为"复刻事实"的依据；所有结果保留来源 URL。
// 用法：node scripts/fetch-community-names.mjs [--pages=6] [--out=data/raw/community-names.json]
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [arg, 'true'];
  }),
);

const PAGES = Number(args.pages || 6);
const OUT = path.resolve(args.out || 'data/raw/community-names.json');
const BASE = 'https://www.duotegame.com';
const LIST = 'https://www.duotegame.com/zt/gy/fkxz/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) sky-cn-returning-spirits/1.0';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function get(url, attempt = 0) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt < 3) {
      await sleep(800 * (attempt + 1));
      return get(url, attempt + 1);
    }
    throw err;
  }
}

const stripTags = html =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function collectList() {
  const articles = new Map();
  for (let page = 1; page <= PAGES; page += 1) {
    const url = page === 1 ? LIST : `${LIST}list_${page}`;
    let html;
    try {
      html = await get(url);
    } catch (err) {
      console.warn(`列表页 ${page} 失败：${err.message}`);
      break;
    }
    const re = /href="(\/mgl\/\d+\.html)"[^>]*>([^<]{2,80})</g;
    let added = 0;
    for (const m of html.matchAll(re)) {
      const title = m[2].trim();
      if (!/复刻|先祖/.test(title)) continue;
      if (/预测|猜测/.test(title)) continue;
      if (!articles.has(m[1])) {
        articles.set(m[1], title);
        added += 1;
      }
    }
    console.log(`列表页 ${page}: 新增 ${added} 条，累计 ${articles.size}`);
    if (added === 0 && page > 2) break;
    await sleep(250);
  }
  return articles;
}

function extractName(text) {
  const seasonMatch = text.match(/【([^】]{1,10})】\s*([\u4e00-\u9fa5·]{2,12})/);
  if (seasonMatch) return { season: seasonMatch[1], name: seasonMatch[2] };
  const m2 = text.match(/复刻([\u4e00-\u9fa5]{2,8})先祖/);
  if (m2) return { season: null, name: m2[1] };
  return null;
}

function extractDate(text) {
  const full = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日复刻/);
  if (full) return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) };
  const range = text.match(/复刻时间[：:]?\s*(\d{1,2})月(\d{1,2})日/);
  if (range) return { year: null, month: Number(range[1]), day: Number(range[2]) };
  return null;
}

async function main() {
  const articles = await collectList();
  const results = [];
  let index = 0;
  for (const [link, title] of articles) {
    index += 1;
    let text = '';
    try {
      text = stripTags(await get(`${BASE}${link}`));
    } catch (err) {
      console.warn(`文章 ${link} 失败：${err.message}`);
      continue;
    }
    const nameInfo = extractName(text);
    const dateInfo = extractDate(text);
    if (!nameInfo || !dateInfo) continue;
    results.push({
      date: dateInfo,
      name: nameInfo.name,
      season: nameInfo.season,
      title,
      sourceUrl: `${BASE}${link}`,
    });
    if (index % 10 === 0) console.log(`已解析 ${index}/${articles.size}，有效 ${results.length}`);
    await sleep(200);
  }

  const byKey = new Map();
  for (const item of results) {
    const key = `${item.date.month}-${item.date.day}|${item.name}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  const unique = [...byKey.values()].sort(
    (a, b) => a.date.month - b.date.month || a.date.day - b.date.day,
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: 'duotegame-community',
        note: '社区营销站整理，仅用于补先祖名字与季节，不作为复刻事实依据',
        fetchedAt: new Date().toISOString(),
        count: unique.length,
        entries: unique,
      },
      null,
      1,
    ),
    'utf8',
  );
  console.log(`完成：有效名字 ${unique.length} 条 → ${OUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
