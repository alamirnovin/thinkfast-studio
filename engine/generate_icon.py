from pathlib import Path
from PIL import Image, ImageDraw

target = Path(__file__).resolve().parents[1] / "src-tauri" / "icons" / "icon.png"
target.parent.mkdir(parents=True, exist_ok=True)
image = Image.new("RGBA", (1024, 1024), (24, 63, 61, 255))
draw = ImageDraw.Draw(image)
draw.ellipse((170, 170, 854, 854), outline=(155, 200, 185, 255), width=18)
draw.polygon([(355, 323), (669, 323), (669, 413), (559, 413), (559, 701), (465, 701), (465, 413), (355, 413)], fill=(247, 244, 238, 255))
draw.ellipse((656, 284, 748, 376), fill=(232, 186, 104, 255))
image.save(target)
