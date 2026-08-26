#!/usr/bin/env python3
"""Build the single-column Chinese v4.9.1 purchase and activation quick guide.

The source of truth is docs/product-manual-v4.9.1.md. This small renderer keeps
the manual easy to review in Markdown while producing a customer-ready PDF with
a real table of contents, readable Chinese font, page numbers, tables and
fictional-data screenshots.
"""

from __future__ import annotations

import html
import os
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "product-manual-v4.9.1.md"
OUTPUT = ROOT / "output" / "pdf" / "学工智伴-v4.9.1-购买与激活速查.pdf"
FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\msyh.ttf"),
    Path(r"C:\Windows\Fonts\simhei.ttf"),
    Path(r"C:\Windows\Fonts\simsun.ttf"),
    Path(r"C:\Windows\Fonts\simsun.ttc"),
]


def find_font() -> Path:
    for candidate in FONT_CANDIDATES:
        if candidate.exists():
            return candidate
    raise SystemExit("No Chinese font found. Install Microsoft YaHei, SimHei or SimSun.")


FONT_PATH = find_font()


def inline_markup(value: str) -> str:
    value = html.escape(value, quote=False)
    value = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", value)
    value = re.sub(r"`([^`]+)`", r'<font name="CWBMono">\1</font>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    return value


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(inline_markup(text), style)


class ManualDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="single-column",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates([PageTemplate(id="manual", frames=[frame], onPage=draw_page)])

    def afterFlowable(self, flowable: Flowable) -> None:
        if isinstance(flowable, Paragraph) and flowable.style.name in {"ManualH1", "ManualH2", "ManualH3"}:
            level = {"ManualH1": 0, "ManualH2": 1, "ManualH3": 2}[flowable.style.name]
            text = flowable.getPlainText()
            key = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "-", text).strip("-") or f"heading-{self.page}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=False)
            self.notify("TOCEntry", (level, text, self.page))


def draw_page(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    if doc.page > 1:
        canvas.setStrokeColor(colors.HexColor("#dbe4ef"))
        canvas.line(doc.leftMargin, height - 15 * mm, width - doc.rightMargin, height - 15 * mm)
        canvas.setFont("CWBSans", 8.2)
        canvas.setFillColor(colors.HexColor("#60728a"))
        canvas.drawString(doc.leftMargin, height - 11 * mm, "学工智伴 v4.9.1 · 购买与激活速查")
        canvas.drawRightString(width - doc.rightMargin, 10 * mm, f"第 {doc.page} 页")
    canvas.restoreState()


def load_lines() -> list[str]:
    return SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n").split("\n")


def parse_table(lines: list[str], start: int) -> tuple[Table, int]:
    rows: list[list[str]] = []
    index = start
    while index < len(lines) and lines[index].strip().startswith("|"):
        cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        rows.append(cells)
        index += 1
    if len(rows) >= 2 and all(set(cell) <= {"-", ":", " "} for cell in rows[1]):
        rows.pop(1)
    col_count = max(len(row) for row in rows)
    normalized = [row + [""] * (col_count - len(row)) for row in rows]
    rendered = [[paragraph(cell, STYLES["table_cell"]) for cell in row] for row in normalized]
    widths = [doc_width / col_count] * col_count
    table = Table(rendered, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaf1fb")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#17345e")),
        ("FONTNAME", (0, 0), (-1, -1), "CWBSans"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#c9d5e4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table, index


def image_flowable(relative_path: str, alt: str) -> list[Flowable]:
    image_path = (SOURCE.parent / relative_path).resolve()
    if not image_path.exists():
        return [paragraph(f"截图缺失：{alt}", STYLES["note"])]
    reader = ImageReader(str(image_path))
    image_width, image_height = reader.getSize()
    max_width = doc_width
    max_height = 92 * mm
    scale = min(max_width / image_width, max_height / image_height)
    image = Image(str(image_path), width=image_width * scale, height=image_height * scale)
    image.hAlign = "CENTER"
    return [Spacer(1, 2 * mm), image, Spacer(1, 1.5 * mm), paragraph(alt, STYLES["caption"]), Spacer(1, 3 * mm)]


def build_story(lines: list[str]) -> list[Flowable]:
    story: list[Flowable] = []
    story.extend([
        Spacer(1, 15 * mm),
        paragraph("学工智伴", STYLES["cover_title"]),
        paragraph("v4.9.1 购买与激活速查", STYLES["cover_version"]),
        Spacer(1, 8 * mm),
        paragraph("把学生台账、跟进、材料、分析与 AI 建议组织成一条可以回看的工作链。", STYLES["cover_subtitle"]),
        Spacer(1, 7 * mm),
        paragraph("前瞻版 · 单栏客户说明 · 截图使用虚构演示数据", STYLES["cover_note"]),
        Spacer(1, 10 * mm),
        Table([[paragraph("当前正式维护版本：v4.8.5", STYLES["cover_box"]), paragraph("当前前瞻版：v4.9.1", STYLES["cover_box"])]], colWidths=[doc_width / 2] * 2, style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef5ff")),
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#b9cfee")),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d2dff2")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ])),
        Spacer(1, 8 * mm),
        paragraph("开发者微信：Windsky0823 · 技术交流、问题反馈、前瞻体验资格核验和购买咨询", STYLES["cover_note"]),
        PageBreak(),
        paragraph("目录", STYLES["toc_title"]),
        Spacer(1, 3 * mm),
    ])
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name="TOC0", fontName="CWBSans", fontSize=11, leading=18, leftIndent=0, firstLineIndent=0, textColor=colors.HexColor("#193c70")),
        ParagraphStyle(name="TOC1", fontName="CWBSans", fontSize=9.4, leading=15, leftIndent=12, firstLineIndent=0, textColor=colors.HexColor("#334155")),
        ParagraphStyle(name="TOC2", fontName="CWBSans", fontSize=8.8, leading=13, leftIndent=24, firstLineIndent=0, textColor=colors.HexColor("#64748b")),
    ]
    story.extend([toc, PageBreak()])

    index = 0
    in_code = False
    code_lines: list[str] = []
    paragraph_lines: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_lines
        if paragraph_lines:
            content = " ".join(item.strip() for item in paragraph_lines).strip()
            if content:
                story.append(paragraph(content, STYLES["body"]))
                story.append(Spacer(1, 2.2 * mm))
        paragraph_lines = []

    while index < len(lines):
        raw = lines[index]
        stripped = raw.strip()
        if stripped.startswith("```"):
            flush_paragraph()
            if in_code:
                story.append(Preformatted("\n".join(code_lines), STYLES["code"]))
                story.append(Spacer(1, 3 * mm))
                code_lines = []
            in_code = not in_code
            index += 1
            continue
        if in_code:
            code_lines.append(raw)
            index += 1
            continue
        if not stripped:
            flush_paragraph()
            index += 1
            continue
        image_match = re.match(r"!\[([^]]*)\]\(([^)]+)\)", stripped)
        if image_match:
            flush_paragraph()
            alt, path = image_match.groups()
            story.extend(image_flowable(path, alt))
            index += 1
            continue
        heading_match = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if heading_match:
            flush_paragraph()
            level, title = len(heading_match.group(1)), heading_match.group(2).strip()
            if level == 1 or title in {"产品手册", "目录"}:
                index += 1
                continue
            style_name = {2: "h2", 3: "h3"}[level]
            story.append(paragraph(title, STYLES[style_name]))
            story.append(Spacer(1, 1.5 * mm))
            index += 1
            continue
        if stripped.startswith("|"):
            flush_paragraph()
            table, index = parse_table(lines, index)
            story.extend([Spacer(1, 1 * mm), table, Spacer(1, 3 * mm)])
            continue
        if stripped.startswith(">"):
            flush_paragraph()
            note = stripped[1:].strip()
            story.append(Table([[paragraph(note, STYLES["note"])]], colWidths=[doc_width], style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f3f7fc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c6d7ec")),
                ("LINEBEFORE", (0, 0), (0, -1), 3, colors.HexColor("#1769c2")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ])))
            story.append(Spacer(1, 3 * mm))
            index += 1
            continue
        list_match = re.match(r"^(?:[-*]|\d+\.)\s+(.+)$", stripped)
        if list_match:
            flush_paragraph()
            story.append(paragraph("• " + list_match.group(1), STYLES["list"]))
            index += 1
            continue
        if stripped == "---":
            flush_paragraph()
            story.append(Spacer(1, 1 * mm))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#d7e0ec")))
            story.append(Spacer(1, 2 * mm))
            index += 1
            continue
        paragraph_lines.append(stripped)
        index += 1
    flush_paragraph()
    return story


styles = getSampleStyleSheet()
doc_width = A4[0] - 34 * mm
STYLES = {
    "cover_title": ParagraphStyle("CoverTitle", parent=styles["Title"], fontName="CWBSans", fontSize=29, leading=38, alignment=TA_CENTER, textColor=colors.HexColor("#102a56"), spaceAfter=4 * mm),
    "cover_version": ParagraphStyle("CoverVersion", parent=styles["Normal"], fontName="CWBSans", fontSize=18, leading=24, alignment=TA_CENTER, textColor=colors.HexColor("#1769c2")),
    "cover_subtitle": ParagraphStyle("CoverSubtitle", parent=styles["Normal"], fontName="CWBSans", fontSize=12.5, leading=21, alignment=TA_CENTER, textColor=colors.HexColor("#334155")),
    "cover_note": ParagraphStyle("CoverNote", parent=styles["Normal"], fontName="CWBSans", fontSize=9.5, leading=15, alignment=TA_CENTER, textColor=colors.HexColor("#64748b")),
    "cover_box": ParagraphStyle("CoverBox", parent=styles["Normal"], fontName="CWBSans", fontSize=9.5, leading=14, alignment=TA_CENTER, textColor=colors.HexColor("#24436e")),
    "toc_title": ParagraphStyle("TOCTitle", parent=styles["Heading1"], fontName="CWBSans", fontSize=22, leading=28, textColor=colors.HexColor("#102a56"), spaceAfter=3 * mm),
    "h2": ParagraphStyle("ManualH1", parent=styles["Heading1"], fontName="CWBSans", fontSize=17, leading=24, textColor=colors.HexColor("#102a56"), spaceBefore=7 * mm, spaceAfter=2 * mm, keepWithNext=True),
    "h3": ParagraphStyle("ManualH2", parent=styles["Heading2"], fontName="CWBSans", fontSize=13, leading=19, textColor=colors.HexColor("#1769c2"), spaceBefore=4 * mm, spaceAfter=1.5 * mm, keepWithNext=True),
    "body": ParagraphStyle("Body", parent=styles["BodyText"], fontName="CWBSans", fontSize=10.2, leading=17, textColor=colors.HexColor("#26364d"), alignment=TA_LEFT, wordWrap="CJK"),
    "list": ParagraphStyle("List", parent=styles["BodyText"], fontName="CWBSans", fontSize=10, leading=16, leftIndent=10, firstLineIndent=-7, textColor=colors.HexColor("#26364d"), wordWrap="CJK"),
    "note": ParagraphStyle("Note", parent=styles["BodyText"], fontName="CWBSans", fontSize=9.3, leading=15, textColor=colors.HexColor("#42546c"), wordWrap="CJK"),
    "caption": ParagraphStyle("Caption", parent=styles["BodyText"], fontName="CWBSans", fontSize=8.5, leading=12, alignment=TA_CENTER, textColor=colors.HexColor("#64748b"), wordWrap="CJK"),
    "table_cell": ParagraphStyle("TableCell", parent=styles["BodyText"], fontName="CWBSans", fontSize=8.5, leading=12, textColor=colors.HexColor("#26364d"), wordWrap="CJK"),
    "code": ParagraphStyle("Code", parent=styles["Code"], fontName="CWBMono", fontSize=8.2, leading=12, textColor=colors.HexColor("#334155"), backColor=colors.HexColor("#f4f7fb"), borderColor=colors.HexColor("#d7e0ec"), borderWidth=0.5, borderPadding=6),
}


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    pdfmetrics.registerFont(TTFont("CWBSans", str(FONT_PATH)))
    pdfmetrics.registerFont(TTFont("CWBMono", str(FONT_PATH)))
    document = ManualDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=17 * mm,
        rightMargin=17 * mm,
        topMargin=21 * mm,
        bottomMargin=18 * mm,
        title="学工智伴 v4.9.1 购买与激活速查",
        author="学工智伴维护组",
        subject="高校辅导员工作台功能、授权、AI 与更新说明",
    )
    document.multiBuild(build_story(load_lines()))
    print(f"built {OUTPUT}")


if __name__ == "__main__":
    main()
