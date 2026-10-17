# 《光·遇》国服复刻先祖统计与可视化工具 — 修订版方案（v2）

> 修订要点：根据你的反馈，**“先祖名字”允许用官方之外的渠道补齐**，但“复刻是否存在 / 起止时间”仍只认官方公告。
> 另外你已确认统计口径：**常规 + 加塞 + 集体 三列并默认相加**，同时提供“常规+集体”口径切换。
> 本文档只做方案确认，确认后才开始写代码。

---

## 1. 目标

做一个能回答三个问题的工具：

1. 每位先祖在国服历史上一共复刻了几次？（常规 / 加塞 / 集体分列，可切口径）
2. 最近一次是什么时候？每一次的起止时间是什么？
3. 这条结论的官方依据是什么？（每条记录可点回官方原文与公告截图）

非目标（MVP 不做）：预测下次复刻、账号数据绑定、ICS 日历订阅、机器人推送、多语言。

---

## 2. 调研结论（已完成）

**没有可直接使用的项目。** GitHub 上与光遇复刻相关的仓库分三类，均不满足“国服历史 + 三类口径 + 官方溯源”：

| 项目 | 定位 | 维护 | 许可 | 可复用 | 不可用原因 |
|---|---|---|---|---|---|
| [mosyoyo/mo-sky-stones](https://github.com/mosyoyo/mo-sky-stones) | 国服日历 ICS（Cloudflare Pages + GitHub Actions） | 活跃（2026-10 仍在提交） | MIT | 大神接口与分页、中文日期解析、审核后台思路、ICS 导出 | 只服务“未来事件”，无历史回填、无三类口径；先祖目录来自 BWiki |
| [Silverfeelin/SkyGame-Data](https://github.com/Silverfeelin/SkyGame-Data) + [SkyGame-Planner](https://github.com/Silverfeelin/SkyGame-Planner) | 国际服数据仓 + 规划器（TypeScript） | 很活跃（每日提交） | 数据仓 MIT；Planner 为 NOASSERTION | 事件/旅行先祖数据建模；`.claude/skills/` 下 6 个现成 Skill（含 `add-traveling-spirit`） | 数据是 Live 服排期，与国服不同，一条都不能直接搬 |
| [Lvovvxe/teavel-ancestors](https://github.com/Lvovvxe/teavel-ancestors) | “光遇复刻”静态页 | 已停更（2024-01 后无提交） | 无 | 无 | 全仓 4 个文件，无数据无逻辑 |
| [3812142974/astrbot_plugin_xun_sky_tools](https://github.com/3812142974/astrbot_plugin_xun_sky_tools) | AstrBot 聊天插件 | 单次提交（2026-08） | MIT | 仅“问答播报”形态 | 依赖第三方 API，无历史、无界面 |

> 因此路线定为：**自己开发轻量静态站，只复用抓取层思路**。若以后要做日历订阅，再考虑 fork `mo-sky-stones` 补 ICS。

---

## 3. 事实源与“名字来源”策略（核心修订）

### 3.1 两级事实

| 事实 | 唯一允许的来源 | 说明 |
|---|---|---|
| 这次复刻**是否存在**、**起止时间** | 官方公告（大神 / 官网 / 官方微博 / 游戏内公告） | 必须有官方原文链接或公告标识 |
| 这次复刻对应**哪位先祖**（名字） | ① 官方公告正文 ② 官方公告图 ③ 游戏内实拍或截图 ④ 社区 Wiki / 二手整理表 | ④ 仅在前三者都缺失时使用，且必须标记来源 |

### 3.2 实测可达性（决定自动化边界）

| 源 | 实测结果 | 用途 |
|---|---|---|
| 网易大神官方号「Sky光遇」`uid=154db622a20e4327ac277bc35d4f2e76` | ✅ 公开 JSON 接口，无需登录；`maxTime` 游标可回溯（已验证取到 2021-12）；账号共 3112 条动态；单条页 `https://ds.163.com/feed/<id>/` 返回 200 | **自动化主源**：正文 + 公告图 URL + 永久链接 |
| 网易光遇官网 `sky.163.com` | ✅ 新闻/公告/活动列表可抓（116 页） | 补充佐证 |
| 官方微博 [@光遇手游](https://weibo.com/skygy) | ❌ 302 跳登录页 | 人工补录（含截图存档） |
| 游戏内新闻公告 | ❌ 无法程序化获取 | 人工补录（截图存档） |
| BWiki / B站专栏 / 新浪复刻顺序表 | ✅ 但为第三方 | **只用于补名字与交叉核对**，不产生“复刻事实” |

### 3.3 关键发现：官方公告经常不写名字

实测 2026-09-17 公告正文只写“勤劳的先祖”“先祖正在禁阁负手而立”，真名在公告图里；集体复刻更常只出现在更新内容长图中（如 `九色鹿内容公告(含集体复刻).png`）。
所以流程必须是：**抓取 → 人工看图/查证 → 打标**，且把“名字怎么确认的”写进数据。

---

## 4. 数据模型

### 4.1 `data/spirits.json`（先祖目录）

```json
{
  "version": 1,
  "spirits": [
    {
      "id": "shi-shi",
      "name": "石狮先祖",
      "aliases": ["勤劳的先祖", "白胡子先祖"],
      "season": "归属季",
      "location": "禁阁",
      "catalogSource": "ingame-screenshot",
      "catalogNote": "名字与季节目录来源：游戏内先祖星图 + 社区目录核对"
    }
  ]
}
```

> 目录（名字/季节/位置）本身不是“复刻事实”，允许来自游戏内或社区；但每个先祖标注 `catalogSource`。

### 4.2 `data/occurrences.json`（唯一事实数据）

```json
{
  "version": 1,
  "updatedAt": "2026-10-17",
  "occurrences": [
    {
      "id": "oc-2021-12-25-shi-shi",
      "spiritId": "shi-shi",
      "kind": "regular",
      "groupEventId": null,
      "start": "2021-12-25T06:00:00+08:00",
      "end": "2021-12-29T12:00:00+08:00",
      "factStatus": "confirmed",
      "nameVerification": {
        "status": "official-image",
        "evidence": [{ "type": "image", "url": "https://ok.166.net/reunionpub/..." }],
        "note": "正文未写名，公告图可辨"
      },
      "source": {
        "type": "dashen",
        "postId": "61c697453408360001d03335",
        "url": "https://ds.163.com/feed/61c697453408360001d03335/",
        "imageUrls": ["https://ok.166.net/reunionpub/..."],
        "excerpt": "……禁阁先祖的浮石……",
        "announcedAt": "2021-12-25T10:20:00+08:00",
        "deleted": false
      },
      "note": "同一活动另有预告公告 id=…"
    }
  ],
  "groupEvents": [
    {
      "id": "ge-2026-09-24",
      "name": "秋宵节·集体复刻",
      "start": "2026-09-24T06:00:00+08:00",
      "end": "2026-10-14T23:59:00+08:00",
      "spiritIds": [],
      "listStatus": "unpublished",
      "source": {
        "type": "dashen",
        "postId": "6aaf5a48d152db5c10a794e4",
        "url": "https://ds.163.com/feed/6aaf5a48d152db5c10a794e4/",
        "imageUrls": ["https://ok.166.net/reunionpub/kol_20260918_..."]
      }
    }
  ]
}
```

### 4.3 字段含义（关键）

| 字段 | 取值 | 作用 |
|---|---|---|
| `kind` | `regular` 常规 / `extra` 加塞 / `group` 集体 | 三类分列计数 |
| `factStatus` | `confirmed` / `pending` | pending = 没有官方公告支撑（如仅有二手表），**不计入统计** |
| `nameVerification.status` | `official-text` / `official-image` / `in-game` / `community` / `unresolved` | 名字来源分级 |
| `listStatus`（集体活动） | `published` / `unpublished` | 官方未列名单时保持 `unpublished`，`spiritIds` 留空 |
| `source.type` | `dashen` / `sky163` / `weibo` / `ingame` | 官方来源类型；**禁止出现国际服来源** |

### 4.4 计数规则

- `factStatus=confirmed` 且 `nameVerification.status ≠ unresolved` 的记录才进入“先祖榜”统计。
- 名字无法确认（`unresolved`）的记录进入单独的「未归属复刻」清单，全局提示“另有 N 段复刻无法归属先祖”。
- `factStatus=pending` 进入「待考证」清单，不计入任何数字。
- `listStatus=unpublished` 的集体活动不产生任何先祖计数，只在「集体复刻」页展示活动本身。

---

## 5. 采集与核验流水线

```
sync-dashen.mjs  →  classify.mjs  →  review.html（本地人工核验）  →  import-review.mjs
      │                  │                     │                          │
   raw 快照         review-queue.json      review-results.json      occurrences.json
                                                                          │
                                                     validate.mjs → build.mjs → data/app-data.js
                                                                          │
                                                              index.html（离线可开）
```

1. **sync**：按 `maxTime` 游标每页 20 条拉取，限速 300–800ms，UA 标注项目名；只保存命中复刻关键词的候选（含正文、图链、postId、发布时间），落 `data/raw/dashen-candidates.json`。
2. **classify**（可解释规则）：
   - 关键词：`旅行先祖`、`复刻`、`先祖到临`、`即将到访`、`返场`、`集体复刻`、`集体回归`；
   - 常规窗口：起于周四 06:00、止于周一 12:00 → `regular`；否则 `extra`；
   - 出现“集体/共同回归/季节先祖齐聚” → `group`，并生成 `groupEvent` 草稿（名单留空）。
3. **review.html**（关键效率工具）：本地打开，逐条显示**公告图大图 + 正文 + 解析出的时间**；下拉选先祖（含“新增”）、类型、起止、`nameVerification`；一键导出 `review-results.json`。这样“看图认名字”这件事就在一个页面里完成。
4. **import-review.mjs**：合并进 `occurrences.json`，幂等（id 冲突则更新），自动带来源字段。
5. **validate.mjs**：schema 校验、官方溯源必填、时间合法、kind 合法、重复 id、spiritId 存在、集体活动与 occurrence 双向一致；失败退出码非 0。
6. **build.mjs**：聚合统计并生成 `data/app-data.js`（内嵌数据，保证 `file://` 双击可用）。
7. **crosscheck.mjs**（可选）：贴入二手顺序表 CSV，输出“多/少/时间差异”清单，仅提示，不改数据。

---

## 6. 统计口径（已按你的确认）

- 每位先祖：**常规次数 / 加塞次数 / 集体出场次数 / 总次数**。
- **默认总次数 = 常规 + 加塞 + 集体**；页面提供口径开关，可切到「常规 + 集体」（加塞只展示不计入）。
- 同一场集体复刻内同一先祖只计 **1 次**，即使活动跨两周。
- 所有数字可下钻到明细，明细可点回官方原文。

---

## 7. 界面（5 个视图，纯静态）

1. **总览**：总段数、三类分布、覆盖区间与数据截止日、最近一次复刻、待考证 / 未归属条数、数据完整度横幅。
2. **先祖榜**：列 = 先祖 / 季节 / 常规 / 加塞 / 集体 / 总次数 / 最近复刻 / 首次复刻；搜索（含别名）、排序、按季节与类型筛选；展开行看每次记录（时间、类型、官方原文、公告图、摘录）。
3. **时间轴**：倒序按月分组，集体复刻特殊色块。
4. **集体复刻**：活动卡片；`unpublished` 卡片显著标注“官方未公布名单”。
5. **来源与口径**：口径说明、来源清单、待考证清单、CSV/JSON 导出（每条含官方链接）。

技术：`index.html` + 原生 JS 或本地化 Vue 3 + 本地化 ECharts，**零构建、双击可开、离线可用**；数据通过生成脚本内嵌。

---

## 8. 目录结构

```
E:\光遇复刻查询\
├─ PLAN.md
├─ index.html
├─ review.html
├─ assets\app.js  review.js  styles.css
├─ assets\vendor\vue.global.prod.js  echarts.min.js
├─ data\spirits.json  occurrences.json
├─ data\review-queue.json  review-results.json
├─ data\raw\dashen-candidates.json
├─ data\app-data.js            # 生成物
├─ scripts\sync-dashen.mjs  classify.mjs  import-review.mjs
├─ scripts\validate.mjs  build.mjs  crosscheck.mjs
└─ README.md                   # 口径、来源、许可、核验手册
```

---

## 9. 边界情况

| 情况 | 处理 |
|---|---|
| 正文无名、图有名 | `nameVerification=official-image`，计次 |
| 正文图都无名字 | 查游戏内截图或社区目录 → `in-game` / `community`；仍无线索 → `unresolved`，进「未归属」 |
| 同一次复刻多条公告 | 合并为一条，副公告 id 写入 note |
| 二手表有、官方没有 | `factStatus=pending`，不进统计 |
| 集体活动未列名单 | `listStatus=unpublished`，界面明示，不猜 |
| 跨年/跨周 | ISO 带 `+08:00`，禁止按当前年份推月日 |
| 加塞与常规窗口重叠 | 以“发布日期 + 是否周四 06:00 起”判定，冲突人工裁决 |
| 官方删帖 | 保留正文快照与图链，标 `deleted:true` |
| 先祖别名混乱 | `spirits.aliases` 统一匹配 |
| 国际服数据 | 硬性禁止，validate 拒绝非国服来源 |

---

## 10. 测试与验收

- `validate.mjs` 通过：每条已确认记录都有官方 `source.url` + `postId` + 起止时间。
- 随机抽 3 位先祖（1 次 / 3 次 / 5 次以上各一），逐条对得上官方公告。
- 口径开关切换后总数关系正确；未归属与待考证不计入。
- 搜索别名命中；排序、筛选、展开、CSV 导出条数一致。
- 断网双击 `index.html` 可用。
- `crosscheck` 只产出 warning，不改主数据。

---

## 11. 里程碑（估算）

| 阶段 | 内容 | 估算 |
|---|---|---|
| M0 | 目录骨架 + sync 抓取 + raw 快照 | 0.5–1 天 |
| M1 | classify + review.html + import | 1 天 |
| M2 | 最近 12 个月人工核验（约 50–60 条） | 1–2 天 |
| M3 | 5 个视图 + 统计 + 导出 | 1–1.5 天 |
| M4 | 全史回填（估 200–300 条） | 2–4 天 |
| M5 | 交叉核对 + README + （可选）GitHub Pages | 0.5 天 |

工作量重心在 M2/M4 的人工核验；代码闭环约 3 天。

---

## 12. 许可与合规

- 复用 `mo-sky-stones`（MIT）的抓取/解析思路时，README 保留其版权声明；ECharts（Apache-2.0）、Vue（MIT）保留 LICENSE。
- 不复制 SkyGame-Planner（NOASSERTION）代码。
- 页面标注“非官方粉丝工具，与网易/thatgamecompany 无关”；只读公开接口、限速、不绕过登录；公告图仅外链不转存。

---

## 13. 仍待你点头的 3 项（括号为默认建议）

1. **MVP 数据范围**：先上“最近 12 个月 + 历史候选可见（标注待考证）”（推荐），还是一次性回填全史再交付？
2. **交付形态**：纯静态、双击打开、可离线（推荐）；还是需要 GitHub Pages 在线地址？
3. **是否引入 OCR 辅助认图**：MVP 不做、纯人工看图（推荐）；还是先做 OCR 再人工复核？

---

## 附录：已核实的硬事实（用于开工时对齐）

- 大神官方号：昵称「Sky光遇」，认证「光·遇手游官方」，`uid=154db622a20e4327ac277bc35d4f2e76`，粉丝 1,270,615，动态 3112 条。
- 列表接口：`https://inf.ds.163.com/v1/web/feed/basic/getSomeOneFeeds?someOneUid=<uid>&feedTypes=1,2,3,4,6,7,10,11&maxTime=<ms>&minTime=0`，返回 `result.nextRangeParam.maxTime` 作下一页游标；详情接口 `.../feed/basic/facade?feedId=<id>`。
- 单条永久链接：`https://ds.163.com/feed/<feedId>/`（实测 200）。
- 已验证可回溯到 2021-12 的公告（`maxTime=1640995200000` 返回 2021-12-31 前后内容）。
- 官方微博 `weibo.com/skygy` 302 到 `passport.weibo.com`，不可自动抓取。
- 常规复刻窗口参考：周四 06:00 → 下周一 12:00（来自多条公告原文）。
