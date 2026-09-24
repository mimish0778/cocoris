# -*- coding: utf-8 -*-
"""避難場所の割当データを、ブラウザに同梱できる1つのJSONに落とす。

  東京都「震災時火災における避難場所等の一覧」（第9回指定・令和4年9月1日適用）
  東京都オープンデータカタログ掲載分は CC BY 4.0。取得元はこちらを正とする:
  https://catalog.data.metro.tokyo.lg.jp/dataset/t000008d0000000013
  ① 割当区域   どの地域がどの避難場所へ行くか（261ポリゴン、合計631km²＝23区とほぼ一致）
  ② 避難場所   避難場所そのものの範囲（221ポリゴン）
  ③ 地区内残留地区  不燃化が進み、広域避難が不要な区域（40ポリゴン）
  -> public/data/evacuation.json

**「最寄りの避難場所」を計算してはいけない。**
東京都は町丁目・町会単位で避難場所を1箇所ずつ割り当てている（避難距離3km未満、
輻射熱を考慮して1人1㎡以上を確保する前提の計画）。最寄りとは限らない。
さらに地区内残留地区では避難そのものが不要で、そこで「最寄りへ逃げろ」と出すのは誤指示になる。
23区の面積の約19%（116km²）が地区内残留地区。

なお国土地理院の「指定緊急避難場所」データの災害種別◎は
「その場所自体が輻射熱の影響を受けない」という意味であって、
「そこへ行くべき」ではない。混同しないこと。
"""
import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import shapefile
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform as shp_transform

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "public", "data", "evacuation.json")

TF = Transformer.from_crs("EPSG:2451", "EPSG:4326", always_xy=True)
COORD_DIGITS = 5  # 約1m。避難場所の範囲を示すのに十分


def to_wgs84(geom):
    return shp_transform(lambda x, y, z=None: TF.transform(x, y), geom)


def round_coords(g):
    def r(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], COORD_DIGITS), round(c[1], COORD_DIGITS)]
        return [r(x) for x in c]
    g["coordinates"] = r(g["coordinates"])
    return g


def load(path, tolerance_m, props):
    """SHPを読んで簡略化し、WGS84のFeatureCollectionにする。

    props は (元のフィールド名 -> 出力キー) の対応。SHPごとにフィールド名が違う
    （避難場所NO/名前 と 避難場所番/避難場所名）ので外から渡す。
    """
    sf = shapefile.Reader(path, encoding="cp932")
    feats = []
    for s, rec in zip(sf.shapes(), sf.records()):
        g = shape(s.__geo_interface__)
        if not g.is_valid:
            g = g.buffer(0)
        g = g.simplify(tolerance_m, preserve_topology=True)
        gj = round_coords(json.loads(json.dumps(to_wgs84(g).__geo_interface__)))
        d = rec.as_dict()
        feats.append({
            "type": "Feature",
            "geometry": gj,
            "properties": {out: d[src] for src, out in props.items()},
        })
    return {"type": "FeatureCollection", "features": feats}


def find_shp(folder, expect_fields):
    """cp932のフォルダ名が化けるので、フィールド構成で目的のSHPを見分ける。"""
    import glob
    for p in sorted(glob.glob(os.path.join(RAW, folder, "*.shp"))):
        sf = shapefile.Reader(p, encoding="cp932")
        names = {f.name for f in sf.fields[1:]}
        if expect_fields <= names:
            return p
    raise FileNotFoundError(f"{folder} に {expect_fields} を持つSHPが無い")


def main():
    # 割当区域と避難場所は同じzipに入っていて、フィールド名だけが違う
    areas_shp = find_shp("hinan_basho_shp", {"避難場所NO", "名前"})
    sites_shp = find_shp("hinan_basho_shp", {"避難場所番", "避難場所名"})

    areas = load(areas_shp, 30, {"避難場所NO": "no", "名前": "name"})
    sites = load(sites_shp, 15, {"避難場所番": "no", "避難場所名": "name"})

    # 地区内残留地区は割当層に NO 301〜340 として入っており、行き先の避難場所を持たない。
    # 別レイヤを持たず、割当層に stay フラグを立てるだけで足りる。
    site_nos = {f["properties"]["no"] for f in sites["features"]}
    for f in areas["features"]:
        f["properties"]["stay"] = f["properties"]["no"] not in site_nos

    # 避難場所の代表点。経路の目的地に使う
    for f in sites["features"]:
        c = shape(f["geometry"]).representative_point()
        f["properties"]["lat"] = round(c.y, COORD_DIGITS)
        f["properties"]["lng"] = round(c.x, COORD_DIGITS)

    payload = {
        "source": "東京都「震災時火災における避難場所等の一覧」（CC BY 4.0）",
        "designation": "第9回（令和4年9月1日適用）",
        "note": (
            "割当は東京都が町丁目・町会単位で指定したもの。最寄りではない。"
            "地区内残留地区では広域避難そのものが不要。対象は区部中心で、多摩地域は含まれない。"
        ),
        "areas": areas,
        "sites": sites,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    import gzip
    raw = open(OUT, "rb").read()
    stay_n = sum(1 for f in areas["features"] if f["properties"]["stay"])
    print(f"割当区域 {len(areas['features'])}（うち地区内残留 {stay_n}） / 避難場所 {len(sites['features'])}")
    print(f"{OUT}: {len(raw)/1024:.0f} KB  gzip {len(gzip.compress(raw,6))/1024:.0f} KB")

    # stay でないのに行き先が無い割当があれば、それは異常
    orphan = [f["properties"]["name"] for f in areas["features"]
              if not f["properties"]["stay"] and f["properties"]["no"] not in site_nos]
    if orphan:
        print(f"⚠ 行き先の無い割当: {orphan}")


if __name__ == "__main__":
    main()
