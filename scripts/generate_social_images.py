#!/usr/bin/env python3
"""Genera assets sociales desde reports/daily_growth_post.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Tuple

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
INPUT_JSON = ROOT / "reports" / "daily_growth_post.json"
OUTPUT_DIR = ROOT / "reports" / "social"

BG_COLOR = (10, 10, 10)
TEXT_COLOR = (245, 245, 245)
ACCENT_COLOR = (255, 204, 0)


def load_stats() -> Dict[str, int]:
    fallback = {
        "totalSignals": 0,
        "fraudCount": 0,
        "spamCount": 0,
        "debtCollectionCount": 0,
    }
    if not INPUT_JSON.exists():
        return fallback

    try:
        payload = json.loads(INPUT_JSON.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return fallback

    data = {}
    for key, default in fallback.items():
        value = payload.get(key, default)
        data[key] = int(value) if isinstance(value, (int, float, str)) and str(value).isdigit() else default
    return data


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_card(filename: str, size: Tuple[int, int], stats: Dict[str, int]) -> None:
    width, height = size
    image = Image.new("RGB", size, BG_COLOR)
    draw = ImageDraw.Draw(image)

    title_f = font(max(36, width // 18), bold=True)
    subtitle_f = font(max(22, width // 34))
    number_f = font(max(84, width // 7), bold=True)
    category_title_f = font(max(20, width // 52), bold=True)
    label_f = font(max(26, width // 40), bold=True)
    value_f = font(max(32, width // 30), bold=True)
    footer_f = font(max(20, width // 52))

    left = int(width * 0.08)
    top = int(height * 0.08)

    draw.text((left, top), "Alerta Número MX", fill=TEXT_COLOR, font=title_f)
    draw.text((left, top + int(height * 0.08)), "Señales telefónicas monitoreadas", fill=TEXT_COLOR, font=subtitle_f)

    line_y = top + int(height * 0.145)
    draw.line((left, line_y, left + int(width * 0.36), line_y), fill=ACCENT_COLOR, width=max(4, width // 260))

    main_number_y = top + int(height * 0.19)
    draw.text((left, main_number_y), f"{stats['totalSignals']}", fill=ACCENT_COLOR, font=number_f)

    categories = [
        ("Fraude", stats["fraudCount"]),
        ("Spam", stats["spamCount"]),
        ("Cobranza", stats["debtCollectionCount"]),
    ]

    box_top = top + int(height * 0.50)
    box_width = int(width * 0.84)
    row_height = int(height * 0.10)
    title_gap = int(height * 0.015)
    category_title = "Principales categorías detectadas"
    draw.rounded_rectangle(
        (
            left,
            box_top,
            left + box_width,
            box_top + row_height * len(categories) + int(height * 0.02) + title_gap + int(height * 0.05),
        ),
        radius=max(14, width // 80),
        outline=(80, 80, 80),
        width=max(2, width // 450),
    )

    title_y = box_top + int(height * 0.018)
    draw.text((left + int(width * 0.03), title_y), category_title, fill=TEXT_COLOR, font=category_title_f)

    for idx, (label, value) in enumerate(categories):
        y = box_top + int(height * 0.02) + int(height * 0.05) + title_gap + idx * row_height
        draw.text((left + int(width * 0.03), y), label, fill=TEXT_COLOR, font=label_f)
        value_text = f"{value}"
        text_bbox = draw.textbbox((0, 0), value_text, font=value_f)
        val_w = text_bbox[2] - text_bbox[0]
        draw.text((left + box_width - val_w - int(width * 0.03), y), value_text, fill=ACCENT_COLOR, font=value_f)

    footer = "Consulta gratuita • Sin registro"
    footer_bbox = draw.textbbox((0, 0), footer, font=footer_f)
    footer_w = footer_bbox[2] - footer_bbox[0]
    draw.text(((width - footer_w) // 2, int(height * 0.92)), footer, fill=TEXT_COLOR, font=footer_f)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT_DIR / filename, format="PNG")


def main() -> None:
    stats = load_stats()
    draw_card("daily-post.png", (1200, 1200), stats)
    draw_card("story.png", (1080, 1920), stats)
    draw_card("whatsapp-share.png", (1200, 630), stats)
    print("Generated social images in reports/social")


if __name__ == "__main__":
    main()
