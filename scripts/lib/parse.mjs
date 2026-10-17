// 从公告文本中解析复刻时间窗口与线索
import {
  beijingParts,
  bjDayStartMs,
  bjISO,
  weeklyWindowFromAnnouncement,
} from './dates.mjs';

const CN_WEEKDAY = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

// 本周/下周 + 星期 + 时刻
function relativeWeekdayWindow(text, announcedAt) {
  const re =
    /(本周|下周)([日天一二三四五六])(?:早上|上午|中午|下午|晚上)?\s*(\d{1,2})[:：](\d{2})/g;
  const found = [];
  for (const m of text.matchAll(re)) {
    found.push({
      which: m[1],
      weekday: CN_WEEKDAY[m[2]],
      hour: Number(m[3]),
      minute: Number(m[4]),
    });
  }
  if (found.length < 2) return null;
  const startInfo = found[0];
  const endInfo = found[found.length - 1];
  const p = beijingParts(Date.parse(announcedAt));
  const dayStart = bjDayStartMs(p.year, p.month, p.day);
  // 以公告日所在周（周一为起点）为基准
  const mondayOffset = (p.weekday + 6) % 7;
  const mondayMs = dayStart - mondayOffset * 86400000;

  const resolve = info => {
    const whichWeek = info.which === '下周' ? 1 : 0;
    const offset = (info.weekday + 6) % 7;
    return (
      mondayMs +
      (whichWeek * 7 + offset) * 86400000 +
      info.hour * 3600000 +
      info.minute * 60000
    );
  };

  let startMs = resolve(startInfo);
  let endMs = resolve(endInfo);
  // 周日晚间发布"本周二"，指的是即将到来的周二（跨周边界）
  if (startMs < Date.parse(announcedAt) - 2 * 86400000) {
    startMs += 7 * 86400000;
    endMs += 7 * 86400000;
  }
  if (endMs <= startMs) endMs += 7 * 86400000;
  const s = beijingParts(startMs);
  const e = beijingParts(endMs);
  return {
    start: bjISO(s.year, s.month, s.day, s.hour, s.minute),
    end: bjISO(e.year, e.month, e.day, e.hour, e.minute),
    source: 'relative-weekday',
  };
}

// "本周六至下周三中午12:00" —— 只写星期、部分带时刻
function weekdayOnlyRange(text, announcedAt) {
  const m = text.match(/本周([日天一二三四五六])[^。！\n]{0,8}?(?:至|到)[^。！\n]{0,4}?下?周([日天一二三四五六])/);
  if (!m) return null;
  const p = beijingParts(Date.parse(announcedAt));
  const dayStart = bjDayStartMs(p.year, p.month, p.day);
  const mondayOffset = (p.weekday + 6) % 7;
  const mondayMs = dayStart - mondayOffset * 86400000;
  const startMs = mondayMs + ((CN_WEEKDAY[m[1]] + 6) % 7) * 86400000 + 6 * 3600000;
  const endMs = mondayMs + (7 + ((CN_WEEKDAY[m[2]] + 6) % 7)) * 86400000 + 12 * 3600000;
  const s = beijingParts(startMs);
  const e = beijingParts(endMs);
  return {
    start: bjISO(s.year, s.month, s.day, s.hour, s.minute),
    end: bjISO(e.year, e.month, e.day, e.hour, e.minute),
    source: 'weekday-only',
  };
}

function resolveYear(month, announcedMonth, announcedYear) {
  if (month < announcedMonth - 6) return announcedYear + 1;
  return announcedYear;
}

// X月X日 ~ X月X日（可跨年）
function explicitRange(text, announcedAt) {
  const a = beijingParts(Date.parse(announcedAt));
  const full = text.match(
    /(\d{1,2})月(\d{1,2})日[^。！\n]{0,8}?[~～至到]\s*(\d{1,2})月(\d{1,2})日/,
  );
  if (full) {
    const sm = Number(full[1]);
    const sd = Number(full[2]);
    const em = Number(full[3]);
    const ed = Number(full[4]);
    const sy = resolveYear(sm, a.month, a.year);
    const ey = resolveYear(em, a.month, a.year) + (em < sm ? 1 : 0);
    return {
      start: bjISO(sy, sm, sd, 6, 0),
      end: bjISO(ey, em, ed, 23, 59),
      source: 'explicit-range',
    };
  }
  const sameMonth = text.match(/(\d{1,2})月(\d{1,2})日[^。！\n]{0,6}?[~～至到]\s*(\d{1,2})日/);
  if (sameMonth) {
    const m = Number(sameMonth[1]);
    const sd = Number(sameMonth[2]);
    const ed = Number(sameMonth[3]);
    const y = resolveYear(m, a.month, a.year);
    return {
      start: bjISO(y, m, sd, 6, 0),
      end: bjISO(y, m, ed, 23, 59),
      source: 'explicit-range',
    };
  }
  return null;
}

export function parseWindow(post) {
  const text = `${post.title}\n${post.text}\n${post.longText}`;
  const announcedAt = post.announcedAt;
  if (!announcedAt) return null;

  const relative = relativeWeekdayWindow(text, announcedAt);
  if (relative) return relative;

  const weekdayOnly = weekdayOnlyRange(text, announcedAt);
  if (weekdayOnly) return weekdayOnly;

  const bare = bareWeekdayWindow(text, announcedAt);
  if (bare) return bare;

  const explicit = explicitRange(text, announcedAt);
  if (explicit) return explicit;

  // "勤劳的先祖将在今日清晨6:00…" —— 当天开始，按 4 天半的常规档期收尾
  if (/今天|今日/.test(text) && /先祖/.test(text)) {
    const p = beijingParts(Date.parse(announcedAt));
    const startMs = bjDayStartMs(p.year, p.month, p.day) + 6 * 3600000;
    const endMs = startMs + 4 * 86400000 + 6 * 3600000;
    const s = beijingParts(startMs);
    const e = beijingParts(endMs);
    return {
      start: bjISO(s.year, s.month, s.day, s.hour, s.minute),
      end: bjISO(e.year, e.month, e.day, e.hour, e.minute),
      source: 'today',
    };
  }

  // 只有"本周四早上6:00"起始、没有结束时间 → 用标准周窗口补全
  if (/本周[四日天一二三四五六][^。！\n]{0,10}?(\d{1,2})[:：](\d{2})/.test(text)) {
    const win = weeklyWindowFromAnnouncement(announcedAt);
    if (win) return { ...win, source: 'weekly-default' };
  }
  return null;
}

// "记得在周二早上6:00至周六中午12:00" —— 不带"本周/下周"的写法
function bareWeekdayWindow(text, announcedAt) {
  const re = /(?:周|星期)([日天一二三四五六])(?:早上|上午|中午|下午|晚上)?\s*(\d{1,2})[:：](\d{2})/g;
  const found = [];
  for (const m of text.matchAll(re)) {
    found.push({ weekday: CN_WEEKDAY[m[1]], hour: Number(m[2]), minute: Number(m[3]) });
  }
  if (found.length < 2) return null;
  const segment = text.slice(found[0].index ?? 0);
  if (!/至|到|~|～/.test(segment.slice(0, 80))) return null;

  const p = beijingParts(Date.parse(announcedAt));
  const dayStart = bjDayStartMs(p.year, p.month, p.day);
  const mondayOffset = (p.weekday + 6) % 7;
  const mondayMs = dayStart - mondayOffset * 86400000;
  const resolve = info =>
    mondayMs + ((info.weekday + 6) % 7) * 86400000 + info.hour * 3600000 + info.minute * 60000;

  const startMsRaw = resolve(found[0]);
  let endMs = resolve(found[found.length - 1]);
  let startMs = startMsRaw;
  // 周日晚上发布"周二早上6:00"时，指的是两天后的周二
  if (startMs < Date.parse(announcedAt) - 2 * 86400000) {
    startMs += 7 * 86400000;
    endMs += 7 * 86400000;
  }
  if (endMs <= startMs) endMs += 7 * 86400000;
  const s = beijingParts(startMs);
  const e = beijingParts(endMs);
  return {
    start: bjISO(s.year, s.month, s.day, s.hour, s.minute),
    end: bjISO(e.year, e.month, e.day, e.hour, e.minute),
    source: 'bare-weekday',
  };
}

export function isGroupAnnouncement(title = '', text = '') {
  const all = `${title}\n${text}`;
  return (
    /集体(复刻|回归)/.test(all) ||
    /(季|季节)先祖(再相逢|到临|回归|齐聚|一同|集结)/.test(all) ||
    /先祖(们)?(集结|齐聚|一同|共同)(回归|再临|重逢)/.test(all) ||
    /旅行先祖集结回归/.test(all) ||
    /多位先祖/.test(all)
  );
}

// 从"XX季先祖"里提取赛季名，例如"九色鹿季先祖再相逢"
export function extractGroupName(title = '', text = '') {
  const all = `${title}\n${text}`;
  const m = all.match(/《光·遇》?([\u4e00-\u9fa5]{2,8}季)先祖/);
  if (m) return `${m[1]}集体复刻`;
  if (/旅行先祖集结回归/.test(all)) return '旅行先祖集结回归';
  if (/集体复刻|集体回归/.test(all)) return '集体复刻';
  return null;
}

// 抽取"物品/外观"线索行（预告公告第 3 行常是外观描述）
export function extractItemHints(post) {
  const lines = `${post.title}\n${post.text}`
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#'));
  const hints = [];
  for (const line of lines.slice(0, 8)) {
    if (/[，,、]/.test(line) && line.length <= 20) hints.push(line);
    else if (/(斗篷|面具|发型|裤子|头饰|耳饰|背饰|乐器|动作|站姿|帽子|墨镜|草帽)/.test(line) && line.length <= 24) {
      hints.push(line);
    }
  }
  return [...new Set(hints)].slice(0, 3);
}

export function extractLocationHint(post) {
  const m = (post.text || '').match(/先祖(?:正)?在([\u4e00-\u9fa5]{2,8})(?:噤声|负手|享受|等待|等候|出现|伫立|眺望|徘徊|歇息|而坐|静坐|坐|站|等)/);
  if (m) return m[1];
  const m2 = (post.text || '').match(/他(?:会|将)出现在([\u4e00-\u9fa5、，\s]{2,30})/);
  if (m2) return m2[1].replace(/[、，\s]+/g, ' ').trim();
  return null;
}

// 判断这条动态属于"预告 / 到临 / 离开 / 其他"
export function postKind(post) {
  const all = `${post.title}\n${post.text}`;
  if (/即将到临|即将来临|即将到访/.test(all)) return 'preview';
  if (/到临提醒|已正式抵达|今天.*重返|重返天空王国/.test(all)) return 'arrival';
  if (/即将离开|已离开/.test(all)) return 'farewell';
  return 'other';
}
