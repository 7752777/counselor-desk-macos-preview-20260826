# 非商业完整说明书构建说明

本目录中的 [product-guide-v4.9.1.tex](./product-guide-v4.9.1.tex) 是“学工智伴”前瞻版完整功能产品手册的 LaTeX 源文件。它只介绍功能、操作方法、数据边界、安全规则和跨端使用，不包含价格、购买、支付、激活码或商业授权内容。当前完整手册约 70 页，按模块配有虚构演示截图；购买和激活单独放在速查 PDF 中。

## 生成 PDF

构建需要：

- Tectonic 0.17 或更高版本；
- 中文字体 `Noto Sans CJK SC` 或 Windows `Microsoft YaHei`；
- `assets/screenshots/v4.9.0/` 中的虚构演示截图。

仓库开发环境已经提供临时 Tectonic 和 Noto Sans SC 字体时，可以在项目根目录执行：

```powershell
pnpm docs:product-guide
```

脚本会把完整 PDF 同时生成到 `output/pdf/学工智伴-v4.9.1-产品手册.pdf` 和兼容名称 `output/pdf/学工智伴-v4.9.1-功能与使用说明书.pdf`，并保留构建日志和辅助文件在同一目录。`pnpm docs:product-manual` 还会先生成 `output/pdf/学工智伴-v4.9.1-购买与激活速查.pdf`。`output/` 属于生成目录，按仓库规则不进入源码提交；需要对外分发时，应将经过人工检查的 PDF 作为版本附件或受控文档交付。

如果本机没有仓库内的 Tectonic，可以把可执行文件放入 `TECTONIC_BIN` 环境变量，或直接安装到系统 PATH：

```powershell
$env:TECTONIC_BIN = 'D:\tools\tectonic.exe'
pnpm docs:product-guide
```

脚本会优先读取 `tmp/tools/tectonic-0.17.0/tectonic.exe`，也支持 Linux/macOS 下的 `tmp/tools/tectonic-0.17.0/tectonic` 和 PATH 中的 `tectonic`。字体路径不存在时，LaTeX 源文件会回退到系统 CJK 字体；没有可用中文字体会明确失败，不会生成缺字的“看似成功”文件。

## 检查内容

生成后应检查封面、目录、图目录、每张截图、长表、页眉页脚、页码和结尾页。截图使用虚构数据，不能直接作为真实学生数据示例。文档状态中的“工作区候选”不能理解为正式发布或真实学校环境已经验收。
