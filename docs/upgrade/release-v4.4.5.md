# v4.4.5 项目收尾与正式上线记录

更新时间：2026-08-18

本页是 v4.4.5 的统一事实记录，汇总本次 AI 深度融合、移动端体验修复、发布工程整理、验证范围和正式产品上线状态。v4.4.5 已完成正式发布；本页的 Release、Pages、附件和哈希均以公开页面与成功的 Actions 结果为证，不以本地候选产物替代公开附件。

本页只用于追溯 v4.4.5；当前公开产品和最新附件请转到 [v4.4.6 发布收尾记录](./release-v4.4.6.md)。

## 版本范围

v4.4.5 在保留 schema v8、稳定 `student_id`、历史学号兼容、IndexedDB、Electron SQLite、离线 HTML、备份、迁移、交换包和手机工作包边界的基础上，完成以下工作：

### AI 深度融合

- 统一当前学生、当前事项、班级、日期范围、当前页面和选定来源的上下文构建与预览。
- 默认出站只发送脱敏数据；敏感字段按分类显示预览并逐请求授权，授权不会恢复内部 `student_id`。
- 新增 `v4_ai_suggestions`、`v4_ai_sources`、`v4_ai_consents`，并接入浏览器、离线包、Electron、备份、迁移、交换包和手机边界。
- 建议中心支持草稿、待审核、已查看、已采纳、已转任务、已转谈话、已转工作留痕和已驳回；所有转化保留 AI 用途、模型、审计编号、来源、风险和学生稳定 ID。
- 学生台账/画像、谈心谈话、工作任务、工作留痕、成绩/帮扶、心理/重点学生、资助/奖惩、就业、班团/党员、活动/住宿/请假/考勤、政策/素材/模板、竞赛/就业资源均具备统一当前页入口或记录级动作。
- AI 只创建建议或草稿，未经人工确认不改写心理、预警、纪律、资助、奖惩或学生事实。
- 失败/取消请求可在不携带密钥的范围内重试；调用审计保存用途、模型、范围、授权、来源和安全错误码，不保存 API key 或 relay token。

### 来源与 relay 安全

- 默认优先使用本地资料；公开网页只能由用户明确触发。
- 来源保留 URL、标题、抓取时间、最近核验时间、核验状态和引用片段；失效来源会进入“需要重新核验”并从新上下文排除。
- relay 限制 HTTPS、允许域名、DNS 解析、私网地址、重定向、请求/响应大小、超时、来源和可选访问令牌；错误响应经过脱敏。
- 政策和就业资源外链统一使用安全地址校验，非法值保留供编辑但不会生成可点击链接。

### 移动端和交互

- 首次欢迎设置和每日问候不再遮挡手机导航。
- 移动抽屉具备展开状态、遮罩、Escape、返回焦点和无障碍属性；折叠分组搜索仍能显示匹配项，并提供全部展开和恢复导航。
- 保留顶栏菜单、抽屉和今日/任务/学生/谈话/留痕底栏结构；建议中心、业务档案、就业意向和就业联系在窄屏下动作区可换行。
- `390×844` 与 `360×800` 已覆盖菜单、跳转、搜索、折叠、遮罩关闭、AI 状态和横向溢出检查。

### GitHub 仓库与发布工程

- 版本、桌面端版本、应用运行时和测试断言统一为 `4.4.5`。
- Release 工作流按验证后的版本动态命名附件，并从 `CHANGELOG.md` 生成发布说明。
- 测试、lint 和 Release 门禁增加公开面检查与凭据扫描。
- 增加 Dependabot、Bug/Feature Issue 表单和 Pull Request 模板，明确禁止真实学生数据、备份和密钥进入仓库。

## 已完成验证

下列命令已在 v4.4.5 发布源码上实际执行并通过；跨平台包和 Pages 另外由同一发布提交对应的 GitHub Actions 完成构建与部署：

```powershell
pnpm test
pnpm test:optimization
pnpm test:cwb-ai
pnpm lint
pnpm build:release
pnpm check:public
pnpm run check:secrets
pnpm test:release
git diff --check
```

已覆盖的风险包括：浏览器 IndexedDB/schema v8、Electron SQLite、交换包与迁移、导入和性能、AI 脱敏/授权/审计、relay/外链 SSRF 边界、移动导航、离线 HTML 和发布契约。完整 `pnpm test`、`pnpm test:cwb-ai`、`pnpm test:optimization`、`pnpm lint`、`pnpm build:release`、`pnpm check:public`、`pnpm run check:secrets`、`pnpm test:release` 和 `git diff --check` 均已通过；jsdom 的 `c.local` 加载和 `window.scrollTo` 提示来自测试夹具，不影响断言。跨平台 Windows 与 macOS 包由同一发布提交对应的 GitHub runner 完成构建与包级烟测。

## 正式上线结果

以下是已完成真实发布操作后的固定记录：

| 项目 | v4.4.5 事实 |
| --- | --- |
| 发布提交 | [`44c833d1bafbe51df844f81cbcc0d638e7e9621e`](https://github.com/7752777/counselor-desk/commit/44c833d1bafbe51df844f81cbcc0d638e7e9621e) |
| Git Tag | [`v4.4.5`](https://github.com/7752777/counselor-desk/releases/tag/v4.4.5)，已推送并作为 Latest |
| GitHub Actions | [Release workflow #25 / run `32086383154`](https://github.com/7752777/counselor-desk/actions/runs/32086383154)，成功 |
| 正式 Release | [v4.4.5](https://github.com/7752777/counselor-desk/releases/tag/v4.4.5)，公开、非 Draft、非 Pre-release |
| Pages 部署 | [#46 / run `32089792020`](https://github.com/7752777/counselor-desk/actions/runs/32089792020)，成功；[在线入口](https://7752777.github.io/counselor-desk/) 返回 200，运行时版本为 4.4.5 |
| Windows x64 | [`counselor-desk-4.4.5-x64.exe`](https://github.com/7752777/counselor-desk/releases/download/v4.4.5/counselor-desk-4.4.5-x64.exe)，SHA-256 `418FB1E96B5CDACEF63FEA368FF32B1128274A212BB21CD022F0682290DF2F14` |
| Windows ARM64 | [`counselor-desk-4.4.5-arm64.exe`](https://github.com/7752777/counselor-desk/releases/download/v4.4.5/counselor-desk-4.4.5-arm64.exe)，SHA-256 `C6E3F506CFD988C700D462347C9B55BE41CAE9790FFCCF1D413384FA9E7F919E` |
| macOS Universal DMG | [`counselor-desk-4.4.5-mac-universal.dmg`](https://github.com/7752777/counselor-desk/releases/download/v4.4.5/counselor-desk-4.4.5-mac-universal.dmg)，SHA-256 `CE7085976CB99020090B4D08ACDF40B3C20BE1FBDC33228CD25D153C68565910` |
| macOS Universal ZIP | [`counselor-desk-4.4.5-mac-universal.zip`](https://github.com/7752777/counselor-desk/releases/download/v4.4.5/counselor-desk-4.4.5-mac-universal.zip)，SHA-256 `E8E80C77ECAE7C79E78985412C7CC562F9D1B06438402FB1332E67FE9624F14` |
| 离线网页 | [`CounselorDesk-v4.4.5-Offline.html`](https://github.com/7752777/counselor-desk/releases/download/v4.4.5/CounselorDesk-v4.4.5-Offline.html)，SHA-256 `9AA871D077DEEFDC02A7A323A95AE6EA974EC07DEE25DF013B41F50F86CD5F23` |
| 校验清单 | [`Windows-SHA256.txt`](https://github.com/7752777/counselor-desk/releases/download/v4.4.5/Windows-SHA256.txt) · [`macOS-SHA256.txt`](https://github.com/7752777/counselor-desk/releases/download/v4.4.5/macOS-SHA256.txt) · [`Web-SHA256.txt`](https://github.com/7752777/counselor-desk/releases/download/v4.4.5/Web-SHA256.txt) |
| 本机构建文件 | `output/辅导员工作台.html` 仅用于开发验证；公开下载与哈希以 Release 附件及清单为准 |
| 已知限制 | 未配置代码签名；macOS 未公证；relay 需要独立受控 HTTPS 服务 |

## 密钥边界

此前在对话中出现过的外部 API key 不属于本项目配置，也没有写入源码、文档、备份、日志、测试或 Git。该密钥已经暴露，必须由账户持有人在对应服务后台撤销并轮换；新密钥只能通过本机安全存储或受控运行环境注入，不能写入仓库或发布附件。仓库扫描只能证明当前文件面没有匹配模式，不能替代服务端撤销。

## 收尾原则

正式上线已由真实 Tag、Release 附件、三份 SHA-256 清单、Windows/macOS runner 结果和 Pages 在线验收共同确认。后续维护不得移动或改写 `v4.4.5` Tag；新增能力应从该发布提交创建新分支和新版本。此前在对话中暴露过的外部 API 密钥仍需由账户持有人在服务后台撤销并轮换，代码扫描不能替代服务端操作。
