"""Build the composer font from the bundled Twemoji SVG artwork.

Run with nanoemoji==0.16.0 installed. The font shares the artwork license in
public/emoji/twemoji/LICENSE-GRAPHICS.
"""
from pathlib import Path
from shutil import copyfile
from subprocess import run
from tempfile import TemporaryDirectory

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

emoji = Path(__file__).resolve().parents[1] / "public" / "emoji"
with TemporaryDirectory(prefix="fw-emoji-") as temporary:
    work = Path(temporary)
    source = work / "source"
    source.mkdir()
    files = []
    for artwork in sorted((emoji / "twemoji").glob("*.svg")):
        named = source / f"emoji_u{artwork.stem}.svg"
        copyfile(artwork, named)
        files.append(str(named))

    build = work / "build"
    run(
        ["nanoemoji", "--family=FW Emoji", "--color_format=glyf_colr_1",
         f"--build_dir={build}", "--output_file=fw-emoji.ttf", *files],
        check=True,
    )
    font = TTFont(build / "fw-emoji.ttf", recalcTimestamp=False)
    for table in font["cmap"].tables:
        table.cmap.pop(0x20, None)
    variation = CmapSubtable.newSubtable(14)
    variation.platformID = 0
    variation.platEncID = 5
    variation.language = 0
    variation.cmap = {}
    variation.uvsDict = {0xFE0F: [(code, None) for code in sorted(font.getBestCmap())]}
    font["cmap"].tables.append(variation)
    font["name"].setName("Twemoji artwork by Twitter, Inc. and other contributors (CC BY 4.0)", 0, 3, 1, 0x409)
    font["name"].setName("https://creativecommons.org/licenses/by/4.0/", 14, 3, 1, 0x409)
    font["head"].created = font["head"].modified = 3855168000
    font.save(emoji / "fw-emoji.ttf")
