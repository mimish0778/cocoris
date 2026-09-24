# -*- coding: utf-8 -*-
"""メンバー共有用の企画書をPDFで出す。

  python scripts/make_proposal.py  ->  docs/proposal.pdf

目的は「だいたいどんなものを作るのか」を掴んでもらうこと。**A4 2枚まで。**
詳細は docs/ の各ファイルにあるので、ここには書かない。増やしたくなったら我慢すること。
"""
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "docs", "proposal.pdf")

# reportlab 内蔵の日本語CIDフォント。フォントファイルの同梱が要らない
GOTHIC = "HeiseiKakuGo-W5"
MINCHO = "HeiseiMin-W3"
pdfmetrics.registerFont(UnicodeCIDFont(GOTHIC))
pdfmetrics.registerFont(UnicodeCIDFont(MINCHO))
# 日本語CIDフォントに太字は無い。<b> を明朝→ゴシックの切替に割り当てる（日本語組版の定石）。
# これをやらないと <b> が黙って無視され、強調が全部消える。
pdfmetrics.registerFontFamily(MINCHO, normal=MINCHO, bold=GOTHIC,
                              italic=MINCHO, boldItalic=GOTHIC)

ACCENT = colors.HexColor("#477d11")
TEXT = colors.HexColor("#221c18")
DIM = colors.HexColor("#6d6259")
RULE = colors.HexColor("#dfe4d5")
SOFT = colors.HexColor("#f4fbea")

S = {
    "title": ParagraphStyle("title", fontName=GOTHIC, fontSize=24, leading=30, textColor=TEXT),
    "tag": ParagraphStyle("tag", fontName=MINCHO, fontSize=12, leading=18,
                          textColor=ACCENT, spaceAfter=9),
    "meta": ParagraphStyle("meta", fontName=GOTHIC, fontSize=8, leading=13, textColor=DIM),
    "h": ParagraphStyle("h", fontName=GOTHIC, fontSize=10.5, leading=15, textColor=ACCENT,
                        spaceBefore=8, spaceAfter=3),
    "body": ParagraphStyle("body", fontName=MINCHO, fontSize=9.5, leading=14.5, textColor=TEXT),
    "note": ParagraphStyle("note", fontName=MINCHO, fontSize=8, leading=13, textColor=DIM),
    "cell": ParagraphStyle("cell", fontName=MINCHO, fontSize=8.5, leading=13, textColor=TEXT),
    "cellh": ParagraphStyle("cellh", fontName=GOTHIC, fontSize=8.5, leading=13, textColor=TEXT),
    "step": ParagraphStyle("step", fontName=GOTHIC, fontSize=9, leading=13,
                           textColor=TEXT, alignment=TA_CENTER),
    "arrow": ParagraphStyle("arrow", fontName=GOTHIC, fontSize=7.5, leading=11,
                            textColor=ACCENT, alignment=TA_CENTER),
}

W = 170 * mm


def P(t, s="body"):
    return Paragraph(t, S[s])


def table(rows, widths, header=False):
    data = [[Paragraph(c, S["cellh" if (header and r == 0) else "cell"]) for c in row]
            for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths, hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), SOFT),
                  ("LINEBELOW", (0, 0), (-1, 0), 0.8, ACCENT)]
    t.setStyle(TableStyle(style))
    return t


def box(text):
    t = Table([[Paragraph(text, S["cell"])]], colWidths=[W], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
    ]))
    return t


def flow(steps):
    rows = []
    for i, s in enumerate(steps):
        if i:
            rows.append([Paragraph("↓", S["arrow"])])
        rows.append([Paragraph(s, S["step"])])
    t = Table(rows, colWidths=[W], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("TOPPADDING", (0, 0), (0, 0), 6),
        ("BOTTOMPADDING", (0, -1), (0, -1), 6),
    ]))
    return t


def build():
    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=13 * mm, bottomMargin=11 * mm,
        title="ココリス（cocoris）企画書",
        author="都知事杯オープンデータ・ハッカソン2026",
    )

    f = [
        P("ココリス", "title"),
        P("あなたのいつもの場所を、覚えている。", "tag"),
        P("都知事杯オープンデータ・ハッカソン 2026 ／ 2026-08-21", "meta"),
        Spacer(1, 3 * mm),

        box("災害の種類も、見るべき地図も多すぎる。<br/>"
            "ココリスは<b>あなたがよく行く場所だけ</b>を1枚にまとめ、"
            "<b>逃げるならどこへ行くのか</b>まで出すWebアプリ。時刻も災害種別も選ばせない。<br/>"
            '<font color="#477d11"><b>https://cocoris.pages.dev</b></font>　'
            "サンプルデータですぐ試せます"),

        P("どう動くか", "h"),
        flow([
            "位置履歴を読み込む／よく行く場所を登録する（サンプルでも試せる）",
            "その場所の町丁目のハザードを引く（建物倒壊・火災・出火）",
            "全時間帯を積分して1つのスコアにする",
            "<b>1枚のランキング。各行に「どこへ逃げるか」まで出る</b>",
        ]),
        Spacer(1, 2 * mm),
        P("<b>時刻も災害種別も選ばせない。</b>24時間ぶんの順位を順に見るのは実用的でないため、"
          "全時間帯を積分して「1週間あたり、危険度で重み付けした滞在時間」を出す。", "body"),
        table([
            ["自宅（町屋1丁目）", "週69.7時間 × 危険度0.981（都内100位） = <b>51.7</b>"],
            ["大学（東大構内）", "週34.9時間 × 危険度0.022（都内5080位） = <b>0.2</b>"],
        ], [36 * mm, W - 36 * mm]),
        P("長くいるから危ないのではなく、<b>危ない場所に長くいるから危ない</b>。", "note"),

        P("結局どこへ逃げるのか", "h"),
        P("東京都は町丁目・町会単位で避難場所を1箇所ずつ割り当てている。<b>最寄りではない。</b>"
          "さらに広域避難が不要な<b>地区内残留地区</b>があり、23区の面積の約19%を占める。", "body"),
        table([
            ["荒川区町屋1丁目", "都立尾久の原公園一帯へ 徒歩12分"],
            ["渋谷区道玄坂2丁目", "<b>この地区は逃げなくてよい</b>（地区内残留地区）"],
            ["文京区本郷7丁目", "東京大学へ 徒歩1分"],
        ], [34 * mm, W - 34 * mm]),
        P("「逃げなくていい」と言えることが、公式データを正しく使っている証明になる。", "note"),

        P("既存の防災アプリとの違い", "h"),
        table([
            ["", "既存", "ココリス"],
            ["見る項目", "災害種別ごとに別々", "<b>1枚に一元化</b>"],
            ["避難先", "自分で調べる", "<b>公式の割当を提示</b>"],
        ], [24 * mm, (W - 24 * mm) / 2, (W - 24 * mm) / 2], header=True),

        P("使うデータ", "h"),
        P("東京都「地域危険度」（5,192町丁目）／ 東京消防庁「町丁目別 出火危険度」／ "
          "東京都「避難場所等の指定（第9回）」／ 国土地理院「地理院タイル」", "body"),
        P("町丁目名の表記ゆれを正規化して99.6%を結合。公表の5段階ランクは使わず、"
          "危険量の連続値と都内順位からスコアを引き直している。", "note"),

        P("プライバシー", "h"),
        P("<b>位置履歴は端末から出ない。</b>判定も避難場所の割当もブラウザ内で完結し、"
          "バックエンドは無い。ただし地図の背景は表示範囲が、経路探索は座標が提供元に渡る。", "body"),

        P("いまの状態", "h"),
        table([
            ["できている", "ランキングと避難経路、位置履歴の取り込み、手動登録。デプロイ済み"],
            ["残り", "<b>2分プレゼン動画の撮影</b>（本番 8/22-23、提出 8/23）"],
        ], [24 * mm, W - 24 * mm]),
        P("詳しい実装状況・データの扱い・動画の台本は docs/ 以下にあります。", "note"),
    ]

    doc.build(f)


if __name__ == "__main__":
    build()
    print(f"出力: {OUT}  ({os.path.getsize(OUT) / 1024:.0f} KB)")
