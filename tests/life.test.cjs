const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const Life = require('../ConwaysCreatures/life-engine.js');
const app = path.join(__dirname, '../ConwaysCreatures');
function game() {
    const elements = new Map();
    const alerts = [];
    const timers = new Map();
    let timerId = 0;
    let now = 0;
    function element(id) {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {id, style: {}, children: [], width: 400, height: 600, events: {},
                classList: {add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x)},
                append(...items) { this.children.push(...items); },
                appendChild(item) { this.children.push(item); item.parentElement = this; },
                replaceChildren(...items) { this.children = items; },
                showModal() { this.open = true; }, close() { this.open = false; },
                pause() {}, addEventListener(name, handler) {this.events[name] = handler;}, setPointerCapture() {},
                getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 600}),
                getContext: () => ({setTransform(){}, fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}}),
            });
        }
        return elements.get(id);
    }
    const context = {document: {getElementById: element, body: element('body'), createElement: tag => element(tag + elements.size), addEventListener(){}},
        window: {addEventListener(){}, devicePixelRatio: 1, location: {search: ''}}, requestAnimationFrame(){},
        clearTimeout(id){ timers.delete(id); }, setTimeout(fn){ timers.set(++timerId, fn); return timerId; },
        runTimer(id){ const fn = timers.get(id); assert.ok(fn, 'Timer is scheduled'); timers.delete(id); fn(); },
        timers, prompt: (_question, fallback) => fallback, URLSearchParams,
        alerts, alert: message => alerts.push(message),
        performance: {now: () => now}, elapse(ms){ now += ms; },
    };
    vm.createContext(context);
    const html = fs.readFileSync(path.join(app, 'qr.html'), 'utf8');
    for (const id of ['creature-deck', 'life-engine', 'game-code']) {
        const script = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'))[1];
        vm.runInContext(script, context);
    }
    return context;
}
const pattern = cells => ({cells, width: Math.max(...cells.map(p => p[0])) + 1, height: Math.max(...cells.map(p => p[1])) + 1});

test('B3/S23 on every neighborhood, simultaneous updates and mixed teams', () => {
    const neighbors = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    for (let mask = 0; mask < 256; mask++) for (const alive of [false, true]) {
        const board = new Map();
        let count = 0, blue = 0;
        neighbors.forEach(([x,y], i) => {
            if (mask & (1 << i)) {
                count++; const team = i % 2 ? 'red' : 'blue'; if (team === 'blue') blue++;
                board.set(Life.key(x,y), team);
            }
        });
        if (alive) board.set('0,0', 'red');
        const expected = alive ? (count === 2 || count === 3 ? 'red' : undefined)
            : (count === 3 ? blue >= 2 ? 'blue' : 'red' : undefined);
        assert.equal(Life.step(board).get('0,0'), expected);
    }
});

test('still life, oscillator and glider evolve across negative and very large coordinates', () => {
    const board = new Map();
    Life.place(board, pattern([[0,0],[1,0],[0,1],[1,1]]), -100, -200, 'red');
    assert.ok(Life.same(board, Life.step(board)));
    board.clear();
    Life.place(board, pattern([[0,0],[1,0],[2,0]]), 0, 0, 'blue');
    assert.ok(!Life.same(board, Life.step(board)));
    assert.ok(Life.same(board, Life.step(Life.step(board))));
    board.clear();
    const glider = [[1,0],[2,1],[0,2],[1,2],[2,2]];
    Life.place(board, pattern(glider), 210515, -183739, 'blue');
    let next = board;
    for (let i = 0; i < 4; i++) next = Life.step(next);
    assert.deepEqual([...next.keys()].sort(), glider.map(([x,y]) => Life.key(210516+x, -183738+y)).sort());
});

test('all source cards decode fully and resolve from PNG paths with matching filenames', () => {
    const g = game();
    const names = Object.keys(g.creatures);
    assert.equal(names.length, 193);
    const cardDirectory = path.join(app, 'images/cards');
    const files = fs.readdirSync(cardDirectory).filter(f => f.endsWith('.png')).concat(
        fs.readdirSync(path.join(cardDirectory, 'giants')).filter(f => f.endsWith('.png')));
    assert.deepEqual(names.sort(), files.map(f => f.slice(0,-4)).sort());
    let population = 0;
    for (const id of names) {
        const p = g.getCreatureByName('images/cards/' + id + '.png');
        assert.ok(p, id);
        const expectedFolder = p.width < 40 && p.height < 40 ? 'images/cards/' : 'images/cards/giants/';
        assert.equal(p.image, expectedFolder + id + '.png');
        assert.ok(fs.existsSync(path.join(app, p.image)), id);
        assert.equal(g.getCreatureByName(p.image).id, id);
        assert.equal(p.cells.length, p.population, id);
        const bounds = Life.bounds(new Map(p.cells.map(([x,y]) => [Life.key(x,y), 'blue'])));
        assert.equal(bounds.right, p.width, id);
        assert.equal(bounds.bottom, p.height, id);
        population += p.cells.length;
    }
    assert.equal(population, 1307457);
});

test('large source layout places without clipping or filling empty gaps', () => {
    const g = game();
    const p = g.getCreatureByName('switch-engine-ping-pong');
    assert.equal(p.width, 210515);
    assert.equal(p.height, 183739);
    assert.ok(p.cells.length < 1000);
    const board = new Map();
    assert.ok(Life.place(board, p, -90000, 100000, 'blue'));
    assert.equal(board.size, p.population);
    assert.equal(Life.place(board, p, -90000, 100000, 'red'), false);
});

test('actual game preserves rotation and places Golly gun which fires repeatedly', () => {
    const g = game();
    assert.ok(g.addCard('gosper-glider-gun'));
    g.initBattle();
    assert.equal(g.currentSelectedCreture.name, 'Gosper glider gun');
    const original = g.currentSelectedCreture;
    g.rotateCreture();
    assert.equal(g.currentSelectedCreture.width, original.height);
    assert.ok(g.placeSelectedCreature(10,20));
    const expected = Life.rotate(original).cells.map(([x,y]) => Life.key(x+10,y+20)).sort();
    assert.deepEqual([...g.board.keys()].sort(), [...expected]);
    let previous = 0;
    for (let i = 1; i <= 120; i++) {
        g.tickConwayBattle();
        if (i % 30 === 0) {
            if (previous) assert.equal(g.board.size, previous + 5);
            previous = g.board.size;
        }
    }
    assert.equal(g.generation, 120);
    assert.equal(g.board.size, 59);
});

test('matching embedded deck works without separate script downloads; stale data blocks gameplay', () => {
    const g = game();
    const html = fs.readFileSync(path.join(app, 'qr.html'), 'utf8');
    assert.doesNotMatch(html, /<script[^>]*src=/);
    assert.equal(html.match(/<script id="life-engine">([\s\S]*?)<\/script>/)[1].trim(),
        fs.readFileSync(path.join(app, 'life-engine.js'), 'utf8').trim());
    assert.equal(html.match(/<script id="game-code">([\s\S]*?)<\/script>/)[1].trim(),
        fs.readFileSync(path.join(app, 'game.js'), 'utf8').replace('DECK_VERSION', g.creatureDeckVersion).trim());
    assert.ok(g.ensureCreatureDeckLoaded());
    g.creatureDeckVersion = 'old';
    assert.equal(g.ensureCreatureDeckLoaded(), false);
    g.scanQR(); g.initBattle(); g.startBattle();
    assert.equal(g.battleInProgress, false);
    assert.match(g.document.getElementById('result').innerText, /could not load/);
});

test('canvas tap places the preview; dragging pans without placing; zoom preserves the center', () => {
    const g = game();
    g.addCard('gosper-glider-gun');
    g.initBattle();
    const canvas = g.document.getElementById('lifeCanvas');
    const center = () => [g.view.left + 200/g.view.scale, g.view.top + 300/g.view.scale];
    const originalCenter = center();
    g.zoomBattlefield(2);
    center().forEach((value, i) => assert.ok(Math.abs(value-originalCenter[i]) < 1e-9));
    const left = g.view.left;
    canvas.events.pointerdown({clientX:200,clientY:300,pointerId:1});
    canvas.events.pointermove({pointerId:1,clientX:230,clientY:340});
    canvas.events.pointerup({pointerId:1,clientX:230,clientY:340});
    assert.notEqual(g.view.left, left);
    assert.equal(g.board.size, 0);
    g.fitBattlefield();
    canvas.events.pointerdown({clientX:200,clientY:300,pointerId:1});
    canvas.events.pointerup({pointerId:1,clientX:200,clientY:300});
    assert.equal(g.board.size, 32);
    assert.equal(g.currentSelectedCreture, null);
    assert.equal(g.currentCardNumber, 1);
});

test('real-time startup defaults to 30 crystals and 60 seconds, validates input, and allows empty boards with resources', () => {
    const g = game();
    g.addCard('glider');
    g.prompt = (question, fallback) => {
        assert.equal(fallback, question.includes('How many players') ? '2' : question.includes('EACH player') ? '30' : '60');
        return fallback;
    };
    g.initRealtimeBattle();
    assert.equal(g.crystals.blue, 30);
    assert.equal(g.crystals.red, 30);
    assert.equal(g.realtimeRemainingMs, 60000);
    assert.equal(g.gameMode, 'realtime');
    assert.equal(g.currentSelectedCreture, null);
    for (let i = 0; i < 8; i++) g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 8);
    assert.equal(g.board.size, 0);
    assert.equal(g.battleInProgress, true);
    g.showMainMenu();
    assert.equal(g.timers.has(g.battleTimerHandle), false);
    for (const answer of [null, '', ' ', '-1', '1.5', 'abc', 'Infinity', '9007199254740992']) {
        g.prompt = (question, fallback) => question.includes('EACH player') ? answer : fallback;
        g.initRealtimeBattle();
        assert.equal(g.battleInProgress, false, String(answer));
        assert.equal(g.document.getElementById('mainMenu').style.display, 'flex');
    }
    g.prompt = (question, fallback) => question.includes('EACH player') ? '0' : fallback;
    g.initRealtimeBattle();
    assert.equal(g.crystals.blue, 0);
    assert.equal(g.crystals.red, 0);
    assert.equal(g.battleInProgress, false);
    assert.match(g.alerts.at(-1), /Tie game!.*Neither team/);
    assert.equal(g.selectDeploymentCard('glider'), false);
});

test('real-time cards cost live cells, overwrite teams, preserve gaps, and can be reused without turns', () => {
    const g = game();
    g.addCard('glider');
    g.addCard('glider');
    g.addCard('gosper-glider-gun');
    g.prompt = (question, fallback) => question.includes('EACH player') ? '15' : fallback;
    g.initRealtimeBattle();
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('blue');
    const choices = g.document.getElementById('deploymentCards').children;
    assert.equal(choices.length, 2, 'Duplicate scanned cards share one reusable choice');
    assert.equal(choices[0].disabled, false);
    assert.equal(choices[1].disabled, true);
    assert.equal(g.selectDeploymentCard('gosper-glider-gun'), false);
    assert.equal(g.selectDeploymentCard('block'), false, 'Unowned cards cannot be deployed');
    assert.equal(g.selectDeploymentCard('glider'), true);
    g.rotateCreture();
    const p = g.currentSelectedCreture;
    g.board.set('999,999', 'red');
    const footprint = new Set(p.cells.map(([x,y]) => Life.key(x-10,y-20)));
    const gaps = [];
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
        const key = Life.key(x-10, y-20);
        g.board.set(key, 'red');
        if (!footprint.has(key)) gaps.push(key);
    }
    assert.equal(g.placeSelectedCreature(NaN, 0), false);
    assert.equal(g.placeSelectedCreature(Number.MAX_SAFE_INTEGER, 0), false);
    assert.equal(g.crystals.blue, 15);
    assert.equal(g.placeSelectedCreature(-10, -20), true);
    assert.equal(g.crystals.blue, 10, 'Charge the five live cells, including replacements');
    assert.equal(g.crystals.red, 15);
    for (const key of footprint) assert.equal(g.board.get(key), 'blue');
    for (const key of gaps) assert.equal(g.board.get(key), 'red');
    assert.equal(g.board.get('999,999'), 'red');
    assert.equal(g.currentSelectedCreture, null);
    assert.equal(g.currentCardNumber, 0);
    assert.equal(g.p1deck.length, 3);
    for (let i = 0; i < 2; i++) {
        g.openDeploymentPicker();
        g.chooseDeploymentTeam('blue');
        assert.equal(g.selectDeploymentCard('glider'), true);
        assert.equal(g.placeSelectedCreature(100,100), true);
    }
    assert.equal(g.crystals.blue, 0);
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('blue');
    assert.equal(g.selectDeploymentCard('glider'), false);
    assert.equal(g.document.getElementById('deploymentCards').children[0].disabled, true);
    g.chooseDeploymentTeam('red');
    assert.equal(g.selectDeploymentCard('glider'), true);
    assert.equal(g.placeSelectedCreature(100,100), true);
    assert.equal(g.crystals.red, 10);
    for (const [x,y] of g.getCreatureByName('glider').cells) assert.equal(g.board.get(Life.key(x+100,y+100)), 'red');
});

test('slower double-taps pause selection and placement; deploying resumes evolution', () => {
    const g = game();
    g.addCard('blinker');
    g.prompt = (question, fallback) => question.includes('EACH player') ? '100' : fallback;
    g.initRealtimeBattle();
    const canvas = g.document.getElementById('lifeCanvas');
    const dialog = g.document.getElementById('deploymentPicker');
    const tap = (time, x = 200, y = 300) => {
        canvas.events.pointerdown({clientX:x, clientY:y, pointerId:1, timeStamp:time});
        canvas.events.pointerup({clientX:x, clientY:y, pointerId:1, timeStamp:time+20});
    };
    tap(100);
    assert.ok(!dialog.open);
    tap(800);
    assert.equal(dialog.open, true);
    g.document.getElementById('deploymentTeams').children[1].events.click();
    g.document.getElementById('deploymentCards').children[0].events.click();
    assert.equal(dialog.open, false);
    assert.equal(g.currentTeam, 'red');
    assert.equal(g.crystals.red, 100, 'Selection does not spend crystals');
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 0, 'Choosing a card leaves placement paused');
    canvas.events.pointerdown({clientX:200,clientY:300,pointerId:1});
    canvas.events.pointermove({pointerId:1,clientX:260,clientY:300});
    canvas.events.pointerup({pointerId:1,clientX:260,clientY:300});
    assert.equal(g.board.size, 0);
    assert.ok(g.currentSelectedCreture);
    tap(900);
    assert.equal(g.board.size, 3);
    assert.equal(g.crystals.red, 97);
    assert.equal(g.crystals.blue, 100);
    const initial = new Map(g.board);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 1);
    assert.equal(Life.same(initial, g.board), false, 'Deploying resumes evolution');
    g.runTimer(g.battleTimerHandle);
    assert.equal(Life.same(initial, g.board), true);
    tap(1200); tap(2000);
    assert.equal(dialog.open, true);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 2);
    assert.equal(Life.same(initial, g.board), true, 'Picker pauses evolution');
    g.runTimer(g.battleTimerHandle);
    assert.equal(Life.same(initial, g.board), true);
    assert.equal(g.battleInProgress, true);
    g.chooseDeploymentTeam('blue');
    g.selectDeploymentCard('blinker');
    g.rotateCreture();
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 2, 'Rotation and pending placement stay paused');
    g.crystals.blue = 2;
    assert.equal(g.placeSelectedCreature(0,0), false, 'Budget is rechecked at placement');
    assert.equal(Life.same(initial, g.board), true);
    g.finishBattle();
    assert.equal(g.battleInProgress, false);
    assert.equal(g.timers.has(g.battleTimerHandle), false);
    assert.equal(g.placeSelectedCreature(0,0), false);
    g.openDeploymentPicker();
    assert.equal(dialog.open, false);
    g.showMainMenu();
    g.initBattle();
    assert.equal(g.gameMode, 'classic');
    assert.ok(g.currentSelectedCreture);
    assert.equal(g.battleInProgress, false);
});

test('cancel and Escape resume without spending; slow unrelated taps and dragging do not open the picker', () => {
    const g = game();
    g.addCard('blinker');
    g.initRealtimeBattle();
    const canvas = g.document.getElementById('lifeCanvas');
    const dialog = g.document.getElementById('deploymentPicker');
    const tap = time => {
        canvas.events.pointerdown({clientX:200,clientY:300,pointerId:1});
        canvas.events.pointerup({pointerId:1,clientX:200,clientY:300,timeStamp:time});
    };
    tap(100); tap(1100);
    assert.ok(!dialog.open, 'Taps over 900 ms apart are separate');
    canvas.events.pointerdown({clientX:200,clientY:300,pointerId:1});
    canvas.events.pointermove({pointerId:1,clientX:250,clientY:300});
    canvas.events.pointerup({pointerId:1,clientX:250,clientY:300,timeStamp:1200});
    tap(1300);
    assert.ok(!dialog.open, 'Dragging resets double-tap detection');
    tap(2200);
    assert.equal(dialog.open, true, '900 ms double-tap is accepted');
    const blue = g.crystals.blue;
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 0);
    g.closeDeploymentPicker();
    assert.equal(dialog.open, false);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 1);
    assert.equal(g.crystals.blue, blue);
    g.openDeploymentPicker();
    let prevented = false;
    dialog.events.cancel({preventDefault(){ prevented = true; }});
    assert.equal(prevented, true);
    assert.equal(dialog.open, false);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 2);
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('blue');
    g.selectDeploymentCard('blinker');
    g.openDeploymentPicker();
    g.closeDeploymentPicker();
    assert.equal(g.currentSelectedCreture, null);
    assert.equal(g.crystals.blue, blue);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 3, 'Cancelling pending placement resumes');
    g.openDeploymentPicker();
    g.showMainMenu();
    assert.equal(g.deploymentPaused, false);
    assert.equal(g.timers.has(g.battleTimerHandle), false);
    g.initRealtimeBattle();
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.generation, 1, 'A new game is not left paused');
});

test('stable boards continue in real time and crystals reset for each new game', () => {
    const g = game();
    g.addCard('block');
    g.prompt = (question, fallback) => question.includes('EACH player') ? '4' : fallback;
    g.initRealtimeBattle();
    g.chooseDeploymentTeam('blue');
    g.selectDeploymentCard('block');
    assert.equal(g.placeSelectedCreature(0,0), true);
    assert.equal(g.crystals.blue, 0);
    for (let i = 0; i < 8; i++) g.runTimer(g.battleTimerHandle);
    assert.equal(g.board.size, 4);
    assert.equal(g.battleInProgress, true);
    g.showMainMenu();
    g.initRealtimeBattle();
    assert.equal(g.crystals.blue, 4);
    assert.equal(g.crystals.red, 4);
    assert.equal(g.board.size, 0);
    assert.equal(g.generation, 0);
});

test('main-menu preview follows Life independently, switches cards, and pauses outside the menu', () => {
    const g = game();
    assert.equal(g.previewPattern.id, 'gosper-glider-gun');
    assert.equal(g.previewBoard.size, 32);
    g.addCard('glider');
    const initial = new Map(g.previewBoard);
    for (let i = 0; i < 4; i++) g.runTimer(g.previewTimer);
    assert.equal(g.previewGeneration, 4);
    const expected = new Map([...initial].map(([key, team]) => {
        const [x,y] = Life.coordinates(key); return [Life.key(x-1,y-1), team];
    }));
    assert.equal(Life.same(g.previewBoard, expected), true);
    assert.equal(g.board.size, 0, 'Preview never alters the battle');
    assert.equal(g.crystals.blue, 30);
    g.addCard('blinker');
    assert.equal(g.previewGeneration, 0);
    g.document.getElementById('cards').children[0].events.click();
    assert.equal(g.previewPattern.id, 'glider');
    g.initBattle();
    assert.equal(g.timers.has(g.previewTimer), false);
    const generation = g.previewGeneration;
    g.advanceMenuPreview();
    assert.equal(g.previewGeneration, generation);
    g.showMainMenu();
    g.runTimer(g.previewTimer);
    assert.equal(g.previewGeneration, generation+1);
    g.showScanner();
    assert.equal(g.timers.has(g.previewTimer), false);
});

test('custom match duration accepts positive seconds and cancellation or invalid input does not start a match', () => {
    const g = game();
    g.addCard('block');
    for (const answer of [null, '', ' ', '0', '-1', 'abc', 'Infinity', '1e308']) {
        g.prompt = (question, fallback) => question.includes('Match duration') ? answer : fallback;
        g.initRealtimeBattle();
        assert.equal(g.battleInProgress, false, String(answer));
        assert.equal(g.crystals.blue, 30);
        assert.equal(g.timers.has(g.battleTimerHandle), false);
    }
    const prompts = [];
    g.prompt = (question, fallback) => {
        prompts.push([question, fallback]);
        return question.includes('How many players') ? fallback : question.includes('EACH player') ? '37' : '2.5';
    };
    g.initRealtimeBattle();
    assert.equal(prompts.length, 3);
    assert.equal(prompts[0][1], '2');
    assert.equal(prompts[1][1], '30');
    assert.equal(prompts[2][1], '60');
    assert.equal(g.crystals.blue, 37);
    assert.equal(g.crystals.red, 37);
    assert.equal(g.battleDurationMs, 2500);
    g.elapse(2500);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.battleInProgress, false);
    assert.equal(g.generation, 0, 'Do not evolve past the deadline');
    assert.match(g.alerts.at(-1), /Tie game!.*Time is up/);
});

test('countdown excludes all selection and placement time, resumes on cancel, and scores live cells at timeout', () => {
    const g = game();
    g.addCard('block');
    g.initRealtimeBattle();
    g.elapse(1250);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.realtimeRemainingMs, 58750);
    g.openDeploymentPicker();
    const generation = g.generation;
    g.elapse(90000);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.realtimeRemainingMs, 58750);
    assert.equal(g.generation, generation);
    g.chooseDeploymentTeam('blue');
    g.selectDeploymentCard('block');
    g.rotateCreture();
    g.elapse(5000);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.realtimeRemainingMs, 58750);
    assert.equal(g.placeSelectedCreature(0,0), true);
    g.elapse(750);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.realtimeRemainingMs, 58000);
    g.elapse(250);
    g.openDeploymentPicker();
    assert.equal(g.realtimeRemainingMs, 57750, 'Charge active time before the pause');
    g.elapse(100000);
    g.closeDeploymentPicker();
    assert.equal(g.realtimeRemainingMs, 57750);
    g.elapse(57749);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.battleInProgress, true);
    assert.equal(g.realtimeRemainingMs, 1);
    g.elapse(1);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.battleInProgress, false);
    assert.equal(g.realtimeRemainingMs, 0);
    assert.equal(g.timers.has(g.battleTimerHandle), false);
    assert.match(g.alerts.at(-1), /Blue team wins! Blue: 4; Red: 0.*Time is up/);
    g.showMainMenu();
    g.initRealtimeBattle();
    assert.equal(g.realtimeRemainingMs, 60000);
    assert.equal(g.crystals.blue, 30);
});

test('elimination requires no live cells and no affordable cards; overwriting the last cells can end a match', () => {
    const g = game();
    g.addCard('block');
    g.prompt = (question, fallback) => question.includes('EACH player') ? '4' : fallback;
    g.initRealtimeBattle();
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('blue');
    g.selectDeploymentCard('block');
    g.placeSelectedCreature(0,0);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.crystals.blue, 0);
    assert.equal(g.getCellCount('blue'), 4);
    assert.equal(g.battleInProgress, true, 'No crystals alone is not elimination; Red can still buy a card');
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('red');
    g.selectDeploymentCard('block');
    g.placeSelectedCreature(0,0);
    assert.equal(g.battleInProgress, false);
    assert.match(g.alerts.at(-1), /Red team wins!.*Blue is eliminated/);
    assert.equal(g.timers.has(g.battleTimerHandle), false);
});

test('simultaneous elimination draws; a player with resources wins elimination even with zero live cells', () => {
    const g = game();
    g.addCard('block');
    g.initRealtimeBattle();
    g.crystals.blue = g.crystals.red = 3; // Below the cheapest owned card's four-cell cost.
    g.board.set('0,0', 'blue');
    g.board.set('100,100', 'red');
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.board.size, 0);
    assert.equal(g.battleInProgress, false);
    assert.match(g.alerts.at(-1), /Tie game!.*Neither team/);
    g.showMainMenu();
    g.initRealtimeBattle();
    g.crystals.blue = 3;
    g.runTimer(g.battleTimerHandle);
    assert.match(g.alerts.at(-1), /Red team wins! Blue: 0; Red: 0.*Blue is eliminated/);
});

test('opening a picker at the expired deadline cannot avoid the time limit', () => {
    const g = game();
    g.addCard('block');
    g.initRealtimeBattle();
    g.elapse(60000);
    g.openDeploymentPicker();
    assert.equal(g.battleInProgress, false);
    assert.ok(!g.document.getElementById('deploymentPicker').open);
    assert.match(g.alerts.at(-1), /Time is up/);
});

test('successful scans alternate ownership starting with Blue; invalid and cancelled scans do not skip turns', () => {
    const g = game();
    assert.equal(g.nextScanTeam(), 'blue');
    assert.match(g.document.getElementById('scanCardButton').textContent, /Blue/);
    assert.equal(g.addCard('glider'), true);
    assert.equal(g.p1deck[0].team, 'blue');
    assert.equal(g.nextScanTeam(), 'red');
    assert.match(g.document.getElementById('cards').children[0].textContent, /^Blue: Glider/);
    assert.equal(g.addCard('invalid-card'), false);
    g.cancelScan();
    assert.equal(g.nextScanTeam(), 'red');
    g.scanQR(); // Camera unavailable in the test environment.
    assert.equal(g.nextScanTeam(), 'red');
    g.addCard('block');
    g.addCard('blinker');
    g.addCard('beehive');
    assert.deepEqual(Array.from(g.p1deck, card => card.team), ['blue','red','blue','red']);
    assert.match(g.document.getElementById('scanTurn').textContent, /Next scan: Blue.*Blue: 2 cards.*Red: 2 cards/);
});

test('separate decks require both players to scan and restrict selection and deployment to the current owner', () => {
    const g = game();
    g.addCard('glider');
    let prompts = 0;
    g.prompt = (_question, fallback) => { prompts++; return fallback; };
    g.initRealtimeBattle(true);
    assert.equal(g.battleInProgress, false);
    assert.equal(prompts, 1);
    assert.match(g.document.getElementById('result').innerText, /at least one card for each team/);
    g.addCard('block');
    g.addCard('blinker');
    g.addCard('beehive');
    g.initRealtimeBattle(true);
    assert.equal(prompts, 4);
    assert.equal(g.separateDecks, true);
    assert.equal(g.crystals.blue, 30);
    assert.equal(g.crystals.red, 30);
    assert.equal(g.realtimeRemainingMs, 60000);
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('blue');
    const list = () => g.document.getElementById('deploymentCards').children.map(button => button.textContent);
    assert.deepEqual(list(), ['Glider · 5 crystals', 'Blinker · 3 crystals']);
    assert.equal(g.selectDeploymentCard('block'), false);
    assert.equal(g.selectDeploymentCard('glider'), true);
    const owned = g.currentSelectedCreture;
    g.currentSelectedCreture = g.getCreatureByName('block');
    assert.equal(g.placeSelectedCreature(0,0), false, 'Placement rechecks ownership');
    assert.equal(g.board.size, 0);
    assert.equal(g.crystals.blue, 30);
    g.currentSelectedCreture = owned;
    g.elapse(5000);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.realtimeRemainingMs, 60000, 'Separate decks keep the pause rules');
    assert.equal(g.placeSelectedCreature(0,0), true);
    assert.equal(g.crystals.blue, 25);
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('blue');
    assert.equal(g.selectDeploymentCard('glider'), true, 'An owned card is reusable');
    g.placeSelectedCreature(20,20);
    assert.equal(g.crystals.blue, 20);
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('red');
    assert.deepEqual(list(), ['Block · 4 crystals', 'Beehive · 6 crystals']);
    assert.equal(g.selectDeploymentCard('glider'), false);
    assert.equal(g.selectDeploymentCard('block'), true);
    assert.equal(g.placeSelectedCreature(50,50), true);
    assert.equal(g.crystals.red, 26);
    assert.equal(g.p1deck.length, 4);
    g.elapse(60000);
    g.runTimer(g.battleTimerHandle);
    assert.equal(g.battleInProgress, false);
    assert.match(g.alerts.at(-1), /Time is up/);
});

test('each team can scan the same pattern; shared and classic modes retain their original decks', () => {
    const g = game();
    g.addCard('block'); // Blue
    g.addCard('glider'); // Red
    g.addCard('glider'); // Blue
    g.addCard('glider'); // Red duplicate
    g.initRealtimeBattle(true);
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('red');
    assert.equal(g.document.getElementById('deploymentCards').children.length, 1);
    assert.equal(g.selectDeploymentCard('glider'), true);
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('blue');
    assert.equal(g.selectDeploymentCard('glider'), true);
    g.showMainMenu();
    g.initRealtimeBattle();
    assert.equal(g.separateDecks, false);
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('red');
    assert.equal(g.selectDeploymentCard('block'), true, 'The original real-time mode shares all cards');
    g.showMainMenu();
    g.initRealtimeBattle(true);
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('red');
    assert.equal(g.selectDeploymentCard('block'), false, 'Ownership survives switching modes');
    g.showMainMenu();
    g.initBattle();
    assert.equal(g.separateDecks, false);
    assert.equal(g.currentTeam, 'blue');
    assert.equal(g.currentSelectedCreture.id, 'block');
    g.placeSelectedCreature(0,0);
    assert.equal(g.currentTeam, 'red');
    assert.equal(g.currentSelectedCreture.id, 'glider');
});

test('separate-deck elimination uses the price of that team’s own cards', () => {
    const g = game();
    g.addCard('gosper-glider-gun'); // Blue needs 32 crystals.
    g.addCard('block'); // Red needs 4 crystals.
    g.initRealtimeBattle(true); // 30 each.
    assert.equal(g.battleInProgress, false);
    assert.match(g.alerts.at(-1), /Red team wins!.*Blue is eliminated/);
    g.showMainMenu();
    g.initRealtimeBattle();
    assert.equal(g.battleInProgress, true, 'Shared decks let either player afford the block');
});

test('pinching zooms both ways around the fingers and never deploys when either finger lifts', () => {
    const g = game();
    g.addCard('block');
    g.initRealtimeBattle();
    g.openDeploymentPicker();
    g.chooseDeploymentTeam('blue');
    g.selectDeploymentCard('block');
    const canvas = g.document.getElementById('lifeCanvas');
    const initial = {...g.view};
    const anchor = [initial.left+200/initial.scale, initial.top+200/initial.scale];
    const send = (type, id, x, y) => canvas.events[type]({pointerId:id, clientX:x, clientY:y});
    send('pointerdown',1,100,200);
    send('pointerdown',2,300,200);
    send('pointermove',1,50,200);
    send('pointermove',2,350,200);
    assert.ok(Math.abs(g.view.scale-initial.scale*1.5) < 1e-9);
    assert.ok(Math.abs(g.view.left+200/g.view.scale-anchor[0]) < 1e-9);
    assert.ok(Math.abs(g.view.top+200/g.view.scale-anchor[1]) < 1e-9);
    send('pointermove',1,125,240);
    send('pointermove',2,275,240);
    assert.ok(Math.abs(g.view.scale-initial.scale*.75) < 1e-9);
    assert.ok(Math.abs(g.view.left+200/g.view.scale-anchor[0]) < 1e-9);
    assert.ok(Math.abs(g.view.top+240/g.view.scale-anchor[1]) < 1e-9, 'Midpoint motion also pans');
    send('pointerup',1,125,240);
    send('pointermove',2,280,240);
    send('pointerup',2,280,240);
    assert.equal(g.board.size, 0);
    assert.equal(g.crystals.blue, 30);
    assert.equal(g.currentSelectedCreture.id, 'block');
    assert.equal(g.deploymentPaused, true);
    assert.equal(g.lastTap, null);
    send('pointerdown',3,200,300);
    send('pointerup',3,200,300);
    assert.equal(g.board.size, 4, 'A fresh single tap still places the selected card');
    assert.equal(g.crystals.blue, 26);
});

test('double-taps open deployment without zooming; native zoom gestures are suppressed on the canvas', () => {
    const g = game();
    g.addCard('block');
    g.initRealtimeBattle();
    const canvas = g.document.getElementById('lifeCanvas');
    const initial = {...g.view};
    for (const type of ['touchstart','touchmove','touchend','dblclick','gesturestart','gesturechange']) {
        let prevented = false;
        canvas.events[type]({preventDefault(){ prevented = true; }});
        assert.equal(prevented, true, type);
    }
    for (const time of [100,800]) {
        canvas.events.pointerdown({pointerId:1,clientX:200,clientY:300});
        canvas.events.pointerup({pointerId:1,clientX:200,clientY:300,timeStamp:time});
        canvas.events.lostpointercapture({pointerId:1}); // Normal automatic release must preserve the first tap.
    }
    assert.equal(g.document.getElementById('deploymentPicker').open, true);
    assert.deepEqual({...g.view}, initial);
    assert.equal(g.board.size, 0);
});

test('pinch cancellation and additional fingers do not create taps; pinch respects zoom limits', () => {
    const g = game();
    g.addCard('block');
    g.initBattle();
    const canvas = g.document.getElementById('lifeCanvas');
    const send = (type, id, x, y) => canvas.events[type]({pointerId:id, clientX:x, clientY:y});
    send('pointerdown',1,100,200);
    send('pointerdown',2,300,200);
    send('pointermove',2,10000000,200);
    assert.equal(g.view.scale, 40);
    send('pointermove',2,100,200);
    assert.equal(g.view.scale, .00001);
    assert.ok(Number.isFinite(g.view.left) && Number.isFinite(g.view.top));
    send('pointerdown',3,350,200);
    send('pointercancel',1,100,200);
    send('pointermove',3,400,200);
    send('lostpointercapture',2,100,200);
    send('pointerup',3,400,200);
    assert.equal(g.board.size, 0);
    assert.equal(g.battlefieldPointers.size, 0);
    assert.equal(g.multiTouchGesture, false);
    assert.equal(g.lastTap, null);
    g.fitBattlefield();
    send('pointerdown',4,200,300);
    send('pointerup',4,200,300);
    assert.equal(g.board.size, 4);
    g.showMainMenu();
    assert.equal(g.battlefieldPointers.size, 0);
});

const allTeams = ['blue', 'red', 'yellow', 'green'];
const gameStarts = [g => g.initBattle(), g => g.initRealtimeBattle(), g => g.initRealtimeBattle(true)];
function usePlayers(g, count) {
    g.prompt = (question, fallback) => question.includes('How many players') ? String(count) : fallback;
}

test('every game start asks once for 1–4 players, defaults to two, and rejects invalid counts or cancellation', () => {
    for (const start of gameStarts) {
        const g = game();
        for (let i = 0; i < 4; i++) g.addCard('block');
        const before = Array.from(g.p1deck, card => card.team);
        for (const answer of [null, '', ' ', '0', '-1', '1.5', '5', 'abc', 'Infinity']) {
            g.prompt = (question, fallback) => {
                assert.match(question, /How many players/);
                assert.equal(fallback, '2');
                return answer;
            };
            start(g);
            assert.equal(g.battleInProgress, false);
            assert.equal(g.menuVisible, true);
            assert.equal(g.playerCount, 2);
            assert.deepEqual(Array.from(g.p1deck, card => card.team), before);
        }
        let countPrompts = 0;
        g.prompt = (question, fallback) => {
            if (question.includes('How many players')) { countPrompts++; assert.equal(fallback, '2'); }
            return fallback;
        };
        start(g);
        assert.equal(countPrompts, 1);
        assert.equal(g.playerCount, 2);
        assert.equal(g.menuVisible, false);
    }
});

test('classic placement cycles through every selected player, including solo, and scans update when counts change', () => {
    const g = game();
    for (let i = 0; i < 8; i++) g.addCard('block');
    for (const count of [4, 3, 1, 2]) {
        usePlayers(g, count);
        g.initBattle();
        for (let i = 0; i < 8; i++) {
            const team = allTeams[i % count];
            assert.equal(g.p1deck[i].team, team);
            assert.equal(g.currentTeam, team);
            assert.equal(g.document.getElementById('cards').children[i].className, 'deck-card owned-' + team);
            assert.equal(g.placeSelectedCreature(i*10, 0), true);
            assert.equal(g.board.get(`${i*10},0`), team);
        }
        assert.equal(g.currentSelectedCreture, null);
        assert.equal(g.nextScanTeam(), allTeams[8 % count]);
        g.startBattle();
        assert.equal(g.battleInProgress, true);
        for (const team of allTeams.slice(0, count)) assert.match(g.document.getElementById('result').innerText, new RegExp(g.teamName(team)));
        g.showMainMenu();
    }
    usePlayers(g, 3);
    g.initBattle();
    g.showMainMenu();
    g.addCard('blinker');
    assert.equal(g.p1deck[8].team, 'yellow');
    assert.match(g.document.getElementById('cards').children[8].textContent, /^Yellow:/);
    assert.equal(g.nextScanTeam(), 'blue');
});

test('both real-time modes give each selected player crystals, deployment, ownership, and scores', () => {
    for (const ownCardsOnly of [false, true]) for (const count of [1, 2, 3, 4]) {
        const g = game();
        const ids = ['block', 'blinker', 'glider', 'beehive'];
        ids.forEach(id => g.addCard(id));
        usePlayers(g, count);
        g.initRealtimeBattle(ownCardsOnly);
        assert.equal(g.battleInProgress, true);
        assert.deepEqual(Object.keys(g.crystals), allTeams.slice(0, count));
        g.openDeploymentPicker();
        assert.deepEqual(g.document.getElementById('deploymentTeams').children.map(button => button.className), allTeams.slice(0, count).map(team => 'team-' + team));
        for (let i = 0; i < count; i++) {
            const team = allTeams[i];
            g.openDeploymentPicker();
            g.chooseDeploymentTeam(team);
            assert.equal(g.selectDeploymentCard(ids[i]), true);
            assert.equal(g.placeSelectedCreature(i*20, 0), true);
            assert.equal(g.board.get(`${i*20 + g.getCreatureByName(ids[i]).cells[0][0]},${g.getCreatureByName(ids[i]).cells[0][1]}`), team);
            assert.equal(g.crystals[team], 30-g.getCreatureByName(ids[i]).population);
            if (ownCardsOnly && count > 1) assert.equal(g.teamCanUseCard(team, ids[(i+1) % count]), false);
        }
        if (count < 4) {
            const current = g.currentTeam;
            g.chooseDeploymentTeam(allTeams[count]);
            assert.equal(g.currentTeam, current);
            assert.equal(g.teamCanUseCard(allTeams[count], 'block'), false);
        }
        g.elapse(60000);
        g.runTimer(g.battleTimerHandle);
        assert.equal(g.battleInProgress, false);
        for (const team of allTeams.slice(0, count)) assert.match(g.alerts.at(-1), new RegExp(g.teamName(team) + ':'));
        if (count === 1) assert.match(g.alerts.at(-1), /Solo game complete!/);
        g.showMainMenu();
        usePlayers(g, 2);
        g.initRealtimeBattle(ownCardsOnly);
        assert.deepEqual({...g.crystals}, {blue: 30, red: 30});
        assert.equal(g.board.size, 0);
    }
});

test('separate decks require cards for all selected players and allow scanning missing cards after choosing four', () => {
    const g = game();
    g.addCard('block');
    usePlayers(g, 4);
    g.initRealtimeBattle(true);
    assert.equal(g.battleInProgress, false);
    assert.equal(g.nextScanTeam(), 'red');
    assert.match(g.document.getElementById('result').innerText, /each team.*Blue, Red, Yellow, Green/);
    for (let i = 0; i < 3; i++) g.addCard('block');
    g.initRealtimeBattle(true);
    assert.equal(g.battleInProgress, true);
    for (const team of allTeams) assert.equal(g.getDeploymentCards(team).length, 1);
});

test('four-player elimination continues with two survivors and ends with the final survivor or no survivors', () => {
    const g = game();
    g.addCard('block');
    usePlayers(g, 4);
    g.initRealtimeBattle();
    g.crystals.blue = g.crystals.red = 0;
    assert.equal(g.checkRealtimeBattleEnd(), false);
    g.crystals.yellow = 0;
    assert.equal(g.checkRealtimeBattleEnd(), true);
    assert.match(g.alerts.at(-1), /Green team wins!.*Blue, Red, Yellow are eliminated/);
    g.showMainMenu();
    g.initRealtimeBattle();
    for (const team of allTeams) g.crystals[team] = 0;
    assert.equal(g.checkRealtimeBattleEnd(), true);
    assert.match(g.alerts.at(-1), /Tie game!.*No player has/);
    g.showMainMenu();
    usePlayers(g, 1);
    g.initRealtimeBattle();
    assert.equal(g.battleInProgress, true);
    g.crystals.blue = 0;
    assert.equal(g.checkRealtimeBattleEnd(), true);
    assert.match(g.alerts.at(-1), /Solo game complete! Blue: 0/);
});

test('scoring finds any winning color and only draws for ties at the highest score', () => {
    for (const start of [gameStarts[0], gameStarts[1]]) {
        const g = game();
        g.addCard('block');
        usePlayers(g, 4);
        start(g);
        for (const scores of [[0,0,8,4], [0,0,4,8], [1,1,4,4], [1,1,1,1]]) {
            g.board.clear();
            scores.forEach((count, index) => {
                for (let i = 0; i < count; i++) g.board.set(`${i},${index*10}`, allTeams[index]);
            });
            g.battleInProgress = true;
            g.finishBattle();
            assert.match(g.alerts.at(-1), scores[2] === scores[3] ? /Tie game!/ : scores[2] > scores[3] ? /Yellow team wins!/ : /Green team wins!/);
        }
    }
});

test('all four colors survive and inherit majority births; three-color ties use a present color independent of insertion order', () => {
    for (const a of allTeams) for (const b of allTeams) for (const c of allTeams) {
        for (const x of [-3,-2,-1,0,1,2]) {
            const entries = [[`${x-1},-1`, a], [`${x},-1`, b], [`${x+1},-1`, c]];
            const next = Life.step(new Map(entries));
            const born = next.get(`${x},0`);
            const majority = [a,b,c].find(team => [a,b,c].filter(value => value === team).length >= 2);
            if (majority) assert.equal(born, majority);
            else assert.ok([a,b,c].includes(born));
            assert.equal(born, Life.step(new Map(entries.reverse())).get(`${x},0`));
            assert.equal(next.get(`${x},-1`), b, 'Survivors retain their own color');
        }
    }
    for (const team of allTeams) {
        const board = new Map();
        Life.place(board, pattern([[0,0],[1,0],[0,1],[1,1]]), 0, 0, team);
        assert.equal(Life.same(board, Life.step(board)), true);
    }
});

test('battlefield renders players three and four in yellow and green', () => {
    const g = game();
    g.addCard('block');
    usePlayers(g, 4);
    g.initRealtimeBattle();
    const fills = [];
    const ctx = {fillRect(){ fills.push(this.fillStyle); }, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}};
    g.canvas.getContext = () => ctx;
    g.view = {left: 0, top: 0, scale: 10};
    allTeams.forEach((team, i) => g.board.set(`${i},0`, team));
    g.drawBattlefield();
    assert.deepEqual(fills.slice(1), ['#38bdf8', '#fb7185', '#facc15', '#4ade80']);
});
