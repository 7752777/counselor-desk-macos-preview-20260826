# v4.6.0 发布收尾记录

本页是 v4.6.0 的发布事实源，记录本版本的实现、本地最终门禁、远程构建、正式 Release、Pages 和附件校验值。不得使用 v4.5.0 的证据替代本版本证据。

## 发布结论

| 项目 | 当前状态 |
| --- | --- |
| 版本 | `v4.6.0` |
| 基线 | v4.5.0，保留旧 Tag、Release 和数据格式 |
| 工作区版本 | `4.6.0` |
| 默认分支 | `master`，已由 PR #24 合并 v4.6.0 实现 |
| 发布提交 | [`3db26ec`](https://github.com/7752777/counselor-desk/commit/3db26ec52d40e1779ee15e52a1578c4cba1cbc30) |
| Tag | [`v4.6.0`](https://github.com/7752777/counselor-desk/releases/tag/v4.6.0)，已推送且未覆盖历史 Tag |
| GitHub Release | [`v4.6.0 Release`](https://github.com/7752777/counselor-desk/releases/tag/v4.6.0)，公开、非 Draft、非 Pre-release |
| 发布 Actions | [#32185919304](https://github.com/7752777/counselor-desk/actions/runs/32185919304)，Tests、Windows、macOS、Web、Draft Release 全部成功 |
| Pages | [#32188118210](https://github.com/7752777/counselor-desk/actions/runs/32188118210) 成功；[在线入口](https://7752777.github.io/counselor-desk/) HTTP 200，运行时为 `4.6.0` |
| 平台附件 | Offline HTML、Windows x64/ARM64、macOS Universal DMG/ZIP 和三份 SHA-256 清单均已公开 |
| 签名/公证 | Windows/macOS 构建未配置代码签名；macOS 未公证，Release 已明确提示先核验 SHA-256 |

## 本批交付内容

- 实用工具：抽签、随机分组、轮值安排、日期计算和名单清理。
- 住宿专项：楼栋、房间、住宿批次、排宿预览、冲突检查、人工确认、调宿轨迹、导入和导出。
- 班委扩展：默认和自定义岗位、一人多职、代理/空缺/继任、任期和考核等级。
- 家校联系：独立 `v4_family_contacts`，与个人通讯录严格分离。
- 工作记录：业务记录生成待确认草稿，支持来源哈希、编辑、合并、确认、驳回和过期提示。
- 科研课题：阶段看板、时间轴、截止提醒和去重任务关联。
- 奖惩证书：附件 ID、图片/PDF/文档、预览、哈希去重、索引导出和删除审计。
- 班级综合分析：班级/学期/时间范围、聚合指标、对比和学生下钻。
- 首页摘要：紧凑数字条、最多 5 条紧急事项、折叠状态和模块跳转。
- Electron 卡片模式：补齐 v4.6 运行时资源清单，保证网页、离线包和桌面端一致。

## 数据与安全边界

本版本新增 10 个集合：`v4_dorm_buildings`、`v4_dorm_rooms`、`v4_dorm_batches`、`v4_dorm_assignments`、`v4_dorm_transfers`、`v4_committee_role_catalog`、`v4_committee_evaluations`、`v4_family_contacts`、`v4_worklog_drafts` 和 `v4_research_projects`。schema v9 由 v8 增量迁移产生，旧数据、旧学号、稳定 `student_id`、附件关系和 v8 恢复能力继续保留。

排宿方案必须预览并人工确认后写入学生当前宿舍；调宿只追加历史，不覆盖轨迹。工作记录必须经过草稿确认，不能因一次谈话、家长联系或任务完成自动制造已完成事实。奖惩证书二进制不写入业务记录，业务记录只保存附件引用。

AI 只提供冲突解释、草稿、清单和聚合说明。它不能自动决定床位、班委等级、奖惩结论、科研审批状态，也不能修改学生事实、心理、危机、资助、纪律、预警和党团记录。所有 AI 请求继续执行脱敏、一次性敏感授权、调用审计和人工确认。

## 本地验证记录

定向验证已完成的前序结果：

```text
pnpm lint
pnpm test:v46
pnpm test:cwb-collections
pnpm test:backup-state
pnpm test:desktop
node scripts/build-release.js output/v4-preview.html
```

本地最终门禁已于 2026-08-19 在同一候选代码状态完成：

```text
pnpm test                 PASS（完整主测试链，退出码 0）
pnpm lint                 PASS
pnpm build:release        PASS
pnpm check:public         PASS
pnpm check:secrets        PASS（254 个仓库文件）
pnpm test:release         PASS
git diff --check          PASS（仅有 Git 的 LF/CRLF 提示）
```

容量和恢复覆盖已分别通过：5,000 行学生导入与组合处理、10,000 条浏览器性能处理、照片/附件容量治理、便携附件、备份附件恢复和交换包回滚。它们是脱敏测试夹具下的分项验证，不能替代 GitHub runner 的 Windows/macOS 包级验证，也不能替代公开 Release 附件的校验值。

本地浏览器已复核 `1440×920`、`390×844`、`360×800`：v4.6 导航入口、工具、住宿、班委、家校、科研、班级分析、待确认工作记录、移动抽屉、底栏、sticky 顶栏和学生卡片均可操作；移动端无横向溢出。前序浏览器日志中的旧 `student is not defined`、`applyFold is not defined` 和 `v4Page is not defined` 已修复，不作为当前运行时错误。

远程发布已在最终 `v4.6.0` Tag 上完成：

```text
Tests / Windows / macOS / Web / Draft Release workflow：PASS
Release：已公开
Pages：已部署并返回 HTTP 200
```

5,000 行学生导入、10,000 条浏览器性能处理、照片/证书附件仓、备份恢复和交换包回滚已在脱敏夹具中完成分项验证；Windows/macOS 包级验证由对应 GitHub runner 完成，不能把本地 Windows 结果当作 macOS 构建证据。

## 正式发布证据

| 证据 | 结果 |
| --- | --- |
| 发布提交 | [`3db26ec`](https://github.com/7752777/counselor-desk/commit/3db26ec52d40e1779ee15e52a1578c4cba1cbc30)；PR #24 合并提交 [`cdc356f`](https://github.com/7752777/counselor-desk/commit/cdc356f0fdcc9e2136679d13d9b2c893744c44bc) |
| `v4.6.0` Tag | [已推送](https://github.com/7752777/counselor-desk/releases/tag/v4.6.0) |
| Tests / Release validation | [Actions #32185919304](https://github.com/7752777/counselor-desk/actions/runs/32185919304)，全部成功 |
| Windows x64 / ARM64 | 同一 Actions 的 Windows job 成功，架构、安装器、包级烟测和清单通过 |
| macOS Universal | 同一 Actions 的 macOS job 成功，DMG/ZIP、双架构、挂载和包级烟测通过 |
| Offline web | 同一 Actions 的 Web job 成功；公开 Pages 运行时资源已验收 |
| Draft Release / final Release | Draft 自动生成后已转为公开 [v4.6.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.6.0) |
| Pages deployment | [Actions #32188118210](https://github.com/7752777/counselor-desk/actions/runs/32188118210) 成功；[在线入口](https://7752777.github.io/counselor-desk/) HTTP 200 |

### Release 附件

| 文件 | 大小 | SHA-256 | 备注 |
| --- | ---: | --- | --- |
| `CounselorDesk-v4.6.0-Offline.html` | 13,414,020 | `b27be8e0dc9c1c0423272251540d14991a5c84922bc0dd38e7b0a1578528a19f` | [下载](https://github.com/7752777/counselor-desk/releases/download/v4.6.0/CounselorDesk-v4.6.0-Offline.html) |
| `counselor-desk-4.6.0-x64.exe` | 91,214,821 | `39dcd18d81e4b060d1a90948fc2e178746be3ea8e97f17bb87031d23eafa4e81` | Windows x64 NSIS |
| `counselor-desk-4.6.0-arm64.exe` | 85,648,190 | `f7d44abd4c16ccfd64f6a8e130b46f8eabd7c0b5bd2cfc3330f5fa517c81c657` | Windows ARM64 NSIS |
| `counselor-desk-4.6.0-mac-universal.dmg` | 195,419,323 | `2408e0c12815a3bf9396131db88d63c68b18b2bad852669fc5ca124e01731ebd` | macOS Universal，未签名、未公证 |
| `counselor-desk-4.6.0-mac-universal.zip` | 194,816,827 | `aa64ae932c80145270c9c467713759c4a6062a72c0e6aa6a4ba81d7002ef7f2c` | macOS Universal，未签名、未公证 |
| `Web-SHA256.txt` | 97 | `28827b9ebb4275e2c6e5591e6da5d07be8609d67e3231d0d0e33db4f9ade3f2f` | 网页清单 |
| `Windows-SHA256.txt` | 194 | `963e740795c7fb92bd73be890d676b425286ac0b562075bceb00b144729ab49e` | Windows 清单 |
| `macOS-SHA256.txt` | 240 | `efa627f015fc6d21d99a8932cc96f0a58f992313109e3553311bf67fae97ce0b` | macOS 清单 |

## 已知限制

- 重点学生锁仍然是防误看，不是数据库级加密。
- 浏览器端 PDF 依赖系统打印，版式受浏览器和打印机驱动影响。
- 宿舍规则只做本地容量、性别、床位和重复入住检查，不替代学校住宿制度。
- 班级聚合缺失数据显示“未记录”，不直接当作零。
- Windows/macOS 构建已由目标 runner 验证，但未配置代码签名；macOS 未公证，安装时会出现系统安全提示。
- 公开 Pages 只适合演示或脱敏数据；真实学生资料应留在受控设备或离线/桌面工作区。

## 发布后维护

本次已根据 GitHub Release、Actions、Pages 和实际附件同步回填 `README.md`、`CHANGELOG.md`、`docs/README.md`、`docs/v4-acceptance-report.md`、`docs/v4-archive-ledger.md`、`docs/v4-desktop-installation.md`、`docs/upgrade/current-baseline.md`、`docs/upgrade/source-authority.md` 和本页；后续版本必须建立新的 Tag、Release、Actions 和 Pages 证据，不覆盖本记录。
