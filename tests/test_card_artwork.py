"""Validate shipped card files and readable previews of small source patterns."""
import json
from pathlib import Path
import sys
import unittest
from PIL import Image
import qrcode
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from import_golly import parse_rle

class CardArtworkTests(unittest.TestCase):
    def test_every_card_exists_and_small_previews_match_cell_geometry(self):
        catalog = json.loads((ROOT / 'ConwaysCreatures/patterns/catalog.json').read_text())
        directory = ROOT / 'ConwaysCreatures/images/cards'
        self.assertEqual({p.stem for p in directory.rglob('*.png')}, set(catalog))
        for name, pattern in catalog.items():
            folder = directory if pattern['width'] < 40 and pattern['height'] < 40 else directory / 'giants'
            with self.subTest(card=name), Image.open(folder/(name+'.png')) as image:
                self.assertEqual(image.size, (600,900))
                image.load()
                qr = qrcode.QRCode(box_size=8, border=4)
                qr.add_data(name)
                qr.make(fit=True)
                matrix = qr.get_matrix()
                module = min(8, 280 // len(matrix))
                qr_left = (600 - len(matrix)*module) // 2
                for row_index, row in enumerate(matrix):
                    for column, black in enumerate(row):
                        pixel = image.getpixel((qr_left + column*module + module//2,
                                                193 + row_index*module + module//2))[:3]
                        self.assertEqual(pixel, (0,0,0) if black else (255,255,255), name)
                size = min(18, 510/pattern['width'], 190/pattern['height'])
                # At overview scale many source cells share pixels by design.
                if size < 3: continue
                cells = set(parse_rle('x = 0, y = 0\n'+pattern['rle']))
                left = (600-size*pattern['width'])/2
                top = 647.5-size*pattern['height']/2
                for y in range(pattern['height']):
                    for x in range(pattern['width']):
                        expected = (56,189,248) if (x,y) in cells else (16,30,50)
                        self.assertEqual(image.getpixel((int(left+(x+.4)*size), int(top+(y+.4)*size)))[:3], expected)

if __name__ == '__main__':
    unittest.main()
