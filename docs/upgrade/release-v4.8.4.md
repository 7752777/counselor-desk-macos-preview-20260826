# v4.8.4 发布候选记录

> 本文记录 v4.8.4 相对 v4.8.3 的兼容维护、验证范围和未通过门禁的候选状态。仓库 `7752777/counselor-desk` 已设为私有；下载和源码访问需要 GitHub 权限。该 Tag 保留但不移动、不覆盖，正式使用请以 v4.8.5 Release 为准。

## 发布判定

v4.8.4 是 v4.8.3 的发布完整性维护候选，不新增业务集合、不改变工作区协议、不改变 AI 默认上下文，也不把本地夹具扩大解释为真实设备或第三方服务商验收。它在 GitHub Actions 的完整门禁中连续两次停在 `tests/v48-management-ui.js` 的异步保存断言，因此没有正式 Release 或下载资产。

| 项目 | v4.8.4 记录 |
| --- | --- |
| 版本号 | 根 `package.json`、`desktop/package.json` 和页面 `APP_VERSION` 均为 `4.8.4` |
| 工作区协议 | `schema_version: 8`；业务 `data_schema_version: 11`；同步 `sync_protocol_version: 1`；物理 IndexedDB v6 |
| 分支 | `codex/ai-upgrade` |
| Tag | `v4.8.4` -> `e27abca19f2f72ffd45cc31f4dc0f56bb5cedbb8`（候选，保留不移动） |
| GitHub Release | 未创建；发布门禁失败，不能作为下载入口 |
| 历史兼容 | v4.8.3、v4.8.2、v4.8.1、v4.8.0 及更早 Tag/Release 保持不变 |

本文件不能作为可下载资产证明。失败 Actions run 为 `32578214271`（首次失败）及其重跑；失败点是 CI 慢速时序下远程备份配置断言早于异步保存完成。修复后的正式版本见[v4.8.5 发布收尾记录](./release-v4.8.5.md)。

## 本版本完成内容

### 单文件离线包

- `scripts/build-release.js` 将 `assets/app-icon.svg` 内联为 data URL。
- 单文件 HTML 不再请求离线包旁路的 `output/assets/app-icon.svg`，磁盘双击打开时不会因缺少外部图标产生资源失败。
- 构建脚本增加 favicon 未内联时的失败检查；已有 Excel、Argon2、JSZip、ECharts、运行时、集合清单和欢迎页资源内联行为保持不变。

### 真实文件协议验收

- 新增 `tests/browser-file-route-smoke.js`，直接使用 Chromium 打开 `file://` 离线 HTML。
- 覆盖 `1440x920`、`1024x768`、`390x844` 和 `360x800` 四个视口，渲染 232 次主导航路由。
- 检查移动导航抽屉、遮罩、Escape、页面错误和横向溢出；该测试是本地真实浏览器证据，不等于 Electron 实机或真实手机验收。

### 远程加密备份传输验收

- 新增 `tests/v48-remote-backup-e2e.js`，使用本地自签名 HTTPS/WebDAV 服务覆盖连接、上传、下载、删除和 404 失败处理。
- 该用例证明客户端传输边界和错误处理可运行，不代表任意第三方 WebDAV 服务商、学校网络或长期备份稳定性已经验收。

### 主门禁和维护脚本

- `pnpm test` 纳入完整 `pnpm test:cwb-ai` 和 `pnpm test:v48`，v4.8 远程备份传输用例也进入主套件。
- `pnpm test:release` 和 `pnpm test:browser-smoke` 纳入离线 `file://` smoke。
- `build:v4` 和 `scripts/build-package.js` 从根 `package.json` 动态读取版本，减少新维护版本的硬编码漂移。
- `scripts/check-doc-current-state.js` 按当前语义版本检查长期文档和 CHANGELOG，阻止发布后文档继续指向旧当前版本。

## 自动化验证

最终发布前必须在当前代码快照执行以下门禁，并把实际退出码和 Actions 运行地址回填：

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

本版本新增或受影响的局部验证：

```text
node --check tests/browser-file-route-smoke.js
node --check tests/v48-remote-backup-e2e.js
node tests/browser-file-route-smoke.js
node tests/v48-remote-backup-e2e.js
```

验证记录必须区分代码门禁、真实浏览器、平台打包和发布资产四层，不以一层证据替代另一层。

## 正式资产

若后续重新验证 v4.8.4，Release 应包含以下资产及对应校验清单；本候选实际上未生成这些资产：

| 平台 | 正式资产 | SHA-256 |
| --- | --- | --- |
| Windows x64 | `counselor-desk-4.8.4-x64.exe` | 发布后回填 |
| Windows ARM64 | `counselor-desk-4.8.4-arm64.exe` | 发布后回填 |
| macOS Universal | `counselor-desk-4.8.4-mac-universal.dmg` | 发布后回填 |
| macOS Universal | `counselor-desk-4.8.4-mac-universal.zip` | 发布后回填 |
| Web | `CounselorDesk-v4.8.4-Offline.html` | 发布后回填 |

Release 同时应附 `Windows-SHA256.txt`、`macOS-SHA256.txt` 和 `Web-SHA256.txt`。在这些文件实际出现在私有 Release 前，不应把工作区 `output/` 构建目录当作正式下载入口。

## 明确未完成的真实环境验收

- Windows/macOS 实机的自定义安装路径、数据目录迁移、损坏密钥、SQLite/WAL 损坏、恢复回滚和附件回读。
- 真实手机扫码、HTTPS 证书指纹核对、断网队列、设备撤销和长期多设备同步。
- 第三方 WebDAV/HTTPS 服务商互操作、超时差异和学校网络策略适配。
- 真实照片、证书、活动附件跨端恢复抽查。
- Windows 签名、macOS 签名与公证。
- 数据库级真正加密、真实模型中文质量、事实准确率和教师满意度基线。

重点学生 PIN 锁仍明确为“仅防误看，不是数据库加密”；浏览器关闭后不能后台写用户选择的文件目录或执行持续同步；局域网首期只允许同一局域网。上述限制不因本地自动化测试通过而消失。

## 发布后回填

正式发布证据不在本文回填；请查看 v4.8.5 发布记录。保留本文件是为了说明为什么没有把未通过门禁的 v4.8.4 Tag 当作正式版本。
