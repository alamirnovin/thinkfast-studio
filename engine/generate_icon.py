from pathlib import Path
from PIL import Image, ImageDraw

icon_dir = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
icon_dir.mkdir(parents=True, exist_ok=True)
image = Image.new("RGBA", (1024, 1024), (18, 59, 53, 255))
draw = ImageDraw.Draw(image)

# Compact raster fallback matching the vector brain mark used by the app.
brain = (230, 235, 232, 255)
deep_green = (18, 59, 53, 255)
mint = (155, 200, 191, 255)
pink = (232, 160, 181, 255)
pale_pink = (247, 221, 228, 255)

draw.ellipse((225, 185, 805, 780), fill=brain)
draw.ellipse((160, 320, 520, 700), fill=brain)
draw.ellipse((504, 320, 864, 700), fill=brain)
draw.line((509, 236, 492, 322, 514, 381, 495, 470, 516, 560, 501, 650, 509, 702), fill=deep_green, width=28, joint="curve")
draw.line((245, 321, 348, 383, 445, 480, 583, 568), fill=mint, width=22, joint="curve")
draw.ellipse((217, 291, 277, 351), fill=pink)
draw.ellipse((327, 362, 369, 404), fill=mint)
draw.ellipse((427, 462, 463, 498), fill=mint)
draw.ellipse((535, 536, 658, 632), fill=pink)
draw.ellipse((583, 571, 609, 597), fill=pale_pink)

image.save(icon_dir / "icon.png")
image.resize((32, 32), Image.Resampling.LANCZOS).save(icon_dir / "32x32.png")
image.resize((128, 128), Image.Resampling.LANCZOS).save(icon_dir / "128x128.png")
image.resize((256, 256), Image.Resampling.LANCZOS).save(icon_dir / "128x128@2x.png")
image.save(icon_dir / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
image.save(icon_dir / "icon.icns")
