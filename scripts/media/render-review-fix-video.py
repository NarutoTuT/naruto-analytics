from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/Users/liaoshenyuan/Desktop/naruto-analytics-clean")
OUT = Path("/private/tmp/naruto-review-access-fix.mp4")
FFMPEG = "/Users/liaoshenyuan/Library/Application Support/bilibili/ffmpeg/ffmpeg"
SCREEN = ROOT / "docs/app-store-media/review-access-form-redacted.png"
LONG_VIDEO = ROOT / "public/review/naruto-analytics-walkthrough.mp4"
TMP = Path("/private/tmp/naruto-review-fix-assets")
TMP.mkdir(exist_ok=True)

WIDTH, HEIGHT, FPS = 1280, 800, 10
FONT_ROOT = Path("/System/Library/Fonts/Supplemental")


def font(size: int, bold: bool = False):
    return ImageFont.truetype(str(FONT_ROOT / ("Arial Bold.ttf" if bold else "Arial.ttf")), size)


def card(title: str, lines: list[str], accent: str = "#ff9917") -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), "#0d2051")
    draw = ImageDraw.Draw(image)
    draw.text((72, 150), "NARUTO ANALYTICS", font=font(24, True), fill=accent)
    draw.text((72, 225), title, font=font(43, True), fill="white")
    y = 330
    for line in lines:
        draw.text((72, y), line, font=font(25), fill="#e2e9f6")
        y += 52
    return image


def framed(source: Path, title: str, lines: list[str]) -> Image.Image:
    raw = Image.open(source).convert("RGB")
    # Frames extracted from the earlier walkthrough include its old caption
    # band. Keep only the real app capture so the addendum cannot repeat or
    # contradict superseded statements.
    if raw.size == (1280, 800) and source.parent == TMP:
        raw = raw.crop((120, 65, 1160, 672))
    raw.thumbnail((1160, 585), Image.Resampling.LANCZOS)
    image = Image.new("RGB", (WIDTH, HEIGHT), "#0d2051")
    x = (WIDTH - raw.width) // 2
    image.paste(raw, (x, 60))
    draw = ImageDraw.Draw(image)
    draw.text((38, 18), title, font=font(23, True), fill="white")
    y = 670
    for line in lines:
        draw.text((38, y), line, font=font(22), fill="white")
        y += 34
    return image


for second, name in [(20, "today.png"), (140, "billing.png"), (160, "support.png")]:
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-ss", str(second), "-i", str(LONG_VIDEO), "-frames:v", "1", str(TMP / name)],
        check=True,
    )

slides = [
    (card("Review access fix verification", ["Production verification performed on October 15, 2026.", "Development store with synthetic data only.", "No real charge or email was created." ]), 5),
    (framed(SCREEN, "01  Restricted review access", ["The saved reviewer credential is masked in this capture.", "Synthetic-data confirmation remains required."]), 8),
    (card("Continue now succeeds", ["The submitted review form redirected to Merchant Agreement and DPA.", "The previous HTTP 403 did not recur in the production retest.", "Invalid input remains retryable; foreign origins remain blocked."], "#58c989"), 7),
    (framed(TMP / "today.png", "02  Daily Brief", ["The embedded report loads after review admission.", "Zero values are valid when no qualifying paid orders exist."]), 8),
    (framed(TMP / "billing.png", "03  Subscription", ["Public plan: USD 19 per month per store.", "Shopify determines 7-day trial eligibility and handles billing."]), 8),
    (framed(TMP / "support.png", "04  Support and privacy", ["Support, privacy, DPA and subscription management remain accessible.", "Merchant Agreement and DPA version: 2026-09-10-r2."]), 8),
    (card("Verification complete", ["Review form submission: PASS", "Embedded launch and report: PASS", "Subscription and support pages: PASS"], "#58c989"), 5),
]

process = subprocess.Popen(
    [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT)],
    stdin=subprocess.PIPE,
)
for image, seconds in slides:
    frame = image.tobytes()
    for _ in range(seconds * FPS):
        process.stdin.write(frame)
process.stdin.close()
if process.wait() != 0:
    raise SystemExit("ffmpeg failed")
print(OUT)
