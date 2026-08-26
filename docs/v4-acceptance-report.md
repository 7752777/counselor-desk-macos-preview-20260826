# v4 发布验收记录

> 本页保留各版本发布证据。当前维护版本为 v4.8.5，GitHub 仓库已改为私有；v4.8.3、v4.8.2、v4.8.1、v4.8.0 及更早版本仍作为历史 Release 保留，不要把历史表格或开发目录构建当作当前下载附件。v4.8.5 的实际附件和哈希以[发布收尾记录](./upgrade/release-v4.8.5.md)为准。

v4.5.0 的开发收尾、专项验证和上线结果记录在[发布收尾记录](./upgrade/release-v4.5.0.md)；v4.4.6 及更早版本的历史发布证据仍记录在对应[历史发布收尾记录](./upgrade/release-v4.4.6.md)；本页以下表格保留历史发布事实。

v4.7.0 的实现、正式发布证据和附件校验值见[发布收尾记录](./upgrade/release-v4.7.0.md)；v4.6.0 的历史发布证据见[对应收尾记录](./upgrade/release-v4.6.0.md)。

历史发布版本：`v4.7.0`。正式提交、历史 Release、Actions、Pages 和附件哈希已回填到[发布收尾记录](./upgrade/release-v4.7.0.md)；仓库私有化后的当前可见性以 GitHub 实际权限为准。

当前开发目录可能包含公开 v4.7.0 之后的 UI 收口候选。它们不属于下方“v4.7.0 正式事实”，没有新的 Tag、Release、Pages 或附件哈希；逐项实现、局部测试和未完成限制见[UI 收口与历史需求查漏补缺审计](./upgrade/ui-redesign-closeout-audit-2026-08-19.md)。

所有版本、老师反馈、AI 收口和当前候选的总状态见[全量开发计划对账](./upgrade/full-plan-reconciliation-2026-08-19.md)。

## v4.9.0 候选验收事实

v4.9.0 是当前工作区商业授权候选，不是正式 Release。已落地许可证 Ed25519 校验、四档权益、Electron `safeStorage` 专用状态文件、AI 业务层守卫、更新清单哈希/签名契约和独立授权服务本地契约测试；生产私钥、KMS、支付 webhook、更新 CDN、Windows 签名、macOS 公证和真实购买/换机流程仍待外部部署验收。v4.8.5 Tag、Release 和历史资产不移动。

## v4.8.5 当前正式事实

v4.8.5 是 v4.8.4 候选的兼容维护正式发布，保持 `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1`、既有导入/备份格式和稳定 `student_id` 关联不变。本次修复发布门禁的异步保存竞态，继承单文件离线包网页图标内联、`file://` 全导航 smoke、真实本地 HTTPS/WebDAV 备份传输用例，并把完整 v4.8 与 AI 定向套件纳入主 `pnpm test`；不新增迁移、不改变 AI 或附件安全边界。

| 项目 | v4.8.5 已验证事实 |
| --- | --- |
| 正式版本 | `package.json`、Electron 包和页面 `APP_VERSION` 均为 `4.8.5` |
| Tag / Release | [`v4.8.5`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.5)，正式资产和校验清单以该 Release 为准 |
| 兼容性 | 不新增迁移，不删除旧数据，不移动 `v4.8.3` 及更早 Tag/Release；v4.8.3 数据可直接读取 |
| 发布证据 | Tag commit `c04732900ee257f8bae02ad25cc1559dd2643bb8`；Actions [#32578966917](https://github.com/7752777/counselor-desk/actions/runs/32578966917) 的 Tests、Windows、macOS、Web 和 Draft Release 全部成功；Release 已发布 |
| 受影响验证 | `file://` 单文件包 232 次路由渲染 x 4 视口；HTTP 路由 58 个主路由 x 5 视口；本地 HTTPS/WebDAV 上传、下载、删除和 404 恢复；完整 v4.8/AI 套件纳入主门禁 |
| 资产 | Windows x64/ARM64、macOS Universal DMG/ZIP、Offline HTML 和三份 SHA-256 清单，具体大小与摘要见[发布收尾记录](./upgrade/release-v4.8.5.md) |

## v4.8.3 历史正式事实

v4.8.3 是 v4.8.2 的兼容维护发布，保持 `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1`、既有导入/备份格式和稳定 `student_id` 关联不变。本次收口学生台账记录级 AI 操作的宿主位置、移动端学生分页和资料列表窄屏操作布局；不新增迁移、不改变 AI 或附件安全边界。

| 项目 | v4.8.3 已验证事实 |
| --- | --- |
| 正式版本 | `package.json`、Electron 包和页面 `APP_VERSION` 均为 `4.8.3` |
| Tag / Release | [`v4.8.3`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.3)，正式资产和校验清单以该 Release 为准 |
| 兼容性 | 不新增迁移，不删除旧数据，不移动 `v4.8.2`/`v4.8.1`/`v4.8.0` Tag/Release；v4.8.2 数据可直接读取 |
| 发布证据 | Tag commit `e59bd5cc3799bdf03f798e0f56dc316f323b835c`；Actions [#32573727811](https://github.com/7752777/counselor-desk/actions/runs/32573727811) 全部 job 成功；Release 已发布 |
| 局部验证 | 学生分页、v4.7 视觉契约、真实 Chromium 学生台账/资料列表和最终发布门禁通过 |
| 资产 | Windows x64/ARM64、macOS Universal DMG/ZIP、Offline HTML 和三份 SHA-256 清单，具体大小与摘要见[发布收尾记录](./upgrade/release-v4.8.3.md) |

## v4.8.2 历史正式事实

v4.8.2 是 v4.8.1 之后的可靠性维护发布，保持 `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1`、既有导入/备份格式和稳定 `student_id` 关联不变。本次收口局域网客户端异步持久化失败回滚、业务仓储写入失败回退和批量记录先校验后替换，避免界面提前显示成功或坏数据清空已有记录。

| 项目 | v4.8.2 已验证事实 |
| --- | --- |
| 正式版本 | `package.json`、Electron 包和页面 `APP_VERSION` 均为 `4.8.2` |
| Tag / Release | [`v4.8.2`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.2)，正式资产和校验清单以该 Release 为准 |
| 兼容性 | 不新增迁移，不删除旧数据，不移动 `v4.8.1`/`v4.8.0` Tag/Release；v4.8.1 数据可直接读取 |
| 局部验证 | `pnpm test:sync-persistence`、`pnpm test:sync-resilience`、`node tests/v48-services.js`、`node tests/v48-storage-hardening.js` 和最终发布门禁通过 |

## v4.8.1 历史正式事实

v4.8.1 是 v4.8.0 之后的维护发布，保持 `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1` 和既有导入/备份格式不变。本次只修复两个用户可见的安全理解与恢复操作问题：证书图片授权弹窗明确说明会发送给模型；恢复包导出/导入统一要求至少 12 位口令，导出二次确认、处理中禁用，失败保留重试路径。

| 项目 | v4.8.1 已验证事实 |
| --- | --- |
| 正式版本 | `package.json`、Electron 包和页面 `APP_VERSION` 均为 `4.8.1` |
| Tag / Release | [`v4.8.1`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.1)，正式资产和校验清单以该 Release 为准 |
| 兼容性 | 不新增迁移，不删除旧数据，不移动 `v4.8.0` Tag/Release；v4.8.0 数据可直接读取 |
| 局部验证 | `pnpm test:v48`、`pnpm test:desktop`、`pnpm test:cwb-ai`、证书识别、管理 UI、移动导航、备份状态和桌面配置测试均通过 |
| 视口验收 | `1440x920`、`1280x800`、`1024x768`、`390x844`、`360x800` 无横向溢出；桌面三栏、移动抽屉、卡片模式和恢复页可操作 |
| 平台边界 | Windows/macOS 包未签名，macOS 未公证；真实手机、WebDAV、长期同步和数据库级加密仍按限制维护 |

## v4.8.0 历史正式事实

v4.8.0 已正式发布，交付了 Electron 密钥/仓储诊断、恢复口令核心、可选择安装目录、局域网主机与客户端同步、冲突收件箱、加密附件分块传输、v11 迁移、学生稳定 ID 优先导入和桌面备份定时检查。代码冻结、正式 Tag、Release 附件和门禁证据以[发布收尾记录](./upgrade/release-v4.8.0.md)为准。

手机真实证书信任/自动发现、完整恢复向导实机回滚、新集合全量跨端恢复、真实 WebDAV 互操作、Windows/macOS 实机迁移和最终用户设备适配仍是发布后维护抽查，不应被自动化夹具证据扩大解释。不得用工作区构建或 `output/v4-preview.html` 替代正式 Release 下载；逐项范围见[客户反馈逐项审计](./upgrade/customer-feedback-audit-2026-08-21.md)。

| 项目 | v4.8.0 已验证事实 |
| --- | --- |
| 正式代码冻结 | Tag `v4.8.0` 指向 `63c429df5f877ab5a91476f18b8dc468c3edcbc6`；文档回填提交为 `b64aa0e` |
| Release | [v4.8.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.8.0)，非 Draft、非 prerelease，包含 Windows、macOS、离线 HTML 和 SHA-256 清单 |
| 数据格式 | 工作区协议 `schema_version: 8`；业务 `data_schema_version: 11`；同步协议 `sync_protocol_version: 1` |
| 平台限制 | Windows/macOS 包未签名；macOS 未公证；局域网首期只支持同一网络 |

## v4.7.0 正式事实

| 项目 | 记录 |
| --- | --- |
| 工作区版本 | `4.7.0`，历史正式发布；当前工作区另有未提交候选 |
| 发布提交 | [`e01c5b75`](https://github.com/7752777/counselor-desk/commit/e01c5b75a9adcd1e7c882c91a667008b382ce9b4) |
| Release / Actions / Pages | [Release v4.7.0](https://github.com/7752777/counselor-desk/releases/tag/v4.7.0)；发布门禁 [#32211212549](https://github.com/7752777/counselor-desk/actions/runs/32211212549)，Pages [#32212075408](https://github.com/7752777/counselor-desk/actions/runs/32212075408) |
| 当前下载 | 从 [v4.7.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.7.0) 下载，并核对随附的 Web、Windows 和 macOS SHA-256 清单 |
| 在线入口 | 历史 Pages 部署曾返回 HTTP 200；仓库改为私有后原入口当前 HTTP 404 |
| 数据格式 | 业务 `data_schema_version: 10`；工作区协议 `schema_version: 8`，兼容 v8/v9 恢复 |
| 平台限制 | Windows/macOS 未签名；macOS 未公证 |

v4.7.0 的查课、点名、查寝、量化考评、工具箱、就业防骗、竞赛资源、学业分析、通知双栏、三栏工作区和跨端恢复均已随正式 Release 交付。AI 仍只生成建议、草稿或待审核内容，不自动修改学生事实或高风险业务结论。

## v4.6.0 正式事实

| 项目 | 记录 |
| --- | --- |
| 工作区版本 | `4.6.0`，正式公开 |
| 发布提交 | [`3db26ec`](https://github.com/7752777/counselor-desk/commit/3db26ec52d40e1779ee15e52a1578c4cba1cbc30) |
| Release / Actions / Pages | [Release v4.6.0](https://github.com/7752777/counselor-desk/releases/tag/v4.6.0)；发布门禁 [#32185919304](https://github.com/7752777/counselor-desk/actions/runs/32185919304)，Pages [#32188118210](https://github.com/7752777/counselor-desk/actions/runs/32188118210) |
| 当前下载 | 从 [v4.6.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.6.0) 下载，并核对随附的三份 SHA-256 清单 |
| 在线入口 | [GitHub Pages](https://7752777.github.io/counselor-desk/)；HTTP 200，页面包含运行时版本 `4.6.0` |
| 平台限制 | Windows/macOS 未签名；macOS 未公证 |

## v4.5.0 正式事实

| 项目 | 记录 |
| --- | --- |
| 工作区版本 | `4.5.0`，正式公开 |
| 发布提交 | [`1b773b3dfaa19745541df9e504f6de160c48a75a`](https://github.com/7752777/counselor-desk/commit/1b773b3dfaa19745541df9e504f6de160c48a75a) |
| Release / Actions / Pages | [Release v4.5.0](https://github.com/7752777/counselor-desk/releases/tag/v4.5.0)；发布门禁 [#32160336549](https://github.com/7752777/counselor-desk/actions/runs/32160336549)，Pages [#32161681464](https://github.com/7752777/counselor-desk/actions/runs/32161681464) |
| 当前下载 | 从 [v4.5.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.5.0) 下载，并核对随附的三份 SHA-256 清单 |
| 在线入口 | [GitHub Pages](https://7752777.github.io/counselor-desk/)；HTTP 200，页面包含运行时版本 `4.5.0` |

本页记录已经发生并可复查的发布事实。它不是功能愿望清单，也不以“源码里有”代替可见、可下载、可恢复的产品能力。

## v4.4.6 历史发布身份

v4.4.6 的真实发布事实见[历史发布收尾记录](./upgrade/release-v4.4.6.md)。以下历史表格继续保留用于完整追溯。

## v4.4.0 历史发布身份

| 项目 | 已验证事实 |
| --- | --- |
| 正式版本 | `v4.4.0`，发布于 2026-08-14 |
| 发布提交 | [`ed362d73a1c95bded26bdfba811a10eb73b5b2a2`](https://github.com/7752777/counselor-desk/commit/ed362d73a1c95bded26bdfba811a10eb73b5b2a2) |
| Tag / Release | [v4.4.0](https://github.com/7752777/counselor-desk/releases/tag/v4.4.0) |
| 在线体验 | [GitHub Pages](https://7752777.github.io/counselor-desk/) |
| 数据格式 | schema v8 |
| 发布顺序 | Tests → Windows → macOS → Web artifact → Draft Release → Pages |

## v4.7.0 交付物与下载

当前下载请只从有权限访问的历史 [v4.7.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.7.0) 获取附件，并核对 [Windows-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.7.0/Windows-SHA256.txt)、[macOS-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.7.0/macOS-SHA256.txt) 和 [Web-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.7.0/Web-SHA256.txt)。本页的 v4.6.0、v4.5.0、v4.4.0 和 v4.4.6 表格只用于历史追溯，不是当前下载清单。

| 平台 | Release 附件 | 适用说明 |
| --- | --- | --- |
| 离线网页 | [`CounselorDesk-v4.7.0-Offline.html`](https://github.com/7752777/counselor-desk/releases/download/v4.7.0/CounselorDesk-v4.7.0-Offline.html) | 单文件打开；便携数据空间与普通网页隔离 |
| Windows x64 | `counselor-desk-4.7.0-x64.exe` | Intel/AMD Windows 设备 |
| Windows ARM64 | `counselor-desk-4.7.0-arm64.exe` | Windows on ARM 设备 |
| macOS Universal | `counselor-desk-4.7.0-mac-universal.dmg` / `.zip` | Intel 与 Apple Silicon；未签名、未公证 |

附件大小和 SHA-256 以 [v4.7.0 发布收尾记录](./upgrade/release-v4.7.0.md)及 Release 随附清单为准。

## v4.7.0 发布门禁

| 门禁 | 结果 | 可复查证据 |
| --- | --- | --- |
| 完整主测试链、lint、公开面、密钥扫描和发布契约 | 通过 | [发布 Actions #32211212549](https://github.com/7752777/counselor-desk/actions/runs/32211212549) 的 Tests job |
| Windows x64 / ARM64 | 通过 | 同一 Run 的 Windows jobs：安装器、架构、包级烟测和 Windows-SHA256 |
| macOS Universal | 通过 | 同一 Run 的 macOS job：DMG/ZIP、双架构、包级烟测和 macOS-SHA256 |
| 离线 HTML | 通过 | 同一 Run 的 Web job：构建、公开面检查和 Web-SHA256 |
| Release | 通过 | [v4.7.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.7.0)，历史上公开、非 Draft、非 Pre-release；仓库现已私有 |
| Pages | 历史通过 | [Pages Actions #32212075408](https://github.com/7752777/counselor-desk/actions/runs/32212075408) 历史成功，历史入口曾 HTTP 200；仓库私有后原入口当前 HTTP 404 |

## v4.7.0 可见能力核对

- 首页以今日工作摘要、待办、到期事项和待确认草稿为首屏入口；桌面端使用固定左导航、中央主区和可折叠右侧上下文区，窄屏退化为抽屉、单列和底部快捷操作。
- 查课看板、课堂随机点名、宿舍查寝与异常处理、量化考评、工具箱、就业防骗、竞赛资源和学业分析已进入正式页面；点名随机源可复核，查寝事实与异常处理分离。
- 通知 AI 使用原文/结果双栏，支持老师主动输入、编辑、复制、保存草稿以及转任务/工作留痕；谈话、查课、查寝、家长联系和任务完成可生成待确认工作记录草稿。
- 业务 `data_schema_version: 10` 的新增集合与 IndexedDB、离线 HTML、Electron、备份恢复和手机交换包共用集合清单；学生业务关系继续以 `student_id` 为主，附件记录只保存附件 ID。
- 学生台账的表格、卡片和照片模式在网页、离线 HTML 和 Electron 中保持一致；桌面与移动视口覆盖 `1440×920`、`1280×800`、`1024×768`、`390×844` 和 `360×800`。

## v4.5.0 发布门禁

| 门禁 | 结果 | 可复查证据 |
| --- | --- | --- |
| 完整主测试链、lint、公开面、密钥扫描和发布契约 | 通过 | [发布 Actions #32160336549](https://github.com/7752777/counselor-desk/actions/runs/32160336549) 的 Tests job |
| Windows x64 / ARM64 | 通过 | 同一 Run 的 Windows job：NSIS 构建、PE 架构、安装器和包级烟测、Windows-SHA256 |
| macOS Universal | 通过 | 同一 Run 的 macOS job：DMG/ZIP、双架构、挂载和包级烟测、macOS-SHA256 |
| 离线 HTML | 通过 | 同一 Run 的 Offline web job：构建和 Web-SHA256；公开下载后 SHA-256 与 Release digest 一致 |
| Release | 通过 | [v4.5.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.5.0)，公开、非 Draft、非 Pre-release |
| Pages | 通过 | [Pages Actions #32161681464](https://github.com/7752777/counselor-desk/actions/runs/32161681464)；在线入口 HTTP 200，运行时 `4.5.0` |

## v4.4.6 发布门禁

| 门禁 | 结果 | 可复查证据 |
| --- | --- | --- |
| 完整主测试链、lint、公开面和密钥扫描 | 通过 | [发布 Actions #32133893252](https://github.com/7752777/counselor-desk/actions/runs/32133893252) 的 Tests job |
| Windows x64 / ARM64 | 通过 | 同一运行中的 Windows job：NSIS 构建、架构、打包冒烟和 SHA-256 清单 |
| macOS Universal | 通过 | 同一运行中的 macOS job：DMG/ZIP、双架构、挂载和打包冒烟 |
| 离线 HTML | 通过 | 同一运行中的 Offline web package job：构建和 Web-SHA256 清单 |
| Release | 通过 | [v4.4.6 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.4.6)，公开、非 Draft、非 Pre-release |
| Pages | 通过 | [Pages Actions #32135312775](https://github.com/7752777/counselor-desk/actions/runs/32135312775)；在线入口 HTTP 200 |

## v4.4.0 历史交付物

| 使用方式 | Release 附件 | 适用说明 |
| --- | --- | --- |
| 网页端 | GitHub Pages | 适合先体验界面和演示流程；请勿在公共电脑保存真实学生资料。 |
| 离线网页 | `CounselorDesk-v4.4.0-Offline.html` | 单文件打开，便携模式与常规网页数据空间隔离。 |
| Windows x64 | `counselor-desk-4.4.0-x64.exe` | 面向主流 Intel / AMD Windows 设备的 NSIS 安装包。 |
| Windows ARM64 | `counselor-desk-4.4.0-arm64.exe` | 面向 Windows on ARM 设备的 NSIS 安装包。 |
| macOS Universal | `counselor-desk-4.4.0-mac-universal.dmg` / `.zip` | 同时包含 Intel 与 Apple Silicon 架构。当前为**未签名、未公证**构建。 |

## v4.4.0 历史发布门禁

| 门禁 | 结果 | 可复查证据 |
| --- | --- | --- |
| 完整主测试链 | 通过 | [GitHub Actions #31768117637](https://github.com/7752777/counselor-desk/actions/runs/31768117637) 的 Tests job |
| Windows 构建与安装器 | 通过 | 同一运行中的 Windows NSIS x64 / ARM64 job：构建、安装、重装、SQLite、附件、备份、退出保存和卸载路径检查均完成。 |
| macOS Universal | 通过 | 同一运行中的 macOS job：双架构检查、DMG 挂载、应用启动、SQLite、附件、备份恢复和退出保存烟测均完成。 |
| 网页与离线产物 | 通过 | 同一运行中的 Web artifact job：构建、公开面扫描、资源和 SHA-256 检查完成。 |
| Pages 部署 | 通过 | [GitHub Actions #31768796087](https://github.com/7752777/counselor-desk/actions/runs/31768796087) |

这些是 CI 目标平台上的真实构建与烟测结论，不等同于在每一台最终使用者设备上完成了校园网络、安全软件和本校策略适配。首次使用仍建议先用脱敏数据验证。

## v4.4.0 历史可见能力核对

- 学生台账支持 `10 / 20 / 50 / 100` 分页、组合筛选、状态记忆、固定选择/操作列、顶部与底部横向滚动、当前页与筛选结果全选、批量编辑、批量删除和一次撤销。
- 党员发展、班团组织、成绩与学业帮扶、奖惩、活动、住宿、工作留痕均有独立入口；学生档案可汇聚谈话、危机、成绩、住宿、党团和组织任职等时间线。
- schema v8 工作区提供写入队列、保存状态、版本历史、恢复点、诊断、迁移、便携隔离、附件完整性保护与交换包失败回滚。
- 欢迎页提供双栏教育场景、五套主题、按本地时间显示的问候、每日一次控制和无外链来源的中文教育短句。
- 八张 `2560 × 1440` 独立截图使用虚构演示数据，覆盖今日概览、分页批量、复杂导入、学生时间线、党员发展、谈话危机、成绩帮扶和备份迁移。

## 已知边界与使用建议

1. 本项目默认本地优先，不替代学校正式业务系统、专业心理评估、应急处置或党团审批。敏感事项必须遵守所在学校制度。
2. “本地保存”不等于无需管理安全。请使用受控设备、系统账户和学校允许的备份介质；公开交流只使用虚构或脱敏数据。
3. macOS 产物尚未签名或公证。请只从项目 Release 获取文件，先验证 SHA-256，再遵照本校软件管理要求安装。
4. 升级前先导出备份；若升级后发现数据、附件或显示异常，停止继续写入，保留原目录和备份后再排查。

## 复现与追溯

开发者可按 [开发与构建](./development.md) 复现主测试、网页构建和桌面打包。公开页面的文档、截图和下载内容只描述本表列出的已验证版本；后续版本会建立新的 Tag、Release、CI 记录和验收页，不覆盖本次发布事实。
