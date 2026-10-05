#!/usr/bin/env python3
"""Build the browser deck and vector-rendered cards from complete Life patterns.

Requires Python packages pycairo and qrcode for artwork; --data-only uses stdlib.
Each distinct pattern has one card with a stable name and QR payload.
"""
import argparse
import hashlib
import html as html_module
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'ConwaysCreatures'


def rotate(rows):
    return [''.join(row[x] for row in reversed(rows)) for x in range(len(rows[0]))]


def card_image_path(card):
    folder = '' if card['width'] < 40 and card['height'] < 40 else 'giants/'
    return folder + card['id'] + '.png'


def load_cards():
    from import_golly import parse_rle, fingerprint
    catalog = json.loads((APP / 'patterns/catalog.json').read_text())
    identities = json.loads((APP / 'patterns/cards.json').read_text())
    seen = set()
    cards = []
    for name, identity in identities.items():
        pattern = catalog[identity['pattern']]
        cells = parse_rle('x = 0, y = 0, rule = B3/S23\n' + pattern['rle'])
        geometry = fingerprint(cells)
        if geometry in seen:
            raise ValueError(f'Duplicate pattern: {name}')
        seen.add(geometry)
        assert len(cells) == pattern['population']
        assert max(x for x, y in cells) + 1 == pattern['width']
        assert max(y for x, y in cells) + 1 == pattern['height']
        cards.append(dict(pattern, id=name, title=pattern['name'], cells=cells))
    return cards


def build_data(cards):
    data = {c['id']: {k: c[k] for k in ('name', 'width', 'height', 'rle', 'population', 'category', 'source')}
            for c in cards}
    for card in cards:
        data[card['id']]['image'] = 'images/cards/' + card_image_path(card)
    serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    version = hashlib.sha256(serialized.encode()).hexdigest()[:16]
    js = '// Generated from the complete Golly source layouts by tools/build_cards.py.\n'
    js += 'var creatureDeckVersion = ' + json.dumps(version) + ';\n'
    js += 'var creatures = ' + serialized + ';\n'
    js += 'var creatureCategories = {}, creatureSources = {}, creaturePatternNames = {};\n'
    js += 'Object.entries(creatures).forEach(([id, p]) => { creatureCategories[id] = p.category; creatureSources[id] = p.source; creaturePatternNames[id] = p.name; });\n'
    for path in (APP / 'golly-patterns.js', ROOT / 'golly-patterns.js'):
        path.write_text(js)
    page = APP / 'qr.html'
    html = page.read_text()
    # Keep the game, engine and data in one uploadable HTML file.
    embedded = '<script id="creature-deck">\n' + js.replace('</', '<\\/') + '</script>'
    html, count = re.subn(r'<script id="creature-deck">[\s\S]*?</script>', lambda match: embedded, html)
    if count != 1:
        raise ValueError('Missing embedded deck in qr.html')
    game = (APP / 'game.js').read_text().replace('DECK_VERSION', version)
    engine = (APP / 'life-engine.js').read_text()
    scripts = '<script id="life-engine">\n' + engine + '</script>\n<script id="game-code">\n' + game + '</script>'
    html = re.sub(r'<script id="life-engine">[\s\S]*?</script>\s*', '', html)
    html, count = re.subn(r'<script(?: id="game-code")?>[\s\S]*?</script>', lambda match: scripts, html)
    if count != 1:
        raise ValueError('Missing game code in qr.html')
    page.write_text(html)


def draw_card(ctx, card, qr):
    """Draw text, QR modules and cell geometry directly; no bitmap resampling."""
    def color(hex_color):
        ctx.set_source_rgb(*(int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)))

    def rect(x, y, w, h, fill):
        color(fill)
        ctx.rectangle(x, y, w, h)
        ctx.fill()

    def text(x, y, value, size=20, fill='dbeafe', bold=False):
        import cairo
        color(fill)
        ctx.select_font_face('DejaVu Sans', cairo.FONT_SLANT_NORMAL,
                             cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(size)
        width = ctx.text_extents(value).width
        if width > 540:
            ctx.set_font_size(size * 540 / width)
        ctx.move_to(x, y)
        ctx.show_text(value)

    rect(0, 0, 600, 900, '081226')
    text(30, 58, "CONWAY'S CREATURES", 27, '8bd9f5', True)
    text(30, 87, card['category'], 18, '8ba4be')
    # Wrap long official names instead of truncating them or inventing aliases.
    words = card['title'].split()
    title_lines = ['']
    for word in words:
        if len(title_lines[-1]) + len(word) > 34:
            title_lines.append(word)
        else:
            title_lines[-1] += (' ' if title_lines[-1] else '') + word
    if len(title_lines) > 3:
        title_lines = title_lines[:2] + [' '.join(title_lines[2:])]
    for i, line in enumerate(title_lines):
        text(30, 123 + i * 23, line, 23, bold=True)
    # QR encodes the canonical source-derived card ID.
    module = min(8, 280 // len(qr))
    side = len(qr) * module
    left = (600 - side) // 2
    top = 193
    rect(left, top, side, side, 'ffffff')
    color('000000')
    for y, row in enumerate(qr):
        for x, live in enumerate(row):
            if live:
                ctx.rectangle(left + x * module, top + y * module, module, module)
    ctx.fill()
    text(30, 520, 'COMPLETE LIFE PATTERN', 18, '8ba4be', True)
    rect(30, 540, 540, 215, '101e32')
    size = min(18, 510 / card['width'], 190 / card['height'])
    left = (600 - size * card['width']) / 2
    top = 647.5 - size * card['height'] / 2
    color('38bdf8')
    for x, y in card['cells']:
        # At overview scale tiny cells share pixels; the game retains every cell.
        ctx.rectangle(left + x * size, top + y * size, max(.7, size * .87), max(.7, size * .87))
    ctx.fill()
    text(30, 782, f"{card['width']} x {card['height']} | {card['population']:,} live cells", 18)
    text(30, 814, 'Conway B3/S23 | Complete original layout', 17)
    text(30, 844, 'Golly: ' + card['source'], 14, '8ba4be')
    text(30, 874, 'Full pattern preserved. Zoom in the game for details.', 15, '8ba4be')


def build_artwork(cards, with_pdf=False):
    import cairo
    import qrcode
    output = APP / 'images/cards'
    # Nine vector cards per A4 page. Render one card at a time to bound memory.
    pdf_path = output / 'ConwaysCreatures-card-deck.pdf'
    pdf = cairo.PDFSurface(str(pdf_path), 595.28, 841.89) if with_pdf else None
    pdf_ctx = cairo.Context(pdf) if pdf else None
    scale = min((595.28 - 24) / 1800, (841.89 - 24) / 2700)
    for index, card in enumerate(cards):
        qr = qrcode.QRCode(box_size=8, border=4)
        qr.add_data(card['id'])
        qr.make(fit=True)
        matrix = qr.get_matrix()
        recording = cairo.RecordingSurface(cairo.CONTENT_COLOR_ALPHA, (0, 0, 600, 900))
        draw_card(cairo.Context(recording), card, matrix)
        png = cairo.ImageSurface(cairo.FORMAT_RGB24, 600, 900)
        ctx = cairo.Context(png)
        ctx.set_source_surface(recording)
        ctx.paint()
        image_path = output / card_image_path(card)
        image_path.parent.mkdir(parents=True, exist_ok=True)
        png.write_to_png(str(image_path))
        png.finish()
        if pdf_ctx:
            slot = index % 9
            pdf_ctx.save()
            pdf_ctx.translate(12 + (slot % 3) * 600 * scale, 12 + (slot // 3) * 900 * scale)
            pdf_ctx.scale(scale, scale)
            pdf_ctx.set_source_surface(recording)
            pdf_ctx.paint()
            pdf_ctx.restore()
            if slot == 8 or index == len(cards) - 1:
                pdf_ctx.show_page()
        if (index + 1) % 500 == 0:
            print(f'Rendered {index + 1}/{len(cards)} cards', flush=True)
    if pdf:
        pdf.finish()


def build_gallery(cards):
    small = [card for card in cards if card['width'] < 40 and card['height'] < 40]
    giants = [card for card in cards if card['width'] >= 40 or card['height'] >= 40]
    write_gallery(small, APP / 'images/cards/index.html', '../../qr.html',
                  'Small Golly cards', 'Width and height are both under 40 cells.',
                  f'<a href="giants/">Giants ({len(giants)} cards)</a>')
    write_gallery(giants, APP / 'images/cards/giants/index.html', '../../../qr.html',
                  'Golly giants', 'Width or height is 40 cells or more.',
                  f'<a href="../">Small cards ({len(small)} cards)</a>')


def write_gallery(cards, path, game_url, title, description, navigation):
    escape = html_module.escape
    items = []
    for card in sorted(cards, key=lambda c: c['title'].lower()):
        name, identity = escape(card['title']), card['id']
        items.append(f'<article><a href="{identity}.png"><img loading="lazy" src="{identity}.png" alt="{name}" width="240" height="360"></a>'
                     f'<h2>{name}</h2><p>{escape(card["category"])} · {card["width"]} × {card["height"]} · {card["population"]:,} cells</p>'
                     f'<p><a href="{game_url}?card={identity}">Use in game</a></p></article>')
    gallery = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>TITLE</title><style>body{margin:24px;background:#081226;color:#eef5ff;font-family:system-ui}a{color:#8bd9f5}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}article{padding:16px;background:#101e32;border-radius:12px}h2{font-size:18px;overflow-wrap:anywhere}img{max-width:100%;height:auto}input{padding:12px;width:min(90%,500px);margin-bottom:24px;font-size:18px}</style>
<h1>TITLE</h1><p>COUNT unique complete layouts from Golly. DESCRIPTION</p><p>NAVIGATION · <a href="GAME_URL">Back to game</a></p>
<input type="search" aria-label="Find a pattern" placeholder="Find a pattern…" oninput="for(const card of document.querySelectorAll('article'))card.hidden=!card.textContent.toLowerCase().includes(this.value.toLowerCase())"><main>ITEMS</main></html>'''
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(gallery.replace('TITLE', escape(title)).replace('DESCRIPTION', escape(description))
                    .replace('NAVIGATION', navigation).replace('GAME_URL', game_url)
                    .replace('COUNT', str(len(cards))).replace('ITEMS', '\n'.join(items)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-only', action='store_true')
    parser.add_argument('--pdf', action='store_true', help='Also regenerate the printable PDF')
    parser.add_argument('--clean', action='store_true', help='Remove obsolete card PNGs after rebuilding')
    args = parser.parse_args()
    cards = load_cards()
    build_data(cards)
    if not args.data_only:
        build_artwork(cards, with_pdf=args.pdf)
        build_gallery(cards)
        if args.clean:
            output = APP / 'images/cards'
            keep = {output / card_image_path(card) for card in cards}
            for path in output.rglob('*.png'):
                if path not in keep:
                    path.unlink()
    print(f'Built {len(cards)} cards.')
