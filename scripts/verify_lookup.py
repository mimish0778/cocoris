# -*- coding: utf-8 -*-
"""既知の座標を投げて、正しい町丁目とハザード値が返るかを目視確認する。

「渋谷駅の座標を投げたら危険度ランクが返る」= 土台完成 の確認用。
"""
import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
GJ = os.path.join(ROOT, "public", "data", "chochome.json")

CASES = [
    ("渋谷駅",       35.658034, 139.701636),
    ("東京駅",       35.681236, 139.767125),
    ("新宿駅",       35.690921, 139.700258),
    ("北千住駅",     35.749286, 139.804709),
    ("三軒茶屋駅",   35.643391, 139.668726),
    ("町屋駅(木密)", 35.744206, 139.782631),
    ("八王子駅",     35.655645, 139.338998),
    ("海の上(外れ値)", 35.500000, 139.900000),
]

fc = json.load(open(GJ, encoding="utf-8"))
geoms = [shape(f["geometry"]) for f in fc["features"]]
props = [f["properties"] for f in fc["features"]]
tree = STRtree(geoms)
print(f"読み込み: {len(geoms)} 町丁目\n")

for name, lat, lng in CASES:
    pt = Point(lng, lat)
    hit = None
    for i in tree.query(pt):
        if geoms[i].contains(pt):
            hit = props[i]
            break
    if hit is None:
        print(f"{name:14s} ({lat}, {lng}) -> 該当なし（市街化区域外 or 都外）")
        continue
    print(f"{name:14s} ({lat}, {lng}) -> {hit['city']}{hit['town']}")
    print(f"{'':14s}   地盤 {hit['ground']}")
    print(f"{'':14s}   建物倒壊 {hit['collapseQty']:>7} 棟/ha  ランク{hit['collapseRank']}")
    print(f"{'':14s}   火災     {hit['fireQty']:>7} 棟/ha  ランク{hit['fireRank']}")
    print(f"{'':14s}   総合     {hit['totalQty']:>7}        ランク{hit['totalRank']}"
          f"  活動困難係数 {hit['difficulty']}")
    print(f"{'':14s}   出火 冬夕 ランク{hit['shukkaWinterEve']} / 夏昼 ランク{hit['shukkaSummerNoon']}")
    print()
