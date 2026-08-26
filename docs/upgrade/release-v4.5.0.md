# v4.5.0 发布收尾记录

本页是 v4.5.0 的统一发布事实源。它记录老师反馈收口批次的实现范围、验证结果、正式 Tag、GitHub Actions、Pages、Release 附件和校验信息。发布证据只以本页回填的公开链接和实际附件为准，不以开发目录中的中间产物替代。

## 发布结论

| 项目 | 状态 |
| --- | --- |
| 版本 | `v4.5.0` |
| 发布提交 | [`1b773b3dfaa19745541df9e504f6de160c48a75a`](https://github.com/7752777/counselor-desk/commit/1b773b3dfaa19745541df9e504f6de160c48a75a) |
| Tag | [`v4.5.0`](https://github.com/7752777/counselor-desk/tree/v4.5.0) |
| GitHub Release | [`v4.5.0 Release`](https://github.com/7752777/counselor-desk/releases/tag/v4.5.0)，公开、非 Draft、非 Prerelease；发布时间 `2026-08-18T16:39:52Z` |
| 发布门禁 | [Actions #32160336549](https://github.com/7752777/counselor-desk/actions/runs/32160336549)，Tests、Windows、macOS、Web 和 Draft Release 全部成功 |
| GitHub Pages | [Actions #32161681464](https://github.com/7752777/counselor-desk/actions/runs/32161681464) 成功；在线入口 HTTP 200，运行时包含 `4.5.0` |
| 当前下载 | 以 v4.5.0 Release 的实际附件和三份 SHA-256 清单为准 |
| 签名/公证 | 当前构建配置未启用代码签名；macOS 包未公证，不能表述为已签名或已公证 |

正式 Release 和 Pages 已完成；历史 `v4.4.6` Tag 与 Release 未移动、未覆盖。第一次从维护分支直接触发 Pages 被 `github-pages` 环境保护规则拒绝，随后从允许部署的 `master` 工作流入口重新执行并成功，未产生错误公开部署。

## 本批实现

- 学生档案补齐导师、班主任、家长关系、居住信息、房东联系方式、照片和历史学号；导入默认合并更新，覆盖导入先建立恢复点并显示删除数量。
- 党员发展日期保持实际填写值，统一党员流程主记录；新增以国家基线和学校附加节点组成的团员发展流程，并保存规则版本、来源和审计。
- 新增本地通讯录、带班班级课表和活动参与关联集合，统一接入浏览器 IndexedDB、单文件离线包、Electron SQLite、备份恢复和手机交换包。
- 资料库增加卡片/列表模式；谈心谈话增加日期、姓名、稳定 ID 和学号兼容筛选；活动支持学期、学生参与、照片附件和去重统计；工作留痕支持查课查寝记录及照片附件。
- 统一导出支持 CSV、XLSX、可编辑 DOCX、打印 HTML 和 Electron PDF，支持筛选范围、字段列序、敏感字段确认、封面目录、页眉页脚和来源审计。
- AI 通知只处理老师主动粘贴或导入的内容，生成重点、截止时间、待办、核验信息和证据片段草稿；确认后才可转任务或工作留痕。
- 移动端常用栏支持本地排序，抽屉、分组搜索、底栏和顶部 sticky 行为保持可操作；离线网页、Pages 和桌面端共用同一套版本化源代码。

## 数据与安全边界

- 重点学生锁明确为“仅防误看，不是加密”，不能替代设备权限、磁盘加密或数据库级加密。
- 照片、活动照片和业务附件使用附件仓保存，业务记录只保留附件 ID；容量检查、风险提示、失败回滚和垃圾附件清理由本地数据层负责。
- 学生业务关联优先使用稳定 `student_id`；更正学号会保留历史学号和现有时间线关联。
- AI 默认脱敏，敏感字段授权只对当前请求生效；AI 只生成建议或草稿，不自动改变心理、预警、纪律、资助、奖惩或学生事实记录。
- 通讯录是当前本地工作区的个人备忘录，不默认上传、不默认与学生关联。
- 外部网页来源只在用户主动选择并明确触发时受控访问，必须经过 HTTPS、来源、私网地址、超时、大小和内容类型检查；静态 Pages 不运行 relay。
- 对话中曾暴露过的外部 API key 必须由账户持有人在服务后台撤销和轮换；仓库扫描不能代替服务端操作，新密钥不得进入源码、文档、备份、日志或 Git。

## 本地验证

下列命令在当前 v4.5.0 工作区执行；完整主测试耗时较长，最终以退出码 0 为准。jsdom 输出的 `c.local` 资源加载和 `window.scrollTo` 提示属于测试夹具噪声，不代表产品运行时失败。

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

定向反馈回归：

```text
node tests/v45-teacher-feedback.js
node tests/talk-follow-up.js
node tests/business-module-recovery.js
node tests/v4-modules.js
```

完整测试覆盖导入、导出、学生台账性能、AI 治理和 relay、Electron SQLite、schema v8 迁移、备份、附件容量、交换包、移动导航、谈话回访、活动、党团流程和页面体验。最终门禁中若代码再次变化，只重跑受影响的定向测试，并在发布前补跑一次完整门禁。

## 正式发布证据

### Commit、Tag、Actions

| 证据 | 真实结果 |
| --- | --- |
| 发布提交 | [`1b773b3dfaa19745541df9e504f6de160c48a75a`](https://github.com/7752777/counselor-desk/commit/1b773b3dfaa19745541df9e504f6de160c48a75a) |
| `v4.5.0` Tag | [Tag v4.5.0](https://github.com/7752777/counselor-desk/tree/v4.5.0) |
| Tests / release validation | [Actions #32160336549](https://github.com/7752777/counselor-desk/actions/runs/32160336549)，通过 |
| Windows x64 / ARM64 | 同一 Run 的 Windows job，通过 |
| macOS Universal | 同一 Run 的 macOS job，通过 |
| Offline web | 同一 Run 的 Offline web job，通过 |
| Draft Release / final Release | 同一 Run 创建 Draft，随后 [v4.5.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.5.0) 已公开 |
| Pages deployment | [Actions #32161681464](https://github.com/7752777/counselor-desk/actions/runs/32161681464)，通过，HTTP 200 |

### Release 附件

正式附件应来自同一 `v4.5.0` Tag 对应的 GitHub Actions，不使用本地 `output/v4-preview.html` 或其他预览文件：

| 文件 | 大小 | SHA-256 | 备注 |
| --- | ---: | --- | --- |
| `CounselorDesk-v4.5.0-Offline.html` | 13,282,191 | `1356bd6d9d831a8a664b651f351b65dc941b1eb30c83cfecbc175fa3510946d7` | [下载](https://github.com/7752777/counselor-desk/releases/download/v4.5.0/CounselorDesk-v4.5.0-Offline.html)；单文件离线网页 |
| `counselor-desk-4.5.0-x64.exe` | 91,180,555 | `36b0581695649a7ef39cccdb69dcb39a79e3888bbd8d08c8a4dc039c19ef21aa` | Windows x64 NSIS |
| `counselor-desk-4.5.0-arm64.exe` | 85,613,978 | `0e1f633e5874769823134fbc3d22349cce653a9921e9bc92a6eece33bdd54dc5` | Windows ARM64 NSIS |
| `counselor-desk-4.5.0-mac-universal.dmg` | 195,336,556 | `e79820cdf86f62e2243bd2d73c34005a67047b9e7db1c60549ff2f74646c20db` | macOS Universal，未公证 |
| `counselor-desk-4.5.0-mac-universal.zip` | 194,779,741 | `78478df21d915a710c9e0ad75001ea0448ff02b51ff2be3ea1e1a4345ad42765` | macOS Universal，未公证 |
| `Web-SHA256.txt` | 97 | `adfdf9e25545fc91c5e42438feb2bc4170b84c3e26d7aaa18a4b818ee00ae493` | 网页清单；其中 HTML SHA 与 Release digest 一致 |
| `Windows-SHA256.txt` | 194 | `e71a931ca253212f576a38126c94b2787ccf3be10949b04c99de638b82b8466f` | Windows 清单；两架构 digest 与 Release 一致 |
| `macOS-SHA256.txt` | 240 | `925b9a7f194211622b215ecba8f0083c13b37e7c7d8d2896c6e92360ba75c9ca` | macOS 清单；两架构 digest 与 Release 一致 |

## Pages 与使用边界

- 正式在线入口：[GitHub Pages](https://7752777.github.io/counselor-desk/)。[Pages Actions #32161681464](https://github.com/7752777/counselor-desk/actions/runs/32161681464) 已成功，公开入口验收为 HTTP 200，页面包含 `4.5.0`、学生分页入口和 v8 运行时资源。
- `http://127.0.0.1:4173/` 只代表当前电脑的本地开发服务；手机访问这个地址时，`127.0.0.1` 指向手机本身。手机验收应使用 Pages、电脑局域网地址或 Release 的离线 HTML。
- 公共网页只使用演示或脱敏数据。真实学生资料优先放在受控设备、桌面端或离线工作区，并配合设备访问控制、备份和学校制度管理。

## 已知限制与后续

- 本批没有实现数据库级真加密；“忘记密码”能力只能理解为解除界面限制，不能当作找回加密数据的密码。
- Windows/macOS 包当前未配置代码签名，macOS 未公证；安装时需核对 Release 附带的 SHA-256 清单并遵循学校软件管理要求。
- 浏览器端 PDF 通过系统打印保存，版式受浏览器和打印机驱动影响；Electron 才提供程序化 `printToPDF`。
- 团员发展提供国家基线、材料完整性和提醒，不生成资格认定、审批结论或替代团组织判断；学校附加节点需要管理员维护。
- 真正的数据库级加密、独立家校沟通台账、字典配置中心和大规模真实设备压测另立后续高风险批次。

## 维护规则

本次发布的真实 SHA、Actions、Release、Pages、附件大小和哈希已回填到本页，并同步到 `README.md`、`CHANGELOG.md`、`docs/v4-acceptance-report.md`、`docs/v4-archive-ledger.md`、`docs/upgrade/current-baseline.md`、`docs/upgrade/source-authority.md` 和依赖清单。后续版本不得用历史 v4.4.6 证据代替 v4.5.0 证据，也不得移动已发布 Tag。
