# Sky-Children-of-the-Light-Returning-Spirit-Lookup-Tool

**《光·遇》国服复刻先祖统计与可视化**

一个纯静态、可离线打开的统计页面：把《光·遇》国服历史上的**常规复刻 / 加塞复刻 / 集体复刻**分开计数，记录每次复刻的起止时间，并且每条记录都能点回**官方公告原文**。

- 打开方式：直接双击 `index.html`（数据已内嵌，无需联网、无需安装、无需构建）。
- 数据规模（更新于 2026-10-17，覆盖到 2026-10-19 的复刻）：188 段复刻记录（常规 125 / 加塞 54 / 集体 9 场）、86 位有复刻记录的先祖、24 条待考证。
- 非官方粉丝工具，与网易 / thatgamecompany 无关。

---

## 1. 口径（重要）

| 概念 | 定义 |
|---|---|
| 复刻事实 | 是否存在、开始/结束时间，**只认官方公告**（网易大神官方认证账号「Sky光遇」为主，官网 / 官方微博 / 游戏内公告为辅）。每条记录都保留官方原文链接。 |
| 常规复刻 | 按常规档期（周四 06:00 → 周一 12:00 左右）开启的单次复刻。 |
| 加塞复刻 | 与上一条常规复刻开档间隔 ≤ 9 天的额外复刻，常见于春节、五一、国庆等假期加场。官方公告不会自称“加塞”，因此这是**按档期推断**，明细里标注“推断”。 |
| 集体复刻 | 多先祖同时回归的限时活动，单独计数。**同一活动内同一位先祖只计 1 次出场**，不折算成常规复刻。 |
| 总次数 | 默认 = 常规 + 加塞 + 集体；页面可切换成“常规 + 集体”（加塞只展示、不计入）。 |
| 名字来源 | 官方公告正文 > 官方公告图 > 游戏内实拍 > 社区 Wiki。官方未写名时用社区 Wiki 补名，并在明细中标注。 |
| 不猜名单 | 官方只说“某季先祖集体回归”而未列名时，名单标注为“社区整理”，绝不编造。 |

> 官方公告经常只写“勤劳的先祖”“先祖正在禁阁负手而立”，真名在公告图里；集体复刻更是常只在更新长图里出现。因此“复刻事实”和“先祖名字”用两条不同的证据链：前者必须官方，后者允许社区补齐并标注。

---

## 2. 页面

- **总览**：总量、分类分布、Top 12、最近复刻、数据缺口提示。
- **先祖榜**：搜索（先祖 / 季节 / 地图）、按季节筛选、切换统计口径、列排序；点任意一行看每次复刻的明细与官方链接。
- **时间轴**：按年份倒序，可按常规 / 加塞 / 集体过滤。
- **集体复刻**：每场活动的区间、出场先祖、名单来源。
- **来源与口径**：完整口径说明、来源清单、待考证清单、未归属清单、CSV / JSON 导出。

---

## 3. 数据来源

| 来源 | 角色 | 说明 |
|---|---|---|
| 网易大神「Sky光遇」官方认证账号 | **复刻事实（主源）** | 公开 JSON 接口 + 永久链接 `https://ds.163.com/feed/<postId>/`；已归档 2020-08 至今 2850 条动态，可回溯分页 |
| 《光·遇》国服官网 | 补充佐证 | `https://sky.163.com/news/` |
| 官方微博 @光遇手游 | 补充佐证 | 登录墙，无法自动抓取，仅人工补录 |
| 游戏内新闻公告 | 补充佐证 | 无法程序化获取，仅人工补录 |
| [BWiki 旅行先祖回归记录](https://wiki.biligame.com/sky/旅行先祖回归记录) | **补名字 / 交叉核对** | 社区 Wiki，提供先祖名、季节、地图、累计常规次数；不作为复刻事实依据 |
| [多特游戏复刻汇总](https://www.duotegame.com/zt/gy/fkxz/) | 补名字 / “加塞”标注核对 | 社区营销站，仅辅助 |

二手整理表（B 站专栏、新浪、各类“复刻顺序表”）只用于核对，不进主数据。

---

## 4. 更新数据

需要 Node.js 18+（无需安装任何依赖）：

```bash
node scripts/sync-dashen.mjs      # 抓取官方账号全部公开动态（增量，落在 data/raw/dashen.json）
node scripts/fetch-wiki.mjs       # 抓取 BWiki 原始 wikitext（补名字，落在 data/raw/wiki-records.json）
node scripts/classify.mjs         # 识别复刻候选，生成 data/review-queue.json 与核验页数据
node scripts/import-data.mjs      # 官方事实 × 社区名字合并 → data/occurrences.json / spirits.json
node scripts/build.mjs            # 校验 + 生成 data/app-data.js（页面读取）
node scripts/smoke.mjs            # 无浏览器冒烟测试（五个视图 + 详情抽屉）
```

- 只想核对某条：打开 `review.html`，逐条看图核验、填写名字与类型、导出 JSON。
- `npm run build` 等价于 `build.mjs + smoke.mjs`；`npm run all` 跑完整条流水线。

---

## 4.5 部署到 GitHub Pages（自动更新）

仓库里的 [`.github/workflows/update.yml`](.github/workflows/update.yml) 会：

1. 每天北京时间 **13:00**（也可手动触发）抓取官方公告与 BWiki 记录；
2. 重新分类、合并、校验、生成页面数据；
3. 把数据变更提交回仓库；
4. 把 `index.html + assets + data/app-data.js` 发布到 GitHub Pages。

### 一次性设置

1. 在 GitHub 新建一个仓库（免费账号的 Pages 需要**公开**仓库）。
2. 本目录已经 `git init` 并完成首次提交，补上远端后直接推送：

   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

3. 仓库 **Settings → Pages → Build and deployment**，Source 选 **GitHub Actions**。
4. 打开 **Actions** 页签 → `Update data & deploy` → **Run workflow**。
5. 等部署完成，访问 `https://<你的用户名>.github.io/<仓库名>/`。

说明：

- 不需要配置任何 Secret，工作流用内置的 `GITHUB_TOKEN`（已在 workflow 里声明 `contents/pages/id-token` 权限）。
- BWiki 偶尔会限流，该步骤设为 `continue-on-error`：失败时名字沿用上次快照，官方公告照常更新。
- 定时任务由 GitHub 调度，可能有几分钟到十几分钟延迟；想立刻更新就手动 Run workflow。
- 公开仓库的定时任务若连续 60 天没有仓库活动会被 GitHub 暂停，手动 Run 一次即可恢复（本项目每次运行都会提交数据，一般不会触发）。
- 页面是 hash 路由（`#/spirits`），不需要 404 兜底；`_site` 里已放 `.nojekyll`。

### 已知数据缺口

- **2024-08 ~ 2024-11**：官方账号当期没有发布复刻公告（10 条社区记录无官方佐证）→ 进入“待考证”，不计入统计。
- **2020 上半年（3~7 月）**：官方账号可归档范围从 2020-08 开始（更早动态接口不可达）→ 13 条社区记录待考证。
- **2 条官方复刻名字未确认**：2020-11-05、2024-05-09（官方未写名，社区无对应条目）。
- 加塞判定为档期推断，不是官方标签；如需严格口径，可在页面切到“常规 + 集体”。

---

## 5. 目录结构

```
index.html                  主页面（双击打开）
review.html                 本地人工核验页
assets/app.js               页面逻辑（原生 JS，无依赖）
assets/styles.css           样式
data/occurrences.json       唯一事实数据（人工可编辑，进版本库）
data/spirits.json           先祖统计聚合
data/app-data.js            由 build.mjs 生成，供 index.html 内嵌读取
data/review-queue.json      分类器产出的候选
data/review-data.js         同上，供 review.html 通过 file:// 读取
data/raw/dashen.json        官方动态快照
data/raw/wiki-records.json  BWiki 记录快照
scripts/                    sync / classify / import / build / smoke / fetch-wiki
```

### 一条记录长什么样

```json
{
  "id": "oc-2026-10-15-静光学者",
  "spiritName": "静光学者",
  "kind": "regular",
  "start": "2026-10-15T06:00:00+08:00",
  "end": "2026-10-19T12:00:00+08:00",
  "factStatus": "confirmed",
  "nameVerification": { "status": "community", "evidence": [{ "type": "wiki", "url": "..." }] },
  "source": {
    "type": "dashen",
    "postId": "6ad04fc33bc7803bf9a9daac",
    "url": "https://ds.163.com/feed/6ad04fc33bc7803bf9a9daac/",
    "imageUrls": ["..."],
    "announcedAt": "2026-10-15T04:00:00.000Z"
  }
}
```

### 校验规则（`scripts/build.mjs`）

- 每条记录的起止必须是带 `+08:00` 的 ISO 时间，且结束晚于开始；
- 每条记录必须有 `ds.163.com/feed/` 官方链接；
- `kind` 只允许 regular / extra / group；`source.type` 只允许 dashen / sky163 / weibo / ingame；
- 先祖汇总必须与明细逐项一致（常规、加塞、集体）；
- 任意错误都会让构建失败（退出码非 0）。

---

## 6. 许可与免责

- 本项目代码可自由修改使用；公告与游戏内容版权归原权利方所有。
- 抓取仅访问公开页面，带限速与 UA 标识，不绕过登录、不存储账号数据；公告图片只保留外链。
- 非官方、非营利粉丝工具，与网易、thatgamecompany 无关。若权利方要求，会立即停止相关抓取或下架页面。
