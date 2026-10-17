// 北京时间的日期工具：全部以 +08:00 为准，不依赖运行环境时区
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

export function msToISO(ms) {
  return new Date(Number(ms)).toISOString();
}

// 把毫秒时间戳转成北京时间的各字段
export function beijingParts(ms) {
  const d = new Date(Number(ms) + TZ_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(), // 0=周日
  };
}

// 由北京时间字段生成带 +08:00 的 ISO 字符串
export function bjISO(year, month, day, hour = 0, minute = 0) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(year, 4)}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:00+08:00`;
}

// 北京时间某天 00:00 对应的毫秒（用于加减天数）
export function bjDayStartMs(year, month, day) {
  return Date.UTC(year, month - 1, day) - TZ_OFFSET_MS;
}

export function addDaysMs(ms, days) {
  return ms + days * 86400000;
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function weekdayCN(iso) {
  const p = beijingParts(Date.parse(iso));
  return WEEKDAY_CN[p.weekday];
}

export function isValidISODateTime(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

// 从公告发布时刻推算"本周四 06:00 → 下周一 12:00"的候选窗口
export function weeklyWindowFromAnnouncement(announcedAt) {
  const announcedMs = Date.parse(announcedAt);
  const p = beijingParts(announcedMs);
  const dayStart = bjDayStartMs(p.year, p.month, p.day);
  // 周四 06:00 之后发布的公告（周四 06 点后 ~ 周日）属于本周期；周一至周三（或周四 06 点前）属于下个周期
  const daysSinceThursday = (p.weekday - 4 + 7) % 7;
  let startDayMs = dayStart - daysSinceThursday * 86400000;
  if (p.weekday < 4 || (p.weekday === 4 && p.hour < 6)) {
    startDayMs += 7 * 86400000;
  }
  const startMs = startDayMs + 6 * 3600000;
  const endMs = startMs + 4 * 86400000 + 6 * 3600000; // 周四06:00 -> 周一12:00
  const s = beijingParts(startMs);
  const e = beijingParts(endMs);
  return {
    start: bjISO(s.year, s.month, s.day, s.hour, s.minute),
    end: bjISO(e.year, e.month, e.day, e.hour, e.minute),
  };
}
