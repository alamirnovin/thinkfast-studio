from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

icon_dir = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
icon_dir.mkdir(parents=True, exist_ok=True)
image = Image.new("RGBA", (1024, 1024), (24, 63, 61, 255))
draw = ImageDraw.Draw(image)
draw.ellipse((170, 170, 854, 854), outline=(155, 200, 185, 255), width=18)
font = ImageFont.load_default(size=185)
draw.text((512, 512), "TFS", font=font, anchor="mm", fill=(247, 244, 238, 255), stroke_width=2, stroke_fill=(247, 244, 238, 255))
draw.ellipse((744, 284, 804, 344), fill=(232, 186, 104, 255))

image.save(icon_dir / "icon.png")
image.resize((32, 32), Image.Resampling.LANCZOS).save(icon_dir / "32x32.png")
image.resize((128, 128), Image.Resampling.LANCZOS).save(icon_dir / "128x128.png")
image.resize((256, 256), Image.Resampling.LANCZOS).save(icon_dir / "128x128@2x.png")
image.save(icon_dir / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
image.save(icon_dir / "icon.icns")
