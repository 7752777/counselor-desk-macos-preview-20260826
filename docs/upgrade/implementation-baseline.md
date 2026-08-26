# v4.4.6 升级实现基线（历史）

> 本页固定记录 v4.4.6 的实现与发布证据，不代表当前代码基线。当前公开基线已是 v4.7.0；老师反馈、日常协同和参考工作台批次的迁移边界与验收范围见[当前基线](./current-baseline.md)、[v4.6.0 审计](./next-optimization-audit-2026-08-19.md)和[参考工作台审计](./reference-product-feature-and-ui-audit-2026-08-19.md)。

完整开发收尾、验证与正式发布证据见[发布收尾记录](./release-v4.4.6.md)；v4.4.5 的历史基础能力见[历史发布收尾记录](./release-v4.4.5.md)。

## v4.4.6 本轮新增

- 统一 AI 上下文、敏感字段逐请求授权、建议中心、来源生命周期和记录级转化，所有结果保留审计、来源、风险和稳定 `student_id`。
- 业务页面接入当前学生/事项/周期上下文；AI 只产生建议或草稿，不自动写入心理、预警、纪律、资助、奖惩和学生事实。
- 增加 AI relay 的来源、HTTPS、SSRF、超时、响应大小、错误脱敏和可选令牌边界；公开 Pages 仍需独立受控 HTTPS relay。
- 修复移动端欢迎弹窗遮挡导航、抽屉焦点、折叠搜索和窄屏业务动作区问题。
- 新增动态版本发布工作流、凭据扫描、CHANGELOG 发布说明、Dependabot、Issue 表单和 PR 模板。

## 本轮已落地

- 保持 `schema_version: 8`、稳定记录 ID、历史学号兼容、IndexedDB / Electron SQLite 双仓储和附件仓储不变。
- 新增 `src/core/cwb-business.js`，承载综合测评、学期学业汇总、处分档案、困难认定与资助四类记录的规范化和学生画像聚合。
- 新增“业务档案”入口。四类记录均以学号选择和关联，支持新增、编辑、删除、CSV 导出；处分档案支持附件仓储归档。
- 学生档案时间线和画像摘要展示新增综测、学业、处分、资助、就业意向和就业联系统计。
- 工作留痕页面支持将当前统计区间直接带入 AI 草稿；AI 工作台新增通知改写和预警辅助分析确认入口。AI 输出仍是草稿或建议，不自动修改预警、心理、处分和资助结论。
- AI 摘要上下文已纳入学业、资助和就业记录，沿用默认脱敏与调用审计策略。
- 首页新增领导统计视图：只提供数值汇总，可保存、切换、编辑、删除视图并导出当前 CSV，不展示学生身份或业务明细。

## 仓储与迁移

新增自定义集合：

- `custom.v4_assessments`
- `custom.v4_academic_terms`
- `custom.v4_disciplines`
- `custom.v4_aid_records`

这些集合已加入浏览器仓储、Electron 白名单、v8 逻辑路径、备份/交换包和手动换机包清单。浏览器 IndexedDB schema 已从 v4 升到 v5，以便已有本地库自动创建新 object stores。旧集合不会被改写，未知旧字段也不会在迁移中丢弃。

## Electron 体积基线

本机 Windows x64、Electron 38.8.6 的一次实测：

| 指标 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 解包应用 | 348.8 MB | 304.2 MB |
| 安装包 | 未测 | 91.1 MB |
| `resources/app.asar` | 9.1 MB | 9.1 MB |

优化只排除了 `desktop` 内不参与运行的旧说明、锁文件、旧打包配置和安装脚本，并限制 Electron 语言包为 `zh-CN` / `en-US`。SQLite、附件、备份、Excel、Argon2、JSZip、ECharts 和桌面 IPC 资源均保留。

## 验证记录

- 核心：`cwb-business`、`cwb-ai-governance`、`cwb-employment`
- 集成：导航、v8 迁移、Electron surface、Electron package config、v40 UI / runtime / integration layout
- 桌面：Electron 启动冒烟、已打包应用双次持久化冒烟，均覆盖 SQLite、附件、迁移和备份
- 浏览器：业务档案、AI、工作留痕入口及 390px 视口无横向溢出
- v4.4.6 已由新 Tag 对应的 Windows runner 重新打包并公开；x64 / ARM64 文件名、体积和 SHA-256 以 [v4.4.6 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.4.6) 及 [Windows-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.4.6/Windows-SHA256.txt) 为准。

此前本机单条 `pnpm test` 曾受命令上限影响；本版本最终由 [Release Actions #32133893252](https://github.com/7752777/counselor-desk/actions/runs/32133893252) 在 Ubuntu runner 完整执行并通过，不能用早期本机超时记录否定本次 CI 门禁。

## v4.4.6 正式发布证据

- 发布提交：[`f32d32a67325cc0177ccdc977e43709bb4391a35`](https://github.com/7752777/counselor-desk/commit/f32d32a67325cc0177ccdc977e43709bb4391a35)。
- Release：[`v4.4.6`](https://github.com/7752777/counselor-desk/releases/tag/v4.4.6) 已公开，包含离线 HTML、Windows x64 / ARM64、macOS Universal DMG / ZIP 和三份 SHA-256 清单。
- Pages：[部署 Actions #32135312775](https://github.com/7752777/counselor-desk/actions/runs/32135312775) 成功；[在线入口](https://7752777.github.io/counselor-desk/) 返回 HTTP 200。
- 平台限制：Windows/macOS 包未配置代码签名，macOS 未公证；AI relay 仍需由使用者部署受控 HTTPS 服务。

## 开发目录整理

- 唯一开发目录：`F:\CounselorDesk\counselor-desk-development`
- 归档目录：`F:\CounselorDesk\_archive-non-development-20260817`
- 最终开发目录是独立 Git 克隆，已完整带入当前源码、未跟踪新增模块、测试、文档、依赖和验证产物，不依赖外部 `public-docs-update` 或旧 linked worktree。
- 归档目录只保留历史基线、参考图片、用户测试包、用户数据和过程产物；不得从归档内容继续派生新功能。
