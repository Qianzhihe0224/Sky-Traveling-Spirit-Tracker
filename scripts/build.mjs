// 校验数据并生成前端可直接加载的 data/app-data.js
// 用法：node scripts/build.mjs [--check-only]
import fs from 'node:fs';

const checkOnly = process.argv.includes('--check-only');
const data = JSON.parse(fs.readFileSync('data/occurrences.json', 'utf8'));

const errors = [];
const warnings = [];

const isISODateTime = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(String(value));

const ids = new Set();
for (const occ of data.occurrences) {
  if (!isISODateTime(occ.start) || !isISODateTime(occ.end)) {
    errors.push(`时间格式错误：${occ.id} ${occ.start} ~ ${occ.end}`);
  }
  if (Date.parse(occ.end) <= Date.parse(occ.start)) {
    errors.push(`结束时间不晚于开始时间：${occ.id}`);
  }
  if (!occ.source?.url || !/^https:\/\/ds\.163\.com\/feed\//.test(occ.source.url)) {
    errors.push(`缺少官方公告链接：${occ.id}`);
  }
  if (ids.has(occ.id)) errors.push(`重复 id：${occ.id}`);
  ids.add(occ.id);
  if (occ.kind === 'group' && !occ.groupEventId) {
    errors.push(`集体记录缺少 groupEventId：${occ.id}`);
  }
  if (occ.kind !== 'group' && !occ.spiritName && occ.nameVerification?.status !== 'unresolved') {
    warnings.push(`未归属先祖但未标记 unresolved：${occ.id}`);
  }
}

for (const group of data.groupEvents) {
  if (!isISODateTime(group.start) || !isISODateTime(group.end)) {
    errors.push(`集体活动时间格式错误：${group.id}`);
  }
  if (!group.listStatus) errors.push(`集体活动缺少 listStatus：${group.id}`);
  if (group.spiritNames.length === 0 && group.listStatus !== 'unpublished') {
    warnings.push(`集体活动名单为空：${group.id}`);
  }
}

for (const spirit of data.spirits) {
  if (spirit.total !== spirit.regular + spirit.extra + spirit.group) {
    errors.push(`统计不一致：${spirit.name}`);
  }
  const list = data.occurrences.filter(occ => occ.spiritName === spirit.name);
  const regular = list.filter(occ => occ.kind === 'regular').length;
  const extra = list.filter(occ => occ.kind === 'extra').length;
  const group = data.groupEvents.filter(event => event.spiritNames.includes(spirit.name)).length;
  if (regular !== spirit.regular || extra !== spirit.extra || group !== spirit.group) {
    errors.push(`明细与汇总不一致：${spirit.name}`);
  }
}

// 每条集体活动的成员必须在先祖目录里出现
for (const group of data.groupEvents) {
  for (const name of group.spiritNames) {
    if (!data.spirits.some(spirit => spirit.name === name)) {
      warnings.push(`集体活动成员未进入先祖榜：${name}（${group.id}）`);
    }
  }
}

// 复刻事实必须来自官方：source.type 只允许这四个
const allowedSourceTypes = new Set(['dashen', 'sky163', 'weibo', 'ingame']);
for (const occ of data.occurrences) {
  if (!allowedSourceTypes.has(occ.source.type)) {
    errors.push(`非官方来源：${occ.id} (${occ.source.type})`);
  }
}

const payload = {
  meta: data.meta,
  spirits: data.spirits,
  occurrences: data.occurrences,
  groupEvents: data.groupEvents,
  pending: data.pending,
  unmatched: data.unmatched,
};

const stats = {
  occurrences: data.occurrences.length,
  regular: data.occurrences.filter(item => item.kind === 'regular').length,
  extra: data.occurrences.filter(item => item.kind === 'extra').length,
  group: data.occurrences.filter(item => item.kind === 'group').length,
  groups: data.groupEvents.length,
  spirits: data.spirits.length,
  pending: data.pending.length,
  unmatched: data.unmatched.length,
};

const banner = `// 由 scripts/build.mjs 自动生成，请勿手改。数据源文件：data/occurrences.json\n`;
const js = `${banner}window.__SKY_DATA__ = ${JSON.stringify(payload)};\n`;

if (!checkOnly) {
  fs.writeFileSync('data/app-data.js', js, 'utf8');
}

console.log('数据统计：', stats);
console.log('校验错误：', errors.length, errors.slice(0, 10));
console.log('警告：', warnings.length, warnings.slice(0, 10));
if (errors.length) {
  console.error('构建失败：存在校验错误');
  process.exit(1);
}
if (!checkOnly) {
  console.log(`已生成 data/app-data.js（${(js.length / 1024).toFixed(0)} KB）`);
}
