// 无浏览器环境下的冒烟测试：用最小 DOM 桩执行 assets/app.js，检查五个视图与详情抽屉
// 用法：node scripts/smoke.mjs
import fs from 'node:fs';
import vm from 'node:vm';

const dataJs = fs.readFileSync('data/app-data.js', 'utf8');
const appJs = fs.readFileSync('assets/app.js', 'utf8');

class ClassList {
  constructor() { this.set = new Set(); }
  add(...names) { names.forEach(name => this.set.add(name)); }
  remove(...names) { names.forEach(name => this.set.delete(name)); }
  contains(name) { return this.set.has(name); }
  toggle(name, force) {
    const next = force == null ? !this.set.has(name) : Boolean(force);
    if (next) this.set.add(name); else this.set.delete(name);
    return next;
  }
}

function makeElement(id) {
  return {
    id,
    innerHTML: '',
    value: '',
    style: {},
    classList: new ClassList(),
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    addEventListener() {},
    closest() { return null; },
    click() {},
    appendChild() {},
    removeChild() {},
  };
}

function run(hash) {
  const view = makeElement('view');
  const mask = makeElement('mask');
  const drawer = makeElement('drawer');
  const tabs = ['overview', 'spirits', 'predict', 'timeline', 'groups', 'about'].map(route => {
    const el = makeElement('tab-' + route);
    el.attributes.href = '#/' + route;
    return el;
  });
  const handlers = { click: [], input: [], change: [], keydown: [] };

  const document = {
    getElementById(id) {
      if (id === 'view') return view;
      if (id === 'mask') return mask;
      if (id === 'drawer') return drawer;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.tabs a') return tabs;
      return [];
    },
    addEventListener(type, handler) {
      if (handlers[type]) handlers[type].push(handler);
    },
    createElement() { return makeElement('created'); },
    body: { style: {}, appendChild() {}, removeChild() {} },
    documentElement: {},
  };

  const sandbox = {
    window: { __SKY_DATA__: null, addEventListener() {}, scrollTo() {}, document, location: { hash } },
    document,
    location: { hash },
    Blob: class {},
    URL: { createObjectURL() { return 'blob:'; }, revokeObjectURL() {} },
    Intl,
    setTimeout,
    console,
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(dataJs, sandbox, { filename: 'data/app-data.js' });
  vm.runInContext(appJs, sandbox, { filename: 'assets/app.js' });

  const click = target => {
    for (const handler of handlers.click) handler({ target });
  };

  return { view, drawer, mask, tabs, click };
}

const expectations = {
  overview: ['已核验复刻段数', '复刻次数 Top 12', '最近复刻', '数据更新于', '最近一次复刻：', '进行中'],
  spirits: ['先祖榜', '总次数', '口径说明', '静光学者', '智慧长者', 'dd-panel', '全部季节'],
  predict: ['下一次常规复刻预测', '日期预测', '候选先祖', '预测方法'],
  timeline: ['时间轴', '2026 年', '2025 年'],
  groups: ['集体复刻', '九色鹿季集体复刻', '采药人', '名单来源：社区 Wiki'],
  about: ['来源与口径', '待考证', '免责声明', 'BWiki'],
};

let failed = 0;
for (const [route, markers] of Object.entries(expectations)) {
  try {
    const { view, tabs } = run('#/' + route);
    const html = view.innerHTML || '';
    if (html.length < 500) throw new Error(`渲染内容过短（${html.length} 字节）`);
    for (const marker of markers) {
      if (!html.includes(marker)) throw new Error(`缺少关键文案：${marker}`);
    }
    const active = tabs.filter(tab => tab.classList.contains('active'));
    if (active.length !== 1) throw new Error(`导航高亮异常（${active.length} 个）`);
    console.log(`✓ ${route} 渲染正常（${html.length} 字节）`);
  } catch (err) {
    failed += 1;
    console.error(`✗ ${route} 失败：${err.message}`);
  }
}

// 详情抽屉：模拟点击某位先祖
try {
  const { drawer, click, mask } = run('#/spirits');
  click({ closest: selector => (selector === '[data-open-spirit]' ? { getAttribute: () => '静光学者' } : null) });
  const html = drawer.innerHTML || '';
  for (const marker of ['静光学者', '单次复刻', '官方原文']) {
    if (!html.includes(marker)) throw new Error(`抽屉缺少：${marker}`);
  }
  if (!mask.classList.contains('show')) throw new Error('抽屉遮罩未显示');
  console.log(`✓ 详情抽屉正常（${html.length} 字节）`);
} catch (err) {
  failed += 1;
  console.error(`✗ 详情抽屉失败：${err.message}`);
}

if (failed) {
  console.error(`冒烟测试失败 ${failed} 项`);
  process.exit(1);
}
console.log('冒烟测试全部通过');
