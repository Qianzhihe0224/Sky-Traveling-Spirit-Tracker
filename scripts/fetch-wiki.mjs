// 抓取 BWiki「旅行先祖回归记录」的原始 wikitext，解析为结构化 JSON。
// 该页面是社区整理的国服复刻全量记录（含常规/集体、开始/结束、先祖名、季节、地图、累计次数），
// 在本项目中只用于：①补先祖名字 ②交叉核对 —— 复刻事实仍以官方公告为准。
// 用法：node scripts/fetch-wiki.mjs [--out=data/raw/wiki-records.json]
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('data/raw/wiki-records.json');
const PAGE = '旅行先祖回归记录';
const URL_RAW = `https://wiki.biligame.com/sky/${encodeURIComponent(PAGE)}?action=raw`;
const URL_PAGE = `https://wiki.biligame.com/sky/${encodeURIComponent(PAGE)}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchRaw() {
  const delays = [0, 5000, 20000, 60000];
  for (let i = 0; i < delays.length; i += 1) {
    if (delays[i]) {
      console.log(`等待 ${delays[i] / 1000}s 后重试…`);
      await sleep(delays[i]);
    }
    try {
      const res = await fetch(URL_RAW, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: URL_PAGE,
        },
        signal: AbortSignal.timeout(25000),
      });
      const text = await res.text();
      if (res.status === 200 && text.includes('复刻项')) {
        console.log('抓取成功，长度', text.length);
        return text;
      }
      console.log(`第 ${i + 1} 次失败：HTTP ${res.status}, 长度 ${text.length}`);
    } catch (err) {
      console.log(`第 ${i + 1} 次异常：${err.message}`);
    }
  }
  throw new Error('BWiki 抓取失败（可能被限流）');
}

function parseTemplate(block) {
  const record = {};
  for (const m of block.matchAll(/\|([^=|{}]+)=([^|{}]*)/g)) {
    record[m[1].trim()] = m[2].trim();
  }
  return record;
}

async function main() {
  const text = await fetchRaw();
  const blocks = text.match(/\{\{复刻项([\s\S]*?)\}\}\s*(?=\n|\{\{|$)/g) || [];
  const records = blocks.map(parseTemplate).filter(r => r['开始时间']);

  const entries = records.map(record => {
    const type = record['复刻类型'] || '';
    const spiritsRaw = record['先祖中文名'] || record['先祖'] || '';
    const seasonsRaw = record['所属季节'] || '';
    const mapsRaw = record['所属地图'] || '';
    const split = value =>
      String(value)
        .split(/[、,，;；\/]/)
        .map(item => item.trim())
        .filter(Boolean);
    return {
      wikiId: Number(record['id'] || 0),
      type,
      isGroup: type.includes('集体'),
      start: record['开始时间'] || '',
      end: record['结束时间'] || '',
      regularCount: record['常规复刻次数'] ? Number(record['常规复刻次数']) : null,
      spirits: split(spiritsRaw),
      seasons: split(seasonsRaw),
      maps: split(mapsRaw),
      raw: record,
    };
  });

  const payload = {
    source: 'biligame-wiki',
    sourceUrl: URL_PAGE,
    rawUrl: URL_RAW,
    note: '社区 Wiki 整理，仅用于补名字与交叉核对，不是复刻事实的依据',
    fetchedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`已写入 ${entries.length} 条 → ${OUT}`);
  const groups = entries.filter(e => e.isGroup);
  console.log(`常规 ${entries.length - groups.length} 条，集体 ${groups.length} 条`);
  console.log('示例：', JSON.stringify(entries[entries.length - 1]));
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
