// 生成「下一次常规复刻」的统计预测：档期周期概率 + 久未复刻候选排序
// 只做统计推测，不是官方预告；所有依据都写进输出，方便页面展示。
// 用法：node scripts/predict.mjs [--out=data/predictions.json]
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('data/predictions.json');
const DAY = 86400000;
const NOW = Date.now();

const data = JSON.parse(fs.readFileSync('data/occurrences.json', 'utf8'));
const regular = data.occurrences
  .filter(occ => occ.kind !== 'group')
  .sort((a, b) => a.start.localeCompare(b.start));

const ymd = iso => String(iso).slice(0, 10);
// 一律按北京时间显示（cron/CI 跑在 UTC，不能用 getUTCDay 直接取星期）
const bjFromMs = ms => {
  const d = new Date(Number(ms) + 8 * 3600000);
  const p = n => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getUTCDay()],
  };
};
const bjParts = iso => bjFromMs(Date.parse(iso));
const weekdayCN = iso => bjParts(iso).weekday;
const addDays = (iso, days) => `${bjFromMs(Date.parse(iso) + days * DAY).date}T06:00:00+08:00`;

// ---------- 1. 开档间隔分布（近 3 年，排除长空档） ----------
const recent = regular.filter(occ => NOW - Date.parse(occ.start) <= 3 * 365 * DAY);
const gaps = [];
for (let i = 1; i < recent.length; i += 1) {
  const gap = Math.round((Date.parse(recent[i].start) - Date.parse(recent[i - 1].start)) / DAY);
  if (gap >= 3 && gap <= 30) gaps.push(gap);
}
const totalGaps = gaps.length || 1;
const gapCount = {};
gaps.forEach(gap => {
  gapCount[gap] = (gapCount[gap] || 0) + 1;
});

// 常规档期取 7 的倍数（周四开档），加塞档期单列
const weekly = [7, 14, 21]
  .map(gap => ({ gap, count: gapCount[gap] || 0, p: (gapCount[gap] || 0) / totalGaps }))
  .filter(item => item.count > 0);
const extraGap = [5, 6, 8, 9, 13, 15].reduce((sum, gap) => sum + (gapCount[gap] || 0), 0) / totalGaps;

const last = regular.at(-1);
const nextDates = weekly
  .map(item => ({
    date: addDays(last.start, item.gap),
    weekday: weekdayCN(addDays(last.start, item.gap)),
    gapDays: item.gap,
    probability: Number((item.p * 100).toFixed(1)),
    sample: item.count,
  }))
  .filter(item => Date.parse(item.date) > NOW - DAY)
  .sort((a, b) => b.probability - a.probability);

// ---------- 2. 候选先祖打分 ----------
const maxCount = Math.max(1, ...data.spirits.map(spirit => spirit.regular + spirit.extra));
const dayOf = iso => Math.round((NOW - Date.parse(iso)) / DAY);

const candidates = data.spirits
  .map(spirit => {
    const daysSince = spirit.lastAt ? dayOf(spirit.lastAt) : 999;
    const count = spirit.regular + spirit.extra;
    const recency = Math.min(1, Math.max(0, daysSince) / 730); // 两年封顶
    const scarcity = 1 - Math.min(1, count / Math.max(3, maxCount));
    const score = Math.round((0.65 * recency + 0.35 * scarcity) * 100);
    const reasons = [];
    if (spirit.lastAt) reasons.push(`已 ${daysSince} 天未复刻`);
    if (count === 0) reasons.push('只有集体复刻出场，尚未单独复刻');
    else reasons.push(`历史单独复刻 ${count} 次`);
    if (spirit.group) reasons.push(`集体出场 ${spirit.group} 次`);
    return {
      name: spirit.name,
      season: spirit.season,
      map: spirit.map,
      lastAt: spirit.lastAt,
      daysSince,
      regular: spirit.regular,
      extra: spirit.extra,
      group: spirit.group,
      total: spirit.total,
      score,
      reasons,
    };
  })
  .filter(item => item.daysSince >= 45) // 刚复刻过的短期不太可能
  .sort((a, b) => b.score - a.score || b.daysSince - a.daysSince);

// ---------- 3. 落盘 ----------
const payload = {
  generatedAt: new Date().toISOString(),
  now: new Date(NOW).toISOString(),
  lastRegular: {
    start: last.start,
    end: last.end,
    spiritName: last.spiritName,
  },
  nextDates,
  extraChance: Number((extraGap * 100).toFixed(1)),
  cadence: {
    windowDays: 1095,
    samples: totalGaps,
    mode: 14,
    distribution: Object.keys(gapCount)
      .map(gap => ({ gap: Number(gap), count: gapCount[gap] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  },
  candidates: candidates.slice(0, 12),
  method: [
    '开档间隔：统计近三年每次常规复刻之间的天数，取出现最多的间隔（14 天）作为主预测，7 天作为备选。',
    '加塞可能性：间隔 5/6/8/9/13/15 天的历史占比，代表节假日加场的概率。',
    '候选排序：65% 看“距上次复刻天数”（越久越靠前），35% 看“历史上单独复刻次数”（越少越靠前）。',
    '刚复刻过（45 天内）的先祖不进入候选；集体复刻只作为参考信息，不改变排序权重。',
    '2021~2022 年后再未出现的先祖（如蟹舞者、螺旋武冠）可能已在轮换池之外，排名靠前只代表“数据上久未复刻”，不代表官方一定会安排。',
  ],
  disclaimer: '纯统计推测，不是官方预告。官方公告通常在复刻当周才发布，请以官方消息为准。',
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 1), 'utf8');

console.log('上一次常规复刻：', ymd(last.start), last.spiritName);
console.log('预测日期：', nextDates.map(item => `${ymd(item.date)}（${item.weekday}，${item.probability}%）`).join(' / '));
console.log('加塞概率：', `${payload.extraChance}%`);
console.log('候选 Top 5：', candidates.slice(0, 5).map(item => `${item.name}(${item.score})`).join('、'));
