"""Generate KTC-branded Microsoft Store APPX tiles from the existing Desktop icon.

Runs on the GitHub Actions Windows runner before electron-builder.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "icon.png"
OUTPUT = ROOT / "build" / "appx"

if not SOURCE.is_file():
    raise SystemExit(f"Missing KTC icon: {SOURCE}")

logo = Image.open(SOURCE).convert("RGBA")
if logo.width < 64 or logo.height < 64:
    raise SystemExit(f"Logo source is too small ({logo.width}x{logo.height})")
if logo.getbbox() is None:
    raise SystemExit("Logo source contains no visible pixels")

OUTPUT.mkdir(parents=True, exist_ok=True)
SIZES = {
    "StoreLogo.png": (50, 50),
    "Square44x44Logo.png": (44, 44),
    "Square150x150Logo.png": (150, 150),
    "Wide310x150Logo.png": (310, 150),
    "LargeTile.png": (310, 310),
    "SmallTile.png": (71, 71),
}

for filename, (width, height) in SIZES.items():
    canvas = Image.new("RGBA", (width, height), (20, 68, 117, 255))
    side = min(width, height)
    padding = max(2, round(side * 0.12))
    max_dim = side - 2 * padding
    element = logo.copy()
    element.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    x = (width - element.width) // 2
    y = (height - element.height) // 2
    canvas.alpha_composite(element, (x, y))
    target = OUTPUT / filename
    canvas.save(target, format="PNG")
    print(f"Generated {target.relative_to(ROOT)} ({width}x{height})")
