# -*- coding: utf-8 -*-
"""町丁目名の正規化。地域危険度(都市整備局) と 出火危険度(東京消防庁) を結合するためのもの。

この2つは同じ町丁目を別の表記で書いている。実測した差分は:
  - 丁目が 漢数字(消防庁) / 全角算用数字(危険度)
  - 消防庁側は全角スペースで右詰めパディング
  - 郡名(西多摩郡)が危険度側にだけ付く
  - ヶ / ケ の揺れ、渕 / 淵 の異体字
  - 千代田区の「神田○○町」と「○○町」
これらを潰すと結合率 98.57% -> 99.58%。残る22件は区画整理による実体差で、
正規化では解けない（呼び出し側でデータ無しとして扱うこと）。
"""
import re
import unicodedata

KANJI = {"〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
         "六": 6, "七": 7, "八": 8, "九": 9}

CHOME_KANJI = re.compile(r"([〇一二三四五六七八九十]+)丁目")
GUN = re.compile(r"^(西多摩郡|南多摩郡|北多摩郡|大島支庁|三宅支庁|八丈支庁|小笠原支庁)")
ITAIJI = str.maketrans({"ヶ": "ケ", "ガ": "ケ", "渕": "淵", "曾": "曽", "槇": "槙"})


def kanji_to_int(s: str) -> int:
    """丁目に出る範囲（〜99）の漢数字だけ扱う。十一 / 二十 / 二十三 など。"""
    if "十" not in s:
        n = 0
        for ch in s:
            n = n * 10 + KANJI[ch]
        return n
    tens, _, ones = s.partition("十")
    t = KANJI[tens] if tens else 1
    o = 0
    for ch in ones:
        o = o * 10 + KANJI[ch]
    return t * 10 + o


def normalize(name: str) -> str:
    s = unicodedata.normalize("NFKC", name)
    s = re.sub(r"\s+", "", s)
    s = CHOME_KANJI.sub(lambda m: f"{kanji_to_int(m.group(1))}丁目", s)
    s = GUN.sub("", s)
    s = s.translate(ITAIJI)
    s = s.replace("大字", "").replace("字", "")
    return s


def variants(key: str) -> set:
    """正規化しても割れる既知パターンを、別キー候補として展開する。"""
    v = {key}
    m = re.match(r"^千代田区神田(.+)$", key)
    if m:
        v.add("千代田区" + m.group(1))
    return v
