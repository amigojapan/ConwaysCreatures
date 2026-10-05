// Sparse Conway B3/S23 engine. Coordinates are not clipped to a finite board.
var LifeEngine = (() => {
    const key = (x, y) => x + ',' + y;
    const coordinates = value => value.split(',').map(Number);

    function decodeRLE(rle) {
        let x = 0, y = 0;
        const cells = [];
        for (const match of rle.matchAll(/(\d*)([bo$!])/g)) {
            const count = Number(match[1] || 1);
            if (match[2] === '!') break;
            if (match[2] === '$') { y += count; x = 0; }
            else if (match[2] === 'b') x += count;
            else { for (let i = 0; i < count; i++) cells.push([x++, y]); }
        }
        return cells;
    }

    function step(board) {
        const counts = new Map();
        for (const [position, team] of board) {
            const [x, y] = coordinates(position);
            const increment = team === 'blue' ? 17 : 1;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const neighbor = key(x + dx, y + dy);
                    counts.set(neighbor, (counts.get(neighbor) || 0) + increment);
                }
            }
        }
        const next = new Map();
        for (const [position, packed] of counts) {
            const neighbors = packed & 15;
            const team = board.get(position);
            if (team && (neighbors === 2 || neighbors === 3)) next.set(position, team);
            else if (!team && neighbors === 3) next.set(position, (packed >> 4) >= 2 ? 'blue' : 'red');
        }
        return next;
    }

    function same(a, b) {
        if (a.size !== b.size) return false;
        for (const [position, team] of a) if (b.get(position) !== team) return false;
        return true;
    }

    function rotate(pattern) {
        return {...pattern, width: pattern.height, height: pattern.width,
            cells: pattern.cells.map(([x, y]) => [pattern.height - 1 - y, x])};
    }

    function canPlace(board, pattern, x, y) {
        return Number.isSafeInteger(x) && Number.isSafeInteger(y) &&
            pattern.cells.every(([dx, dy]) => !board.has(key(x + dx, y + dy)));
    }

    function place(board, pattern, x, y, team) {
        if (!canPlace(board, pattern, x, y)) return false;
        for (const [dx, dy] of pattern.cells) board.set(key(x + dx, y + dy), team);
        return true;
    }

    function bounds(board) {
        if (!board.size) return {left: 0, top: 0, right: 40, bottom: 40};
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const position of board.keys()) {
            const [x, y] = coordinates(position);
            left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
        return {left, top, right, bottom};
    }

    return {key, coordinates, decodeRLE, step, same, rotate, canPlace, place, bounds};
})();
if (typeof module !== 'undefined') module.exports = LifeEngine;
