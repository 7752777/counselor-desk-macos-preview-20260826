# v4.7.0 发布收尾记录

状态：历史正式发布；当前 GitHub 仓库已私有

更新时间：2026-08-19

## 发布事实

| 项目 | 结果 |
| --- | --- |
| 历史发布版本 | `v4.7.0`，非 Draft、非 Pre-release；当前 Release 位于私有仓库 |
| 合并提交 | [`e01c5b75a9adcd1e7c882c91a667008b382ce9b4`](https://github.com/7752777/counselor-desk/commit/e01c5b75a9adcd1e7c882c91a667008b382ce9b4) |
| Tag | [`v4.7.0`](https://github.com/7752777/counselor-desk/releases/tag/v4.7.0)，指向上述合并提交；历史 `v4.6.0` 及更早 Tag 未移动 |
| GitHub Release | [`v4.7.0 Release`](https://github.com/7752777/counselor-desk/releases/tag/v4.7.0) |
| 发布工作流 | [Actions #32211212549](https://github.com/7752777/counselor-desk/actions/runs/32211212549)，Tests、Windows、macOS、Web、Draft Release 全部成功 |
| Pages | [Actions #32212075408](https://github.com/7752777/counselor-desk/actions/runs/32212075408) 是历史成功记录；仓库转私有后原在线入口当前 HTTP 404 |
| 历史资源验收 | 历史 Pages 资源包含 `APP_VERSION = '4.7.0'`、v10 迁移脚本和 v4.7 UI 运行时；当前不把 Pages 视为可用分发入口 |

首次 Tag workflow 的平台构建均成功，但 Draft Release 曾因 CHANGELOG 候选标题未被旧提取规则识别而失败（[Actions #32209921808](https://github.com/7752777/counselor-desk/actions/runs/32209921808)）。PR #27 修复候选/正式标题兼容后，未移动 `v4.7.0` Tag，通过 workflow_dispatch #32211212549 完成同一 Tag 的全流程发布。

## 本版本内容

- 桌面端固定左导航、中央主工作区和可折叠右侧上下文区；`1024-1279px` 提供打开入口，`<=900px` 退化为抽屉、单列和底部快捷操作。
- 查课看板、课堂随机点名、宿舍查寝与异常处理、量化考评、工具箱、就业防骗、竞赛资源和学业分析。
- 通知 AI 原文/结果双栏，支持主动粘贴或导入文本、重点和截止时间草稿、复制/编辑及转任务/留痕草稿。
- 业务 `data_schema_version: 10`，新增十个集合；工作区协议 `schema_version: 8`、稳定 `student_id`、附件仓和 v8/v9 恢复兼容保持不变。
- 统一统计条、筛选条、表格、状态标签、空状态、右侧上下文和 reduced-motion 规则，网页、离线 HTML、Electron 和 Pages 共用运行时边界。

## 数据迁移与跨端

v9 到 v10 只创建缺失集合和 UI 元数据，不删除旧集合、不改写已有业务记录。迁移入口为 [`src/core/v10-migration.js`](../../src/core/v10-migration.js)；集合清单由 [`src/core/cwb-collections.js`](../../src/core/cwb-collections.js) 维护。浏览器 IndexedDB、单文件离线 HTML、Electron SQLite、备份恢复和手机交换包均从同一清单派生。

升级前仍须建立恢复点。升级后至少抽查学生、查课、点名、查寝、量化积分、竞赛附件、备份恢复和手机交换包。附件业务记录只保存附件 ID，二进制继续进入对应附件仓；学生关系优先使用稳定 `student_id`，旧学号只作为兼容快照。

## 最终验证

本地最终门禁均通过：

```text
pnpm test                 PASS
pnpm lint                 PASS
pnpm build:release       PASS
pnpm check:public        PASS
pnpm check:secrets       PASS (262 repository files inspected)
pnpm test:release        PASS
git diff --check         PASS
```

定向验证包括 `pnpm test:v47`、v10 manifest/迁移、IndexedDB、Electron、备份恢复、交换包、点名种子复核、查寝异常、量化排名、外链校验、通知转化、三栏折叠和学生卡片模式。完整 `pnpm test` 在本地通过；远程最终发布 Tests job 同样通过。

真实浏览器验收覆盖 `1440x920`、`1280x800`、`1024x768`、`390x844` 和 `360x800`：桌面三栏、中等桌面上下文面板、手机抽屉/底栏、九个 v4.7 页面、学生卡片模式、无横向溢出和页面运行时错误均已检查。

5,000 名学生导入、10,000 条记录处理、附件容量/回滚、备份恢复和跨端集合恢复使用脱敏或合成夹具完成分项验证；这不等同于在每所学校设备上进行长期真实数据压力测试。

## Release 附件与 SHA-256

以下数值来自公开 Release 的实际附件和其随附清单；Windows/macOS 构建未签名，macOS 未公证。

| 文件 | 大小（bytes） | SHA-256 |
| --- | ---: | --- |
| [`CounselorDesk-v4.7.0-Offline.html`](https://github.com/7752777/counselor-desk/releases/download/v4.7.0/CounselorDesk-v4.7.0-Offline.html) | 13,525,540 | `b38f6dc445bbfda54ce0a574140e8fa0477f68ac8638345e7a2b9f0c2a351b26` |
| `counselor-desk-4.7.0-x64.exe` | 91,234,177 | `012F82C33617A229FF1AA7EF9DE2AF0586CBE4462D70E46E3C7223793F1FF80D` |
| `counselor-desk-4.7.0-arm64.exe` | 85,667,490 | `FC82141241E575D923701745D49C77CB70D75C057AE8E9F8620CD9C2F1D850ED` |
| `counselor-desk-4.7.0-mac-universal.dmg` | 195,425,295 | `5dfc523cd1039ad0c117078f6fd03284cb71f99120e04ed38cc748215ddaf1f7` |
| `counselor-desk-4.7.0-mac-universal.zip` | 194,843,431 | `5476fea790acddedb08ebe7a8dd4bc49f19c4c3865b660f2363c579617382a70` |
| [`Web-SHA256.txt`](https://github.com/7752777/counselor-desk/releases/download/v4.7.0/Web-SHA256.txt) | 97 | 以清单内容为准 |
| [`Windows-SHA256.txt`](https://github.com/7752777/counselor-desk/releases/download/v4.7.0/Windows-SHA256.txt) | 194 | 以清单内容为准 |
| [`macOS-SHA256.txt`](https://github.com/7752777/counselor-desk/releases/download/v4.7.0/macOS-SHA256.txt) | 240 | 以清单内容为准 |

## 安全边界与已知限制

- 本地随机源决定点名，AI 不参与随机数；AI 结果只创建建议、草稿或待审核内容，不自动改变住宿、积分等级、奖惩、心理、纪律、资助、预警、科研审批或学生事实。
- 敏感字段默认脱敏，字段授权只对当前请求生效；API key、relay 令牌和完整通知原文不进入普通备份或日志。
- 重点学生锁仍是“仅防误看，不是加密”；正式使用必须结合系统账户、磁盘加密、受控设备和受控备份。
- Pages 适合体验和脱敏数据，不适合保存真实学生敏感资料；静态部署使用 AI 时仍需要受控 HTTPS relay。
- Windows/macOS 包未签名，macOS 未公证，安装时可能出现系统安全提示；是否允许安装应遵守学校软件管理制度。
- 浏览器端 PDF 依赖系统打印；外部来源、就业风险和业务规则仍需要辅导员按学校制度人工核验。

后续维护必须建立新的版本 Tag、Release、Actions 和 Pages 证据，不覆盖 `v4.7.0` 及历史版本。

## 2026-08-19 工作区候选说明（不属于本 Release）

历史 `v4.7.0` 发布后，当前工作区继续保留一批未发布的视觉和 AI 收口修改：新版首页工作台、统一 `.v47-page-view` 页面包裹、统一排版/卡片/统计/筛选样式、学生台账第一层筛选布局、窄屏顶部栏压缩和移动焦点样式，以及 AI 来源链元数据、通知本地来源、证书/总结确认审计和无学生谈话转化拦截。首页候选已进一步移除重复的旧 today/KPI 区块，将趋势、职责、学生结构和热力图改为默认收起的数据概览，并增加四项紧凑维护状态。这些修改没有进入本 Release 的提交、附件、哈希或 Pages。

2026-08-19 候选的局部验证记录曾包括 `pnpm test:v47`、`pnpm test:optimization`、`pnpm test:cwb-ai`、`pnpm lint`、`pnpm build:release`、`pnpm check:public`、`pnpm check:secrets` 和 `pnpm test:release`；但 2026-08-20 又修改了 AI 出站和来源边界，因此这些旧结果不能替代本轮最终门禁。最新定向结果和新增回归见[2026-08-20 AI 全面收口审计](./ai-comprehensive-audit-2026-08-20.md)。内置浏览器当前没有可用的整页截图命令，因此 DOM/ARIA/尺寸复核不能写成截图验收。若要公开这批 UI/AI 修改，必须在新提交上重新生成离线/桌面构建、哈希、Release 和受控网页分发证据，并使用新的版本号；不得移动或覆盖 `v4.7.0`。当前候选仍未提交、未推送、未创建新 Tag/Release。

完整需求对照、未完成事项和长期限制见[UI 收口与历史需求查漏补缺审计](./ui-redesign-closeout-audit-2026-08-19.md)。

## 2026-08-20 候选 AI 收口不属于本 Release

历史 `v4.7.0` 不包含当前工作区新增的模型输出二次脱敏、`v4_ai_audit.output_redacted`、`CWB.ai.health()` 和 `tests/ai-output-health.js`。这些修改已在当前候选的 AI 定向门禁中通过，但尚未提交、推送、生成新产物或创建新 Release；不能使用历史 v4.7.0 附件作为本候选的发布证明。
