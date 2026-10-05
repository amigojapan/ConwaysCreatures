#!/usr/bin/env python3
"""Import complete, unbounded B3/S23 patterns from a Golly distribution.

No connected-component extraction, resizing, sampling or cell-count limit.
Archive members, compressed RLE and Life 1.05 are supported. Unsupported
rules/topologies and executable generators are recorded in import-report.json.
"""
import argparse
import ast
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile

APP = Path(__file__).resolve().parents[1] / 'ConwaysCreatures'


def normalize(cells):
    cells = set(map(tuple, cells))
    if not cells:
        raise ValueError('Empty pattern')
    left = min(x for x, y in cells)
    top = min(y for x, y in cells)
    return sorted(((x-left, y-top) for x, y in cells), key=lambda p: (p[1], p[0]))


def fingerprint(cells):
    """Translation-, rotation- and reflection-invariant geometry hash."""
    hashes = []
    for reflected in (False, True):
        points = [(-x if reflected else x, y) for x, y in cells]
        for _ in range(4):
            hashes.append(hashlib.sha256(json.dumps(normalize(points), separators=(',', ':')).encode()).hexdigest())
            points = [(-y, x) for x, y in points]
    return min(hashes)


def encode_rle(cells):
    rows = {}
    for x, y in normalize(cells):
        rows.setdefault(y, []).append(x)
    output = []
    previous_y = 0
    def run(count, symbol):
        return (str(count) if count != 1 else '') + symbol
    for y, xs in rows.items():
        if y != previous_y:
            output.append(run(y - previous_y, '$'))
        previous_y = y
        x = i = 0
        while i < len(xs):
            if xs[i] > x:
                output.append(run(xs[i] - x, 'b'))
            start = xs[i]
            end = i + 1
            while end < len(xs) and xs[end] == xs[end-1] + 1:
                end += 1
            output.append(run(end - i, 'o'))
            x = start + end - i
            i = end
    return ''.join(output) + '!'


def parse_rle(text):
    lines = text.splitlines()
    header_index = next(i for i, line in enumerate(lines) if re.match(r'\s*x\s*=', line))
    header = lines[header_index]
    rule_match = re.search(r'\brule\s*=\s*(\S+)', header, re.I)
    rule = rule_match[1] if rule_match else 'B3/S23'
    if rule.lower() not in ('b3/s23', '23/3', 'life'):
        raise ValueError(f'Unsupported rule/topology: {rule}')
    body = ''.join(line.strip() for line in lines[header_index+1:] if not line.lstrip().startswith('#'))
    body = re.sub(r'\s+', '', body).split('!', 1)[0]
    x = y = cursor = 0
    cells = []
    for match in re.finditer(r'(\d*)([boA.$])', body):
        if match.start() != cursor:
            raise ValueError('Unsupported RLE token')
        cursor = match.end()
        count = int(match[1] or 1)
        token = match[2]
        if token == '$':
            y += count
            x = 0
        elif token in 'b.':
            x += count
        else:
            cells.extend((x+i, y) for i in range(count))
            x += count
    if cursor != len(body):
        raise ValueError('Unsupported trailing RLE data')
    return normalize(cells)


def parse_life(text):
    if not text.startswith('#Life 1.05'):
        raise ValueError('Unsupported Life format')
    cells = []
    origin_x = origin_y = y = 0
    for line in text.splitlines()[1:]:
        if line.startswith('#R') and line[2:].strip() not in ('23/3', 'B3/S23'):
            raise ValueError('Unsupported Life rule')
        if line.startswith('#P'):
            coords = list(map(int, line[2:].split())) or [0, 0]
            origin_x, origin_y = coords
            y = 0
        elif line.startswith('#'):
            continue
        else:
            if set(line) - {'.', '*'}:
                raise ValueError('Unsupported Life bitmap')
            cells.extend((origin_x+x, origin_y+y) for x, c in enumerate(line) if c == '*')
            y += 1
    return normalize(cells)


def step(cells):
    cells = set(cells)
    neighbors = Counter((x+dx, y+dy) for x, y in cells
                        for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy)
    return {p for p, n in neighbors.items() if n == 3 or (n == 2 and p in cells)}


def basic_patterns(text):
    """Read literal patterns from Python's AST without running Golly scripts."""
    for statement in ast.parse(text).body:
        if not isinstance(statement, ast.Assign) or not isinstance(statement.value, ast.Call):
            continue
        call = statement.value
        if not isinstance(call.func, ast.Name) or call.func.id != 'pattern':
            continue
        bitmap = ast.literal_eval(call.args[0])
        x0 = ast.literal_eval(call.args[1]) if len(call.args) > 1 else 0
        y0 = ast.literal_eval(call.args[2]) if len(call.args) > 2 else 0
        cells = {(x+x0, y+y0) for y, row in enumerate(bitmap.strip().splitlines())
                 for x, cell in enumerate(row) if cell == '*'}
        yield statement.targets[0].id, cells


def import_collection(distribution):
    source_root = APP / 'patterns/golly'
    source_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(distribution / 'Patterns/Life', source_root / 'Life', dirs_exist_ok=True)
    for file in ('Scripts/Python/glife/base.py', 'Scripts/Python/glife/gun30.py', 'License.html'):
        target = source_root / file
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(distribution / file, target)

    catalog, manifest, seen = {}, {}, {}
    report = {'distribution': 'Golly 5.0', 'policy': 'Complete files; unbounded B3/S23 only; duplicates ignore translation, rotation and reflection.',
              'included': [], 'duplicates': [], 'excluded': []}

    def add(name, cells, source, category, raw, description=''):
        cells = normalize(cells)
        digest = fingerprint(cells)
        if digest in seen:
            report['duplicates'].append({'source': source, 'same_as': seen[digest], 'name': name})
            return
        slug = re.sub(r'[^a-zA-Z0-9]+', '-', name).strip('-').lower()
        if slug in catalog:
            slug += '-' + hashlib.sha256(source.encode()).hexdigest()[:8]
        seen[digest] = slug
        entry = {'name': name, 'category': category, 'width': max(x for x, y in cells)+1,
                 'height': max(y for x, y in cells)+1, 'rle': encode_rle(cells), 'population': len(cells), 'rule': 'B3/S23',
                 'source': source, 'source_sha256': hashlib.sha256(raw).hexdigest(),
                 'geometry_sha256': digest, 'description': description}
        catalog[slug] = entry
        manifest[slug] = {'pattern': slug, 'variant': 0}
        report['included'].append({'id': slug, 'source': source, 'population': len(cells),
                                   'width': entry['width'], 'height': entry['height']})

    categories = {'Guns': 'Gun', 'Methuselahs': 'Methuselah', 'Puffers': 'Puffer',
                  'Breeders': 'Breeder', 'Rakes': 'Rake', 'Spaceships': 'Spaceships',
                  'Oscillators': 'Oscillators', 'Still-Lifes': 'Still lifes',
                  'Signal-Circuitry': 'Signal circuitry', 'Syntheses': 'Synthesis',
                  'Miscellaneous': 'Demonstration'}

    def import_file(relative, raw):
        text = raw.decode('utf-8-sig', errors='replace')
        try:
            cells = parse_life(text) if relative.endswith('.lif') else parse_rle(text)
        except (ValueError, StopIteration) as error:
            report['excluded'].append({'source': relative, 'reason': str(error) or 'No RLE header'})
            return
        title = re.search(r'^#N\s+(.+)', text, re.M)
        if not title and relative.endswith('.lif'):
            title = re.search(r'^#D\s+(.+)', text, re.M)
        name = title[1].strip() if title else Path(relative).name
        filename_title = not title or name.endswith(('.rle', '.rle.gz', '.lif'))
        name = name.removesuffix('.gz').removesuffix('.rle').removesuffix('.lif')
        if filename_title:
            name = name.replace('-', ' ').replace('_', ' ')
        comments = '\n'.join(line[2:].strip() for line in text.splitlines() if line.startswith(('#C', '#D', '#O')))
        category = categories.get(relative.split('/')[1], 'Pattern')
        # Golly often distributes stamp sheets or interactions, not single objects.
        if 'collection' in name.lower() or 'collection' in comments[:400].lower():
            category = 'Collection / ' + category
        add(name, cells, relative, category, raw, comments)

    for path in sorted((source_root / 'Life').rglob('*')):
        if not path.is_file():
            continue
        relative = str(path.relative_to(source_root))
        if path.suffix == '.zip':
            with zipfile.ZipFile(path) as archive:
                for member in sorted(archive.namelist()):
                    label = relative + '/' + member
                    if member.endswith(('.rle', '.lif')):
                        import_file(label, archive.read(member))
                    else:
                        report['excluded'].append({'source': label, 'reason': 'Executable generator; not a static cell layout'})
        elif path.suffix in ('.rle', '.lif', '.gz'):
            raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
            import_file(relative, raw)
        else:
            report['excluded'].append({'source': relative, 'reason': 'Executable generator; not a static cell layout'})

    base_source = 'Scripts/Python/glife/base.py'
    raw = (source_root / base_source).read_bytes()
    basics = dict(basic_patterns(raw.decode()))
    names = {'lwss': 'Lightweight spaceship', 'mwss': 'Middleweight spaceship',
             'hwss': 'Heavyweight spaceship', 'rpentomino': 'R-pentomino', 'bheptomino': 'B-heptomino',
             'queenbee': 'Queen bee', 'honeyfarm': 'Honey farm', 'pi': 'Pi heptomino'}
    for key, cells in basics.items():
        add(names.get(key, key.replace('_', ' ').capitalize()), cells, base_source+'#'+key, 'Basic pattern', raw)

    # Assemble the complete gun exactly as glife/gun30.py does; no fragments.
    queenbee = basics['queenbee']
    phase5 = queenbee
    for _ in range(5):
        phase5 = step(phase5)
    block = {(x+12, y+2) for x, y in basics['block']}
    gun = queenbee | block | {(-x-9, y+2) for x, y in (phase5 | block)}
    gun_source = 'Scripts/Python/glife/gun30.py'
    add('Gosper glider gun', gun, gun_source+'#gun30', 'Gun', (source_root / gun_source).read_bytes())

    (APP / 'patterns/catalog.json').write_text(json.dumps(catalog, separators=(',', ':'))+'\n')
    (APP / 'patterns/cards.json').write_text(json.dumps(manifest, indent=2)+'\n')
    (APP / 'patterns/import-report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(f"Imported {len(catalog)} unique cards; {len(report['duplicates'])} duplicates; {len(report['excluded'])} exclusions.")
    print('Total live cells:', sum(p['population'] for p in catalog.values()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('distribution', type=Path)
    import_collection(parser.parse_args().distribution)
