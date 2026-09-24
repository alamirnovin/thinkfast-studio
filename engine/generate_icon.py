from pathlib import Path
from PIL import Image, ImageDraw

icon_dir = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
icon_dir.mkdir(parents=True, exist_ok=True)

# A self-contained source icon generated during every CI build.
image = Image.new("RGBA", (1024, 1024), (24, 63, 61, 255))
draw = ImageDraw.Draw(image)
draw.ellipse((170, 170, 854, 854), outline=(155, 200, 185, 255), width=18)
draw.polygon(
    [(355, 323), (669, 323), (669, 413), (559, 413),
     (559, 701), (465, 701), (465, 413), (355, 413)],
    fill=(247, 244, 238, 255),
)
draw.ellipse((656, 284, 748, 376), fill=(232, 186, 104, 255))

image.save(icon_dir / "icon.png")
image.resize((32, 32), Image.Resampling.LANCZOS).save(icon_dir / "32x32.png")
image.resize((128, 128), Image.Resampling.LANCZOS).save(icon_dir / "128x128.png")
image.resize((256, 256), Image.Resampling.LANCZOS).save(icon_dir / "128x128@2x.png")
image.save(
    icon_dir / "icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
image.save(icon_dir / "icon.icns")
