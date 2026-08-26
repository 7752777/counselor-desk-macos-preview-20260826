# v4.8.3 发布收尾记录

> 状态：已正式发布。本文记录本次维护范围、本地与 CI 验证、正式 Tag、GitHub Actions、Release 资产和 SHA-256 证据。

本文记录 v4.8.3 对 v4.8.2 的兼容维护。历史 `v4.8.2`、`v4.8.1`、`v4.8.0` 及更早版本的 Tag、Release 和资产不移动、不覆盖。

## 版本边界

| 项目 | v4.8.3 事实 |
| --- | --- |
| 版本号 | `package.json`、`desktop/package.json` 和页面 `APP_VERSION` 均为 `4.8.3` |
| 分支 | `codex/ai-upgrade` |
| Tag | [`v4.8.3`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.3)，指向 `e59bd5cc3799bdf03f798e0f56dc316f323b835c` |
| GitHub Release | [`辅导员工作台 v4.8.3`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.3)，已发布且非 Draft/Prerelease；仓库为私有，下载需要仓库权限 |
| 数据协议 | `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1`，无新增迁移 |
| 交付物 | Windows x64/ARM64 NSIS、macOS Universal DMG/ZIP、离线 HTML 和 SHA-256 清单 |
| 历史版本 | `v4.8.2`、`v4.8.1`、`v4.8.0` 及更早 Tag/Release 不移动、不覆盖 |

## 本次实际修复

1. **学生台账 AI 操作归位。** 记录级 AI 动作宿主识别学生表格的固定 `.student-action-col`，AI 学生摘要不会再被追加到最右侧；操作列使用稳定宽度并允许长文案换行，桌面端的档案、谈话、删除和 AI 操作保持同一区域。
2. **移动端学生分页可用。** 分页控制允许在窄屏换行/滚动，下一页按钮保持在视口内，不因卡片宽度或筛选控件挤压而被裁切。
3. **移动端资料列表收口。** 资料与平台的列表模式在 `700px` 以下退化为单列，上传、编辑、删除和 AI 操作按钮允许换行，避免操作跑到屏幕外。
4. **跨端体验保持一致。** 修复只涉及页面行为和样式，不改变学生 `student_id`、业务事实、附件 ID、备份、同步和 AI 授权边界。

## 数据与兼容性

- 不新增集合、不改变迁移、不删除字段；v4.8.2 工作区可以直接读取。
- 不改变 AI 出站脱敏、敏感字段逐次授权、来源核验、人工确认和高风险业务禁止自动修改的边界。
- 不改变 Electron SQLite、浏览器 IndexedDB、离线 HTML、局域网同步、备份恢复和手机交换包协议。
- `v4.8.2` 仍作为上一维护版本保留；本版本的 UI 修复不需要数据转换。

## 已完成的受影响验证

```text
pnpm lint
node tests/student-ledger-pagination.js
node tests/v47-polish-ui.js
node tests/visual-contract.js
真实 Chromium：1440x920、390x844；学生台账、资料列表和移动分页
```

真实浏览器验收确认：桌面学生 AI 按钮位于固定操作列；移动端学生分页下一步可见；资料列表在手机端无横向溢出且全部操作按钮位于视口内；页面无 JavaScript 错误。

## 最终发布门禁

代码稳定后只执行一次：

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

发布门禁中的 `test:release` 还包含 `tests/browser-route-smoke.js`：它使用真实 Chromium 在五个发布视口逐一渲染侧栏主导航，检查 deferred UI 注册、页面级 JavaScript 错误、移动端抽屉状态和横向溢出。该检查是路由级 smoke，不替代功能测试或人工视觉验收。

最终视口验收覆盖 `1440x920`、`1280x800`、`1024x768`、`390x844` 和 `360x800`。相同代码状态下已通过的局部命令不重复运行；最终产物哈希只在 Release 资产生成后检查一次。

## 正式发布证据

| 项目 | 实际证据 |
| --- | --- |
| Tag commit | `e59bd5cc3799bdf03f798e0f56dc316f323b835c` |
| GitHub Actions | [run 32573727811](https://github.com/7752777/counselor-desk/actions/runs/32573727811)，Tests、Windows、macOS、Web、Draft 校验/发布均成功 |
| Release 时间 | `2026-08-22T12:58:19Z`（北京时间 `2026-08-22 20:58:19`） |
| Release 状态 | `isDraft=false`、`isPrerelease=false` |
| 仓库可见性 | Private |
| Pages | 不作为私有仓库当前入口或可用性证明 |

### 正式资产清单

以下 SHA-256 来自 v4.8.3 Release 资产，Release 同时附带 `Windows-SHA256.txt`、`macOS-SHA256.txt` 和 `Web-SHA256.txt` 三份清单。资产大小为 GitHub Release API 实际记录值；正式下载请使用资产链接，不使用工作区 `output/` 文件替代。

| 平台 | 资产 | 大小 | SHA-256 |
| --- | --- | ---: | --- |
| Windows | [counselor-desk-4.8.3-x64.exe](https://github.com/7752777/counselor-desk/releases/download/v4.8.3/counselor-desk-4.8.3-x64.exe) | 91,291,901 bytes | `35bab98c13ca94af40776a591eb0f28e6702cf604a859cde5a66535a8475a51a` |
| Windows | [counselor-desk-4.8.3-arm64.exe](https://github.com/7752777/counselor-desk/releases/download/v4.8.3/counselor-desk-4.8.3-arm64.exe) | 85,654,695 bytes | `34f568c4450bdc4fdfdd0cde3017d4cc4d2e98e5b161a2f7ffc361d564b95089` |
| macOS | [counselor-desk-4.8.3-mac-universal.dmg](https://github.com/7752777/counselor-desk/releases/download/v4.8.3/counselor-desk-4.8.3-mac-universal.dmg) | 196,856,772 bytes | `1636c207f8f74f28ffe217dda76899cab66cc39385ac54a9c5fdb5a5c38ebf02` |
| macOS | [counselor-desk-4.8.3-mac-universal.zip](https://github.com/7752777/counselor-desk/releases/download/v4.8.3/counselor-desk-4.8.3-mac-universal.zip) | 196,293,191 bytes | `b0594e4e58ac5d03fa274eb5a20b0ba4be32c43700ce348034b8cbb10d67b885` |
| Web | [CounselorDesk-v4.8.3-Offline.html](https://github.com/7752777/counselor-desk/releases/download/v4.8.3/CounselorDesk-v4.8.3-Offline.html) | 14,188,036 bytes | `565bec56a6ac198cdc973b8771370bc150aa21eaee567f817230af1930322286` |

清单文件：[Windows-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.8.3/Windows-SHA256.txt)、[macOS-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.8.3/macOS-SHA256.txt)、[Web-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.8.3/Web-SHA256.txt)。

## 最终验证结果

本地最终门禁和正式 CI 均通过：

```text
pnpm test                 # exit 0
pnpm lint                 # exit 0
pnpm build:release       # exit 0
pnpm check:public        # exit 0
pnpm check:secrets       # exit 0，325 个仓库文件
pnpm test:release        # exit 0，含 58 个主路由 x 5 个视口 smoke
git diff --check         # exit 0
```

本地真实 Chromium 路由 smoke 覆盖 `58` 个主导航路由及 `1440x920`、`1280x800`、`1024x768`、`390x844`、`360x800`；CI 又在虚拟显示环境中完成完整发布测试。正式流水线的 Windows、macOS 包含架构/安装运行 smoke，Web 包完成构建和 SHA-256 生成，最终 job 校验全部资产后才将 Release 设为已发布。

## 已知限制

- Windows/macOS 安装包仍按正式 Release 实际签名/公证状态使用；若未签名或未公证，安装前核对 SHA-256。
- 真实手机 HTTPS 证书信任、自动发现、长时间多设备断网重连、真实 WebDAV 服务商互操作和含附件的大数据量跨端恢复仍需目标环境抽查。
- 浏览器关闭后无法后台写文件或同步；数据库级加密、云端实时学生业务同步和 AI 自动修改学生事实不在本版本承诺内。

## 审查与流程说明

本批属于跨页面 UI 和公共记录级 AI 动作的中风险维护。按仓库轻量策略由当前实现代理进行批量自检和真实浏览器验收；没有为普通样式修复启动独立双审，也没有在同一代码状态下重复完整门禁或做常规源码哈希。最终发布阶段执行了一次完整本地门禁和一次正式 CI 门禁；SHA-256 只针对正式 Release 产物生成并回填。未重复执行与代码无关的哈希或子任务级全量门禁。
