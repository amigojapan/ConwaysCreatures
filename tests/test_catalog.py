"""Source fidelity and deduplication for the full imported Golly collection."""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from import_golly import parse_rle, parse_life, normalize, fingerprint, encode_rle, basic_patterns


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / 'ConwaysCreatures/patterns/catalog.json').read_text())
        cls.source = ROOT / 'ConwaysCreatures/patterns/golly'

    def test_rle_counts_empty_rows_and_large_gaps_are_preserved(self):
        cells = parse_rle('x = 100003, y = 102, rule = B3/S23\n2o100$100000b3o$bo!')
        self.assertEqual(cells, [(0,0),(1,0),(100000,100),(100001,100),(100002,100),(1,101)])
        self.assertEqual(parse_rle('x = 0, y = 0\n'+encode_rle(cells)), cells)
        self.assertEqual(parse_life('#Life 1.05\n#P -4 3\n**\n#P 6 -2\n.*\n'), [(11,0),(0,5),(1,5)])
        with self.assertRaisesRegex(ValueError, 'Unsupported rule'):
            parse_rle('x = 2, y = 2, rule = B36/S23\n2o$2o!')

    def test_fingerprints_ignore_rotations_reflections_and_translation(self):
        cells = [(0,0),(1,0),(1,1),(1,2),(2,2)]
        expected = fingerprint(cells)
        for reflected in (cells, [(-x,y) for x,y in cells]):
            for _ in range(4):
                self.assertEqual(fingerprint([(x+121,y-377) for x,y in reflected]), expected)
                reflected = [(-y,x) for x,y in reflected]
        self.assertNotEqual(fingerprint(cells[:-1]), expected)

    def test_every_card_matches_complete_original_source_and_no_duplicates(self):
        self.assertEqual(len(self.catalog), 193)
        seen = set()
        basics = dict(basic_patterns((self.source / 'Scripts/Python/glife/base.py').read_text()))
        for name, entry in self.catalog.items():
            with self.subTest(card=name):
                cells = parse_rle('x = 0, y = 0\n'+entry['rle'])
                digest = fingerprint(cells)
                self.assertEqual(digest, entry['geometry_sha256'])
                self.assertNotIn(digest, seen)
                seen.add(digest)
                self.assertEqual(len(cells), entry['population'])
                relative, _, symbol = entry['source'].partition('#')
                path = self.source / relative
                raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), entry['source_sha256'])
                if symbol and 'base.py' in relative:
                    expected = normalize(basics[symbol])
                elif symbol:
                    # The constructed gun is tested by behavior in life.test.cjs.
                    continue
                elif path.suffix == '.lif':
                    expected = parse_life(raw.decode())
                else:
                    expected = parse_rle(raw.decode())
                self.assertEqual(cells, expected)

    def test_import_report_accounts_for_every_life_file(self):
        report = json.loads((ROOT / 'ConwaysCreatures/patterns/import-report.json').read_text())
        self.assertEqual(len(report['duplicates']), 1)
        self.assertEqual(report['duplicates'][0]['name'], 'Rabbits')
        accounted = {item['source'].split('#')[0] for kind in ('included','excluded','duplicates') for item in report[kind]}
        for path in (self.source / 'Life').rglob('*'):
            if path.is_file():
                name = str(path.relative_to(self.source))
                self.assertTrue(name in accounted or any(s.startswith(name + '/') for s in accounted), name)
        self.assertEqual(len(report['excluded']), 14)


if __name__ == '__main__':
    unittest.main()
