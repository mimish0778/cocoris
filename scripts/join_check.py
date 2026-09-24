# -*- coding: utf-8 -*-
"""地域危険度(第9回) × 東京消防庁 出火危険度(第10回) の町丁目名結合率を実測する。

結合率が何％かを先に知ることが目的。合わなかった行は必ず標本を出す。
"""
import io
import os
import re
import sys
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")

from norm import normalize, variants  # noqa: E402


# ------------------------------------------------------------ 地域危険度
kikendo = {}
lines = open(os.path.join(RAW, "kikendo9.csv"), "rb").read().decode("cp932").splitlines()
for l in lines[1:]:
    c = l.split(",")
    key = normalize(c[0] + c[1])
    kikendo[key] = (c[0], c[1])
print("地域危険度 町丁目数:", len(lines) - 1, " ユニークキー:", len(kikendo))

# ------------------------------------------------------------ 出火危険度
import openpyxl  # noqa: E402

wb = openpyxl.load_workbook(os.path.join(RAW, "tfd_shukka_choChome.xlsx"), read_only=True)
ws = wb["Sheet1"]
tfd = {}
tfd_raw = []
for row in ws.iter_rows(min_row=4, values_only=True):
    if not row or not row[0]:
        continue
    raw = str(row[0])
    tfd_raw.append(raw)
    tfd[normalize(raw)] = raw
print("出火危険度 行数:", len(tfd_raw), " ユニークキー:", len(tfd))

# ------------------------------------------------------------ 結合
# 出火危険度側を、別キー候補も含めた索引に展開する
tfd_index = {}
for k in tfd:
    for v in variants(k):
        tfd_index.setdefault(v, k)

hit = set()          # 結合できた地域危険度キー
matched_tfd = set()  # 消費した出火危険度キー
for k in kikendo:
    for v in variants(k):
        if v in tfd_index:
            hit.add(k)
            matched_tfd.add(tfd_index[v])
            break

print()
print(f"結合成功: {len(hit)} / {len(kikendo)}  = {len(hit)/len(kikendo)*100:.2f}%  (地域危険度を母数)")
print(f"          {len(matched_tfd)} / {len(tfd)}  = {len(matched_tfd)/len(tfd)*100:.2f}%  (出火危険度を母数)")

only_k = sorted(set(kikendo) - hit)
only_t = sorted(set(tfd) - matched_tfd)
print(f"\n地域危険度にあって出火危険度に無い: {len(only_k)}")
for k in only_k[:30]:
    print("   ", k)
print(f"\n出火危険度にあって地域危険度に無い: {len(only_t)}")
for k in only_t[:30]:
    print("   ", k)

# 区市町村別に未結合を集計（どこで壊れているかを見る）
def city_of(k):
    m = re.match(r"(.+?[区市町村])", k)
    return m.group(1) if m else "?"


print("\n未結合の区市町村内訳（地域危険度側）:")
for c, n in Counter(city_of(k) for k in only_k).most_common(20):
    print(f"   {c}: {n}")
