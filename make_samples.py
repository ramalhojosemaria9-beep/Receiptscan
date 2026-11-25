#!/usr/bin/env python3
"""Generate realistic sample receipt images for testing/demo."""
import os
import random
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "samples")
os.makedirs(OUT, exist_ok=True)

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/dejavu/DejaVuSansMono.ttf",
]
def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


RECEIPTS = [
    {
        "file": "fuel_diesel.png",
        "merchant": "ROADRANGER FUEL STOP 118",
        "address": "I-80 EXIT 212, WALCOTT IA",
        "lines": [
            ("DATE: 05/14/2025  09:32   PUMP 04", None),
            ("", None),
            ("DIESEL B-2                  22.70G", None),
            ("  @ 3.599/GAL", None),
        ],
        "manufacturer": "DIESEL B-2  22.70G @ 3.599/GAL, date 05/14/2025, ROADRANGER FUEL STOP",
        "hints": {"unleaded", "pump no 4", "diesel exhaust fluid", "pilot travel center", "citgo"},
        "total": 87.89,
        "tax": 0.0,
    },
    {
        "file": "building_materials.png",
        "merchant": "BUILDER'S DEPOT",
        "address": "2400 INDUSTRIAL BLVD",
        "lines": [
            ("DATE: 02/03/2025            ", None),
            ("", None),
            ("PLYWOOD SHEATHING  12MM      4", "31.96"),
            ("CEMENT PORTLAND 94LB BAG     6", "41.40"),
            ("REBAR STEEL 12MM X 6M        8", "27.60"),
            ("DRYWALL 4X8 SHEET            4", "22.80"),
            ("SAFETY GLOVES                2", "9.00"),
        ],
        "manufacturer": "PLYWOOD, CEMENT PORTLAND BAGS, REBAR STEEL, DRYWALL, HOME HARDWARE",
        "hints": {"aggregate", "crushed stone", "home depot", "shingle", "asphalt"},
        "total": 133.95,
        "tax": 10.71,
    },
    {
        "file": "machinery_repairs.png",
        "merchant": "HEAVY EQUIPMENT PARTS CO",
        "address": "UNIT 7, MECHANIC ROW",
        "lines": [
            ("DATE: 11/04/2025            ", None),
            ("", None),
            ("HYDRAULIC HOSE KIT           1", "84.50"),
            ("BEARING UNIT 6204            2", "46.00"),
            ("OIL FILTER EXCAVATOR         1", "18.75"),
            ("WELDING ROD PK               3", "12.30"),
        ],
        "manufacturer": "HYDRAULIC HOSE, BEARING, OIL FILTER EXCAVATOR, SPARE PARTS WORKSHOP",
        "hints": {"gearbox", "tracks", "undercarriage", "bucket teeth", "tool hire"},
        "total": 161.55,
        "tax": 14.54,
    },
    {
        "file": "travel_hotel.png",
        "merchant": "JUNCTION HOTEL & SUITES",
        "address": "55 MAIN ST, SPRINGFIELD",
        "lines": [
            ("DATE: 03/21/2025  CHECK-IN ", None),
            ("", None),
            ("ROOM RATE X2 NIGHTS", "238.00"),
            ("CITY TAX", "14.28"),
            ("PARKING - CAR PARK B", "24.00"),
        ],
        "manufacturer": "ROOM RATE 2 NIGHTS, PARKING CAR PARK, JUNCTION HOTEL",
        "hints": {"tolls", "uber ride", "airbnb", "rental car", "check in"},
        "total": 276.28,
        "tax": 14.28,
    },
    {
        "file": "groceries.png",
        "merchant": "GREEN VALLEY GROCERY",
        "address": "88 MARKET STREET",
        "lines": [
            ("DATE: 04/02/2025            ", None),
            ("", None),
            ("BREAD WHOLEGRAIN             1", "3.49"),
            ("MILK 2L                      2", "4.50"),
            ("EGGS DOZEN                   1", "4.25"),
            ("COFFEE 250G                  1", "8.99"),
            ("FRUIT PRODUCE MIX            1", "6.80"),
        ],
        "manufacturer": "BREAD, MILK, EGGS, COFFEE, FRUIT - GROCERY SUPERMARKET",
        "hints": {"dairy", "bakery", "kroger", "deli", "lunch"},
        "total": 28.03,
        "tax": 2.10,
    },
    {
        "file": "diesel_fleet.png",
        "merchant": "TEXACO TRUCK STOP",
        "address": "HIGHWAY 9 NORTH",
        "lines": [
            ("DATE: 05/28/2025            ", None),
            ("", None),
            ("UNLEADED REGULAR        12.5G", None),
            ("DIESEL PREMIUM         41.0G", None),
        ],
        "manufacturer": "TEXACO TRUCK STOP, DIESEL 41 litres, FUEL",
        "hints": {"fuel filter", "pump"},
        "total": 96.42,
        "tax": 0.0,
    },
]

PLACEHOLDERS = ["CREW SITE OFFICE", "FLEET ACCOUNT", "SITE WEST", "YARD 2"]

def pick_more(hints):
    return random.sample(sorted(hints), min(3, len(hints)))

for spec in RECEIPTS:
    more = pick_more(spec["hints"])
    text_lines = [
        ("", None),
        (spec["merchant"], None),
        (spec["address"], None),
        ("TEL 555-0142  RECEIPT #" + str(random.randint(10000, 99999)), None),
        ("", None),
    ] + spec["lines"] + [
        ("", None),
    ]
    for kw in more:
        text_lines.append((f"NOTE: {kw.upper()}", None))

    subtotal = spec["total"] - spec["tax"]
    W, H = 620, 100 + 30 * len(text_lines) + 150
    img = Image.new("RGB", (W, H), "#f6f4ef")
    draw = ImageDraw.Draw(img)
    font_big = load_font(26)
    font = load_font(19)
    font_small = load_font(15)

    y = 20

    def center(t, y, f):
        w = draw.textlength(t, font=f)
        draw.text(((W - w) / 2, y), t, fill="#1a1a1a", font=f)

    first = True
    for line, amt in text_lines:
        if first:
            center(line, y, font_big)
            first = False
        else:
            f = font if not amt else font
            draw.text((30, y), line, fill="#1a1a1a", font=f)
            if amt:
                aw = draw.textlength(amt, font=f)
                draw.text((W - 30 - aw, y), amt, fill="#1a1a1a", font=f)
        y += 28

    y += 10
    draw.text((30, y), "SUBTOTAL", fill="#1a1a1a", font=font)
    a = f"{subtotal:.2f}"; aw = draw.textlength(a, font=font)
    draw.text((W - 30 - aw, y), a, fill="#1a1a1a", font=font)
    y += 30
    if spec["tax"]:
        draw.text((30, y), "TAX", fill="#1a1a1a", font=font)
        a = f"{spec['tax']:.2f}"; aw = draw.textlength(a, font=font)
        draw.text((W - 30 - aw, y), a, fill="#1a1a1a", font=font)
        y += 30
    draw.line([(30, y + 4), (W - 30, y + 4)], fill="#333", width=2)
    y += 12
    draw.text((30, y), "GRAND TOTAL", fill="#111", font=font_big)
    a = f"{spec['total']:.2f}"; aw = draw.textlength(a, font=font_big)
    draw.text((W - 30 - aw, y), a, fill="#111", font=font_big)
    y += 40
    center(f"CASH ${spec['total'] + 10:.2f}", y, font_small)
    y += 24
    center("THANK YOU FOR YOUR VISIT", y, font_small)

    pass
    path = os.path.join(OUT, spec["file"])
    img.save(path)
    print("wrote", path)
