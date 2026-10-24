"""
截取房间页用到的中文字体 → public/fonts/wc-serif.woff2、wc-hand.woff2

中文字体一套十几 MB，没法整套给访客下载。这里只保留真正用这两种字体渲染的字：
  wc-serif（思源宋体 Black）：名字、花名、各块面板的标题、印章、底部导航的名字；爬塔页的标题、按钮、卡名
  wc-hand （霞鹜文楷）：白板上的技能、软木板上的日期、数据带；爬塔地图上的小字、卡牌描述
爬塔页另外截一套（wc-serif-spire / wc-hand-spire），房间页不用多下载。
其余文字仍走系统字体。改了 site.ts、spire.ts 里这些字段后要重新跑一次，否则新出现的字会退回系统字体。

两款都是 SIL OFL 1.1。截取子集算修改，按协议改了字体名（WC Serif / WC Hand）。

用法：
  python scripts/subset-fonts.py --serif D:/font-work/NotoSerifSC-Black.otf --hand D:/font-work/LXGWWenKai-Regular.ttf
依赖：fonttools、brotli
"""

import argparse
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'fonts'
ASCII = ''.join(chr(c) for c in range(0x20, 0x7F))


def fields(text: str, key: str) -> str:
    return ''.join(re.findall(rf"{key}:\s*'([^']*)'", text))


def collect():
    site = (ROOT / 'src/data/site.ts').read_text(encoding='utf-8')
    page = (ROOT / 'src/pages/studio.astro').read_text(encoding='utf-8')
    spire = (ROOT / 'src/data/spire.ts').read_text(encoding='utf-8')
    spire_js = (ROOT / 'src/scripts/spire/main.ts').read_text(encoding='utf-8')
    hobbies = ''.join(re.findall(r"hobbies:\s*\[([^\]]*)\]", site))
    titles = ''.join(re.findall(r'class="p-title">([^<]*)<', page))
    serif = (
        fields(site, 'name')
        + fields(site, 'callsign')
        + fields(site, 'stamp')
        + fields(page, 'label')
        + fields(page, 'thing')
        + titles
        + '正在开灯下一样「」·—→'
    )
    hand = fields(site, 'item') + fields(site, 'date') + fields(site, 'label') + '第站一路走过来的出发前检查单全部年个✓'
    # 爬塔页单独一套，免得房间页多下载它用不到的字
    spire_serif = (
        fields(site, 'name')
        + fields(site, 'callsign')
        # 页面上用宋体的固定文字：横幅、按钮、标签
        + '选择你的角色只有一个生命金币现在在做老家初始遗物模型全栈鸭出发第一幕北图例'
        + '战斗胜利精英击败了「」卡牌已在牌组里普通罕见稀有攻击技能能力篝火噼啪作响。要做点什么？'
        + '宝箱点开一路上顺手做的小玩意件商人这些都不卖。想用的话，找他一起做。非卖品回到地图继续往上牌组换风格'
        + fields(spire, 'title')
        + fields(spire, 'foe')
        + fields(spire, 'label')
        + fields(spire, 'text')
        + fields(site, 'sub')
        + fields(site, 'award')
        + fields(site, 'item')
        + fields(site, 'label')
        + ''.join(re.findall(r"toast\(['`]([^'`$]*)", spire_js))
        + '遗物药水第层最后声音已复制已击败从头再爬机长宅家嘎？……头有点疼。别戳了，去爬塔吧。全部看完了谢谢你到这里'
    )
    spire_hand = (
        fields(spire, 'label')
        + fields(spire, 'date')
        + fields(spire, 'text')
        + hobbies
        + '现在墨线是真走过的路淡没岔起—从这里出发'
    )
    return [serif + ASCII, hand + ASCII, spire_serif + ASCII, spire_hand + ASCII]


def build(src: str, text: str, family: str, out: Path):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = TTFont(src)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    # 按 OFL 改名：家族名、全名、PostScript 名
    ps = family.replace(' ', '')
    table = font['name']
    for rec in list(table.names):
        if rec.nameID in (1, 4, 6, 16):
            value = ps if rec.nameID == 6 else family
            table.setName(value, rec.nameID, rec.platformID, rec.platEncID, rec.langID)
    font.flavor = 'woff2'
    font.save(out)
    print(f'{out.name}: {len(set(text))} 个字, {out.stat().st_size // 1024} KB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--serif', required=True)
    ap.add_argument('--hand', required=True)
    args = ap.parse_args()
    serif, hand, spire_serif, spire_hand = collect()
    OUT.mkdir(parents=True, exist_ok=True)
    build(args.serif, serif, 'WC Serif', OUT / 'wc-serif.woff2')
    build(args.hand, hand, 'WC Hand', OUT / 'wc-hand.woff2')
    build(args.serif, spire_serif, 'WC Serif', OUT / 'wc-serif-spire.woff2')
    build(args.hand, spire_hand, 'WC Hand', OUT / 'wc-hand-spire.woff2')


if __name__ == '__main__':
    main()
