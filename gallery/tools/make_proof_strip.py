#!/usr/bin/env python3
"""Render a transparent PNG across four backgrounds in one strip.

A transparent asset dropped straight into a README proves nothing — GitHub
composites it on white, so it looks identical to an opaque image with a white
background. The strip is the proof: same asset, four grounds, no halos.

This produced the strips in gallery entry 9. It lives here so that entry is
reproducible and so a contributor can match the format.

NOT part of pixeltamer's runtime. The skill itself is zero-dependency by
design — bash, stdlib Python, stdlib Node, nothing to install. This is a
gallery authoring tool and it needs Pillow:

    pip install pillow

Usage:
    python3 gallery/tools/make_proof_strip.py <out.png> <asset.png>

The four grounds are checkerboard, cream #FFF8E1, near-black #12161e, and a
saturated brand colour. Swap ELECTRIC for your own brand hex — the fourth panel
exists to catch the case where a brand-coloured asset disappears against a
brand-coloured background, which transparency does not save you from.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

# Booplex palette — the strip should look like it belongs to the brand.
CREAM = (255, 248, 225, 255)
CHARCOAL = (33, 33, 33, 255)
ELECTRIC = (0, 86, 212, 255)

PANEL = 420
PAD = 28


def checkerboard(size, sq=18, a=(255, 255, 255), b=(214, 214, 218)):
    img = Image.new("RGB", size, a)
    d = ImageDraw.Draw(img)
    w, h = size
    for y in range(0, h, sq):
        for x in range(0, w, sq):
            if ((x // sq) + (y // sq)) % 2:
                d.rectangle([x, y, x + sq - 1, y + sq - 1], fill=b)
    return img.convert("RGBA")


def trim(im):
    bb = im.getchannel("A").getbbox()
    return im.crop(bb) if bb else im


def scrub(im):
    """Zero RGB under fully-transparent pixels — stops naive flatteners ghosting."""
    r, g, b, a = im.split()
    zero = Image.new("L", im.size, 0)
    mask = a.point(lambda v: 255 if v == 0 else 0)
    for ch in (r, g, b):
        ch.paste(zero, mask=mask)
    return Image.merge("RGBA", (r, g, b, a))


def main():
    out_path, asset_path = Path(sys.argv[1]), Path(sys.argv[2])
    asset = scrub(trim(Image.open(asset_path).convert("RGBA")))
    fitted = asset.copy()
    fitted.thumbnail((PANEL - PAD * 2, PANEL - PAD * 2), Image.Resampling.LANCZOS)

    grounds = [
        ("checkerboard", None),
        ("light", CREAM),
        ("dark", (18, 22, 30, 255)),
        ("brand", ELECTRIC),
    ]

    strip = Image.new("RGBA", (PANEL * len(grounds), PANEL), CHARCOAL)
    for i, (_, colour) in enumerate(grounds):
        panel = checkerboard((PANEL, PANEL)) if colour is None \
            else Image.new("RGBA", (PANEL, PANEL), colour)
        x = (PANEL - fitted.width) // 2
        y = (PANEL - fitted.height) // 2
        panel.alpha_composite(fitted, dest=(x, y))
        strip.alpha_composite(panel, dest=(i * PANEL, 0))

    # Hairline separators so the four grounds read as deliberate panels.
    d = ImageDraw.Draw(strip)
    for i in range(1, len(grounds)):
        d.line([(i * PANEL, 0), (i * PANEL, PANEL)], fill=CHARCOAL, width=3)

    strip.convert("RGB").save(out_path, optimize=True)
    print(f"{out_path.name}  ({strip.width}x{strip.height})")


if __name__ == "__main__":
    main()
