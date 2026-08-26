# Counselor Desk Desktop

桌面端是辅导员工作台的 Electron 外壳，与根目录网页共用业务页面和数据契约。它的存在是为了让长期使用者拥有更明确的本地数据目录、附件管理和系统级备份路径。

## 对使用者

请不要直接从这个目录运行源码。安装包、平台支持、SHA-256、签名和公证状态以 [GitHub Releases](https://github.com/7752777/counselor-desk/releases) 中实际存在的附件说明为准。安装、升级、卸载与数据保留请阅读 [桌面端安装说明](../docs/v4-desktop-installation.md)。

## 对开发者

桌面端开发与打包需要对应平台的 Electron 工具链。运行、测试、构建和发布门禁见 [开发与构建](../docs/development.md)。

v4.4 的 Windows x64/ARM64 与 macOS Universal 真实打包/安装/恢复验证仍是发布前门禁；在正式 Release 前，不要将本目录或工作流配置视为已发布桌面产品。
