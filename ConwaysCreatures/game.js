// Embedded into qr.html by tools/build_cards.py so the game is one upload.
const expectedCreatureDeckVersion = "DECK_VERSION";
const mainMenuDIV = document.getElementById('mainMenu');
const battleFieldDiv = document.getElementById('battleField');
const resultDiv = document.getElementById('result');
const video = document.getElementById('video');
const cancelScanBtn = document.getElementById('cancelScan');
const cards = document.getElementById('cards');
const playerTeams = ['blue', 'red', 'yellow', 'green'];
const teamColors = {blue: '#38bdf8', red: '#fb7185', yellow: '#facc15', green: '#4ade80'};
var playerCount = 2;
function activeTeams() { return playerTeams.slice(0, playerCount); }
function teamName(team) { return team[0].toUpperCase() + team.slice(1); }
var p1deck = [];
var currentCardNumber = 0;
var currentTeam = 'blue';
var currentSelectedCreture = null;
var board = new Map();
var battleInProgress = false;
var battleTimerHandle = null;
var battleStartedAt = 0;
var battleDurationMs = 60000;
var generation = 0;
var unchangedBoardFrames = 0;
var scanSession = 0;
var canvas = null;
var view = {left: 0, top: 0, scale: 10};
var placement = {x: 0, y: 0};
var pointer = null;
var battlefieldPointers = new Map();
var pinch = null;
var multiTouchGesture = false;
var renderPending = false;
var gameMode = 'classic';
var separateDecks = false;
var deploymentPaused = false;
var crystals = {blue: 30, red: 30};
var realtimeRemainingMs = 60000;
var realtimeClockAt = 0;
var lastTap = null;
var deploymentAnchor = null;
var menuVisible = true;
var previewPattern = null;
var previewBoard = new Map();
var previewGeneration = 0;
var previewTimer = null;

function ensureCreatureDeckLoaded() {
    if (typeof creatureDeckVersion === 'string' && creatureDeckVersion === expectedCreatureDeckVersion) return true;
    resultDiv.innerText = 'The game could not load its card data. Reload the page or upload a fresh copy of qr.html.';
    return false;
}
ensureCreatureDeckLoaded();

function stopCameraStream() {
    scanSession++;
    if (video.srcObject) video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    video.pause();
}

function showMainMenu() {
    clearTimeout(battleTimerHandle);
    battleInProgress = false;
    closeDeploymentPicker();
    currentSelectedCreture = null;
    resetBattlefieldGesture();
    document.getElementById('menuStatus').appendChild(resultDiv);
    resultDiv.classList.remove('floating-status');
    mainMenuDIV.style.display = 'flex';
    battleFieldDiv.style.display = 'none';
    video.style.display = 'none';
    cancelScanBtn.style.display = 'none';
    stopCameraStream();
    menuVisible = true;
    startMenuPreview();
}

function showScanner() {
    stopMenuPreview();
    document.body.appendChild(resultDiv);
    resultDiv.classList.add('floating-status');
    mainMenuDIV.style.display = 'none';
    battleFieldDiv.style.display = 'none';
    video.style.display = 'block';
    cancelScanBtn.style.display = 'block';
}

function cancelScan() {
    resultDiv.innerText = 'Scanning cancelled.';
    showMainMenu();
}

function normalizeCreatureName(rawName) {
    let value = String(rawName || '').trim();
    try { value = decodeURIComponent(value); } catch (_) {}
    value = value.split(/[?#]/)[0].split(/[\\/]/).pop().replace(/\.png$/i, '');
    if (Object.hasOwn(creatures, value)) return value;
    return Object.keys(creatures).find(id => id.toLowerCase() === value.toLowerCase()) || '';
}

function getCreatureByName(rawName) {
    const id = normalizeCreatureName(rawName);
    if (!id) return null;
    const pattern = creatures[id];
    // Decode only the selected pattern, not all 1.3 million cells on startup.
    return {...pattern, cells: LifeEngine.decodeRLE(pattern.rle), id};
}

function addCard(rawName) {
    const id = normalizeCreatureName(rawName);
    if (!id) return false;
    const team = nextScanTeam();
    p1deck.push({creatureName: id, team});
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'deck-card owned-' + team;
    row.textContent = `${teamName(team)}: ` + creatures[id].name + ' · ' + creatures[id].population.toLocaleString() + ' cells · Preview';
    row.addEventListener('click', () => selectMenuPreview(id));
    cards.appendChild(row);
    selectMenuPreview(id);
    updateScanTurn();
    resultDiv.innerText = `${creatures[id].name} added for ${teamName(team)}. ${teamName(nextScanTeam())} scans next.`;
    return true;
}

function nextScanTeam() { return activeTeams()[p1deck.length % playerCount]; }

function promptPlayerCount() {
    const answer = prompt('How many players? (1–4: Blue, Red, Yellow, Green). Cards are assigned in scan order.', '2');
    if (answer === null) return false;
    const count = Number(answer);
    if (!answer.trim() || !Number.isInteger(count) || count < 1 || count > 4) {
        resultDiv.innerText = 'Enter a whole number of players from 1 to 4, then start again.';
        return false;
    }
    playerCount = count;
    // Scans may happen before the game mode and player count are chosen.
    p1deck.forEach((card, index) => {
        card.team = activeTeams()[index % playerCount];
        const row = cards.children[index];
        row.className = 'deck-card owned-' + card.team;
        row.textContent = `${teamName(card.team)}: ${creatures[card.creatureName].name} · ${creatures[card.creatureName].population.toLocaleString()} cells · Preview`;
    });
    updateScanTurn();
    return true;
}

function updateScanTurn() {
    const counts = activeTeams().map(team => `${teamName(team)}: ${p1deck.filter(card => card.team === team).length} cards`).join(' / ');
    document.getElementById('scanTurn').textContent =
        `Next scan: ${teamName(nextScanTeam())} · ${counts}`;
    document.getElementById('scanCardButton').textContent = `Add card — ${teamName(nextScanTeam())}'s turn`;
}

function getDeploymentCards(team) {
    if (!activeTeams().includes(team)) return [];
    return separateDecks ? p1deck.filter(card => card.team === team) : p1deck;
}

function teamCanUseCard(team, id) {
    return getDeploymentCards(team).some(card => card.creatureName === id);
}

function resetMenuPreview() {
    previewBoard = new Map(previewPattern.cells.map(([x, y]) => [LifeEngine.key(x, y), 'blue']));
    previewGeneration = 0;
}

function selectMenuPreview(id) {
    previewPattern = getCreatureByName(id);
    if (!previewPattern) return;
    resetMenuPreview();
    startMenuPreview();
}

function drawMenuPreview() {
    if (!previewPattern) return;
    const target = document.getElementById('creaturePreview');
    const ctx = target.getContext('2d');
    const b = LifeEngine.bounds(previewBoard);
    // Keep the original footprint in view so spaceships visibly travel.
    const left = Math.min(-8, b.left - 4), top = Math.min(-8, b.top - 4);
    const right = Math.max(previewPattern.width + 8, b.right + 4);
    const bottom = Math.max(previewPattern.height + 8, b.bottom + 4);
    const scale = Math.min(12, target.width / (right-left), target.height / (bottom-top));
    const ox = (target.width-(right-left)*scale)/2-left*scale;
    const oy = (target.height-(bottom-top)*scale)/2-top*scale;
    ctx.fillStyle = '#081226';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.fillStyle = '#38bdf8';
    for (const position of previewBoard.keys()) {
        const [x, y] = LifeEngine.coordinates(position);
        ctx.fillRect(ox+x*scale, oy+y*scale, Math.max(1, scale-.5), Math.max(1, scale-.5));
    }
    document.getElementById('previewCaption').textContent =
        `${previewPattern.name} · Generation ${previewGeneration} · ${previewBoard.size.toLocaleString()} live cells`;
}

function advanceMenuPreview() {
    if (!menuVisible || document.hidden || !previewPattern) return;
    if (previewGeneration >= 160 || !previewBoard.size) resetMenuPreview();
    else { previewBoard = LifeEngine.step(previewBoard); previewGeneration++; }
    drawMenuPreview();
    previewTimer = setTimeout(advanceMenuPreview, previewBoard.size > 10000 ? 700 : 150);
}

function startMenuPreview() {
    clearTimeout(previewTimer);
    if (!menuVisible || document.hidden || !previewPattern) return;
    drawMenuPreview();
    previewTimer = setTimeout(advanceMenuPreview, 150);
}

function stopMenuPreview() {
    menuVisible = false;
    clearTimeout(previewTimer);
}

function canDeploySelectedCreature() {
    return currentSelectedCreture && (gameMode === 'realtime' ? battleInProgress : !battleInProgress);
}

function getCardMatrix() {
    return p1deck[currentCardNumber] ? getCreatureByName(p1deck[currentCardNumber].creatureName) : null;
}

function getCellCount(team) {
    let count = 0;
    for (const color of board.values()) if (color === team) count++;
    return count;
}

function getBoardState() { return new Map(board); }
function hasLiveCells() { return board.size > 0; }

function tickConwayBattle() {
    const previous = board;
    board = LifeEngine.step(board);
    generation++;
    return !LifeEngine.same(previous, board);
}

function sizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
    requestRender();
}

function fitBounds(bounds) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(20, bounds.right - bounds.left);
    const height = Math.max(20, bounds.bottom - bounds.top);
    view.scale = Math.min(18, rect.width / (width * 1.25), rect.height / (height * 1.25));
    view.left = (bounds.left + bounds.right) / 2 - rect.width / (2 * view.scale);
    view.top = (bounds.top + bounds.bottom) / 2 - rect.height / (2 * view.scale);
    requestRender();
}

function fitBattlefield() {
    let bounds = board.size ? LifeEngine.bounds(board) : null;
    if (canDeploySelectedCreature()) {
        const p = currentSelectedCreture;
        const pending = {left: placement.x, top: placement.y, right: placement.x + p.width, bottom: placement.y + p.height};
        bounds = bounds ? {left: Math.min(bounds.left, pending.left), top: Math.min(bounds.top, pending.top),
            right: Math.max(bounds.right, pending.right), bottom: Math.max(bounds.bottom, pending.bottom)} : pending;
    }
    fitBounds(bounds || {left: 0, top: 0, right: 40, bottom: 40});
}

function zoomBattlefield(factor) {
    const rect = canvas.getBoundingClientRect();
    const centerX = view.left + rect.width / (2 * view.scale);
    const centerY = view.top + rect.height / (2 * view.scale);
    view.scale = Math.max(.00001, Math.min(40, view.scale * factor));
    view.left = centerX - rect.width / (2 * view.scale);
    view.top = centerY - rect.height / (2 * view.scale);
    requestRender();
}

function resetBattlefieldGesture() {
    battlefieldPointers.clear();
    pointer = pinch = lastTap = null;
    multiTouchGesture = false;
}

function beginBattlefieldPinch() {
    const [a, b] = [...battlefieldPointers.values()];
    if (!a || !b) return;
    const distance = Math.hypot(b.x-a.x, b.y-a.y);
    if (distance < 1) return;
    const rect = canvas.getBoundingClientRect();
    pinch = {distance, scale: view.scale,
        worldX: view.left + ((a.x+b.x)/2-rect.left)/view.scale,
        worldY: view.top + ((a.y+b.y)/2-rect.top)/view.scale};
}

function moveBattlefieldPinch() {
    if (battlefieldPointers.size < 2) return;
    if (!pinch) { beginBattlefieldPinch(); return; }
    const [a, b] = [...battlefieldPointers.values()];
    const rect = canvas.getBoundingClientRect();
    const distance = Math.hypot(b.x-a.x, b.y-a.y);
    view.scale = Math.max(.00001, Math.min(40, pinch.scale*distance/pinch.distance));
    // Keep the same world position under the moving midpoint of both fingers.
    view.left = pinch.worldX - ((a.x+b.x)/2-rect.left)/view.scale;
    view.top = pinch.worldY - ((a.y+b.y)/2-rect.top)/view.scale;
    requestRender();
}

function requestRender() {
    if (!canvas || renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => { renderPending = false; drawBattlefield(); });
}

function drawBattlefield() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#081226';
    ctx.fillRect(0, 0, rect.width, rect.height);
    if (view.scale >= 8) {
        ctx.strokeStyle = '#24344c';
        ctx.lineWidth = .5;
        ctx.beginPath();
        for (let x = Math.ceil(view.left); x < view.left + rect.width / view.scale; x++) {
            const px = (x-view.left)*view.scale;
            ctx.moveTo(px, 0); ctx.lineTo(px, rect.height);
        }
        for (let y = Math.ceil(view.top); y < view.top + rect.height / view.scale; y++) {
            const py = (y-view.top)*view.scale;
            ctx.moveTo(0, py); ctx.lineTo(rect.width, py);
        }
        ctx.stroke();
    }
    const drawCell = (x, y) => {
        const px = (x-view.left)*view.scale, py = (y-view.top)*view.scale;
        if (px < -view.scale || py < -view.scale || px > rect.width || py > rect.height) return;
        ctx.fillRect(px, py, Math.max(1, view.scale - (view.scale >= 5 ? 1 : 0)),
            Math.max(1, view.scale - (view.scale >= 5 ? 1 : 0)));
    };
    for (const team of activeTeams()) {
        ctx.fillStyle = teamColors[team];
        for (const [key, color] of board) if (color === team) drawCell(...LifeEngine.coordinates(key));
    }
    if (canDeploySelectedCreature()) {
        ctx.fillStyle = teamColors[currentTeam];
        ctx.globalAlpha = .6;
        for (const [x, y] of currentSelectedCreture.cells) drawCell(x + placement.x, y + placement.y);
        ctx.globalAlpha = 1;
    }
}

function updatePlacementStatus() {
    if (gameMode === 'realtime') { updateBattleStatus(); return; }
    if (!currentSelectedCreture) {
        resultDiv.innerText = 'All creatures placed. Press Start. Drag to pan; pinch or use + / − to zoom.';
        return;
    }
    const p = currentSelectedCreture;
    resultDiv.innerText = `${teamName(currentTeam)}: ${p.name} (${p.width} × ${p.height}). Tap to place, or use Place for the translucent preview. Drag to pan.`;
}

function placeConwaysCreatures() {
    currentSelectedCreture = getCardMatrix();
    if (currentSelectedCreture) {
        const b = LifeEngine.bounds(board);
        placement = {x: board.size ? b.right + Math.max(20, Math.ceil(currentSelectedCreture.width / 10)) : 0,
            y: board.size ? b.top : 0};
    }
    updatePlacementStatus();
    fitBattlefield();
}

function canPlaceCreature(pattern, x, y) { return LifeEngine.canPlace(board, pattern, x, y); }

function placeSelectedCreature(x = placement.x, y = placement.y) {
    if (gameMode === 'realtime') return deployRealtimeCreature(x, y);
    if (battleInProgress || !currentSelectedCreture) return false;
    if (!LifeEngine.place(board, currentSelectedCreture, x, y, currentTeam)) {
        resultDiv.innerText = 'This position overlaps another creature. Choose a clear position.';
        return false;
    }
    currentCardNumber++;
    currentTeam = activeTeams()[currentCardNumber % playerCount];
    placeConwaysCreatures();
    return true;
}

function rotateCreature90(pattern) { return LifeEngine.rotate(pattern); }
function rotateCreture() {
    if (!canDeploySelectedCreature()) return;
    currentSelectedCreture = rotateCreature90(currentSelectedCreture);
    updatePlacementStatus();
    fitBattlefield();
}

function initBattle(mode = 'classic', ownCardsOnly = false, playersConfigured = false) {
    if (!ensureCreatureDeckLoaded()) return;
    if (!playersConfigured && !promptPlayerCount()) return;
    if (!p1deck.length) { resultDiv.innerText = 'Add at least one card first.'; return; }
    stopCameraStream();
    stopMenuPreview();
    closeDeploymentPicker();
    clearTimeout(battleTimerHandle);
    gameMode = mode;
    separateDecks = mode === 'realtime' && ownCardsOnly;
    board = new Map();
    battleInProgress = false;
    currentCardNumber = generation = unchangedBoardFrames = 0;
    currentTeam = 'blue';
    currentSelectedCreture = null;
    resetBattlefieldGesture();
    deploymentAnchor = null;
    mainMenuDIV.style.display = 'none';
    battleFieldDiv.style.display = 'block';
    document.body.appendChild(resultDiv);
    resultDiv.classList.add('floating-status');
    battleFieldDiv.innerHTML = `
        <div class="view-controls"><button onclick="zoomBattlefield(.5)" aria-label="Zoom out">−</button><button onclick="fitBattlefield()">Fit all</button><button onclick="zoomBattlefield(2)" aria-label="Zoom in">+</button></div>
        <canvas id="lifeCanvas" aria-label="Conway battlefield. Double-tap to choose a deployment; tap to place it. Drag to pan; pinch to zoom."></canvas>
        <div class="controls"><button onclick="rotateCreture()">Rotate</button><button onclick="placeSelectedCreature()">Place</button>
        ${mode === 'realtime' ? '<button onclick="openDeploymentPicker()">Deploy</button><button onclick="finishBattle()">End</button>' : '<button onclick="startBattle()">Start</button>'}
        <button onclick="showMainMenu()">Menu</button></div>
        <dialog id="deploymentPicker" aria-labelledby="deploymentTitle">
            <h2 id="deploymentTitle">Choose your team</h2>
            <p>Battle paused. Choose a team and card, then place it to resume. 1 crystal per live cell.</p>
            <div id="deploymentTeams" class="deployment-teams"></div>
            <p id="deploymentHint" role="status"></p>
            <div id="deploymentCards"></div>
            <button onclick="closeDeploymentPicker()">Cancel</button>
        </dialog>`;
    document.getElementById('deploymentPicker').addEventListener('cancel', event => {
        event.preventDefault();
        closeDeploymentPicker();
    });
    canvas = document.getElementById('lifeCanvas');
    // Handle battlefield gestures ourselves without zooming the browser page.
    for (const type of ['dblclick', 'touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange']) {
        canvas.addEventListener(type, event => event.preventDefault(), {passive: false});
    }
    canvas.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        battlefieldPointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
        canvas.setPointerCapture(event.pointerId);
        if (battlefieldPointers.size > 1) {
            multiTouchGesture = true;
            pointer = lastTap = null;
            if (!pinch) beginBattlefieldPinch();
            return;
        }
        pointer = {x: event.clientX, y: event.clientY, left: view.left, top: view.top, dragged: false};
    });
    canvas.addEventListener('pointermove', event => {
        if (!battlefieldPointers.has(event.pointerId)) return;
        battlefieldPointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
        if (multiTouchGesture) { moveBattlefieldPinch(); return; }
        if (!pointer) return;
        const dx = event.clientX-pointer.x, dy = event.clientY-pointer.y;
        if (Math.hypot(dx, dy) > 6) pointer.dragged = true;
        if (pointer.dragged) {
            view.left = pointer.left - dx/view.scale;
            view.top = pointer.top - dy/view.scale;
            requestRender();
        }
    });
    canvas.addEventListener('pointerup', event => {
        if (!battlefieldPointers.delete(event.pointerId)) return;
        if (multiTouchGesture) {
            // Neither finger lifting after a pinch counts as a tap or deployment.
            pointer = pinch = lastTap = null;
            if (battlefieldPointers.size >= 2) beginBattlefieldPinch();
            if (!battlefieldPointers.size) multiTouchGesture = false;
            return;
        }
        if (pointer && !pointer.dragged && canDeploySelectedCreature()) {
            const rect = canvas.getBoundingClientRect();
            const p = currentSelectedCreture;
            const x = Math.floor(view.left + (event.clientX-rect.left)/view.scale - p.width/2);
            const y = Math.floor(view.top + (event.clientY-rect.top)/view.scale - p.height/2);
            placeSelectedCreature(x, y);
            lastTap = null;
        } else if (pointer && !pointer.dragged && gameMode === 'realtime' && battleInProgress) {
            const now = event.timeStamp;
            if (lastTap && now-lastTap.time <= 900 && Math.hypot(event.clientX-lastTap.x, event.clientY-lastTap.y) < 24) {
                const rect = canvas.getBoundingClientRect();
                deploymentAnchor = {x: view.left+(event.clientX-rect.left)/view.scale,
                    y: view.top+(event.clientY-rect.top)/view.scale};
                openDeploymentPicker();
            } else lastTap = {time: now, x: event.clientX, y: event.clientY};
        } else {
            lastTap = null;
        }
        pointer = null;
    });
    const cancelPointer = event => {
        if (!battlefieldPointers.delete(event.pointerId)) return;
        pointer = pinch = lastTap = null;
        if (battlefieldPointers.size >= 2) beginBattlefieldPinch();
        if (!battlefieldPointers.size) multiTouchGesture = false;
    };
    canvas.addEventListener('pointercancel', cancelPointer);
    canvas.addEventListener('lostpointercapture', cancelPointer);
    canvas.addEventListener('wheel', event => {
        event.preventDefault();
        zoomBattlefield(event.ctrlKey ? Math.exp(-event.deltaY*.01) : event.deltaY < 0 ? 1.3 : 1/1.3);
    }, {passive: false});
    sizeCanvas();
    if (mode === 'realtime') {
        fitBattlefield();
        battleInProgress = true;
        realtimeRemainingMs = battleDurationMs;
        realtimeClockAt = performance.now();
        if (checkRealtimeBattleEnd()) return;
        updateBattleStatus();
        battleTimerHandle = setTimeout(advanceRealtimeBattle, 100);
    } else placeConwaysCreatures();
}

function initRealtimeBattle(ownCardsOnly = false) {
    if (!ensureCreatureDeckLoaded() || !promptPlayerCount()) return;
    if (!p1deck.length) { resultDiv.innerText = 'Add at least one card first.'; return; }
    if (ownCardsOnly && !activeTeams().every(team => p1deck.some(card => card.team === team))) {
        resultDiv.innerText = `Scan at least one card for each team before starting separate decks. Scan order: ${activeTeams().map(teamName).join(', ')}.`;
        return;
    }
    const answer = prompt('Starting crystals for EACH player (1 crystal per live cell):', '30');
    if (answer === null) return;
    const amount = Number(answer);
    if (!answer.trim() || !Number.isSafeInteger(amount) || amount < 0) {
        resultDiv.innerText = 'Enter a whole number of crystals, zero or greater, then start again.';
        return;
    }
    const durationAnswer = prompt('Match duration in seconds (card selection and placement pause the timer):', '60');
    if (durationAnswer === null) return;
    const seconds = Number(durationAnswer);
    if (!durationAnswer.trim() || !Number.isFinite(seconds) || seconds <= 0 ||
        !Number.isFinite(seconds*1000) || seconds*1000 > Number.MAX_SAFE_INTEGER || seconds*1000 <= 0) {
        resultDiv.innerText = 'Enter a positive match duration in seconds, then start again.';
        return;
    }
    battleDurationMs = seconds*1000;
    crystals = Object.fromEntries(activeTeams().map(team => [team, amount]));
    initBattle('realtime', ownCardsOnly, true);
}

function updateRealtimeClock() {
    const now = performance.now();
    if (gameMode === 'realtime' && battleInProgress && !deploymentPaused) {
        realtimeRemainingMs = Math.max(0, realtimeRemainingMs - (now-realtimeClockAt));
    }
    realtimeClockAt = now;
}

function setDeploymentPaused(paused) {
    updateRealtimeClock();
    deploymentPaused = paused;
}

function checkRealtimeBattleEnd() {
    if (gameMode !== 'realtime' || !battleInProgress) return false;
    updateRealtimeClock();
    if (realtimeRemainingMs <= 0) {
        finishBattle('Time is up.');
        return true;
    }
    const canAfford = team => getDeploymentCards(team).some(card => creatures[card.creatureName].population <= crystals[team]);
    const remaining = activeTeams().filter(team => getCellCount(team) > 0 || canAfford(team));
    if (remaining.length > 1 || (playerCount === 1 && remaining.length === 1)) return false;
    const eliminated = activeTeams().filter(team => !remaining.includes(team));
    const reason = !remaining.length ?
        `${playerCount === 2 ? 'Neither team has' : 'No player has'} live cells or enough crystals for another card.` :
        `${eliminated.map(teamName).join(', ')} ${eliminated.length === 1 ? 'is' : 'are'} eliminated: no live cells and not enough crystals for another card.`;
    finishBattle(reason, remaining[0] || 'draw');
    return true;
}

function advanceRealtimeBattle() {
    if (gameMode !== 'realtime' || !battleInProgress) return;
    if (!deploymentPaused) {
        if (checkRealtimeBattleEnd()) return;
        tickConwayBattle();
        requestRender();
        if (checkRealtimeBattleEnd()) return;
        updateBattleStatus();
    }
    // Stability alone does not end the match; time and elimination do.
    battleTimerHandle = setTimeout(advanceRealtimeBattle, 100);
}

function closeDeploymentPicker(keepPaused = false) {
    const picker = document.getElementById('deploymentPicker');
    if (picker?.open) picker.close();
    setDeploymentPaused(keepPaused);
    if (!keepPaused) {
        currentSelectedCreture = null;
        deploymentAnchor = null;
    }
    lastTap = null;
    if (gameMode === 'realtime' && battleInProgress) updateBattleStatus();
    requestRender();
}

function openDeploymentPicker() {
    if (gameMode !== 'realtime' || !battleInProgress) return;
    if (checkRealtimeBattleEnd()) return;
    setDeploymentPaused(true);
    currentSelectedCreture = null;
    lastTap = null;
    const teams = document.getElementById('deploymentTeams');
    teams.replaceChildren();
    document.getElementById('deploymentCards').replaceChildren();
    document.getElementById('deploymentHint').textContent = `First choose a team (${activeTeams().map(teamName).join(', ')}), then choose a card.`;
    for (const team of activeTeams()) {
        const button = document.createElement('button');
        button.className = 'team-' + team;
        button.textContent = `${teamName(team)} · ${crystals[team].toLocaleString()} crystals`;
        button.addEventListener('click', () => chooseDeploymentTeam(team));
        teams.appendChild(button);
    }
    const picker = document.getElementById('deploymentPicker');
    if (!picker.open) picker.showModal();
    updateBattleStatus();
    requestRender();
}

function chooseDeploymentTeam(team) {
    if (gameMode !== 'realtime' || !battleInProgress || !activeTeams().includes(team)) return;
    currentTeam = team;
    currentSelectedCreture = null;
    const list = document.getElementById('deploymentCards');
    list.replaceChildren();
    document.getElementById('deploymentHint').textContent =
        `${teamName(team)} has ${crystals[team].toLocaleString()} crystals. ` +
        (separateDecks ? 'Only this team’s scanned cards are available. ' : '') +
        'Cards can be reused; dimmed cards cost too much.';
    for (const id of new Set(getDeploymentCards(team).map(card => card.creatureName))) {
        const card = creatures[id];
        const button = document.createElement('button');
        button.className = 'deployment-card team-' + team;
        button.textContent = `${card.name} · ${card.population.toLocaleString()} crystals`;
        button.disabled = card.population > crystals[team];
        button.addEventListener('click', () => selectDeploymentCard(id));
        list.appendChild(button);
    }
}

function selectDeploymentCard(id) {
    if (gameMode !== 'realtime' || !battleInProgress || !teamCanUseCard(currentTeam, id)) return false;
    const pattern = getCreatureByName(id);
    if (!pattern || pattern.cells.length > crystals[currentTeam]) return false;
    currentSelectedCreture = pattern;
    const rect = canvas.getBoundingClientRect();
    const center = deploymentAnchor || {x: view.left + rect.width / (2*view.scale), y: view.top + rect.height / (2*view.scale)};
    placement = {x: Math.floor(center.x-pattern.width/2), y: Math.floor(center.y-pattern.height/2)};
    deploymentAnchor = null;
    closeDeploymentPicker(true);
    updateBattleStatus();
    requestRender();
    return true;
}

function deployRealtimeCreature(x, y) {
    const pattern = currentSelectedCreture;
    if (gameMode !== 'realtime' || !battleInProgress || !pattern || !teamCanUseCard(currentTeam, pattern.id)) return false;
    if (checkRealtimeBattleEnd()) return false;
    const cost = pattern.cells.length;
    if (cost > crystals[currentTeam]) return false;
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
        !Number.isSafeInteger(x + pattern.width) || !Number.isSafeInteger(y + pattern.height)) return false;
    // Only live cells in the new creature replace existing cells, including their team.
    for (const [dx, dy] of pattern.cells) board.set(LifeEngine.key(x+dx, y+dy), currentTeam);
    crystals[currentTeam] -= cost;
    currentSelectedCreture = null;
    setDeploymentPaused(false);
    if (checkRealtimeBattleEnd()) return true;
    updateBattleStatus();
    requestRender();
    return true;
}

function updateBattleStatus() {
    const liveScores = activeTeams().map(team => `${teamName(team)}: ${getCellCount(team).toLocaleString()}`).join(' / ');
    if (gameMode === 'realtime') {
        const pending = currentSelectedCreture;
        const balances = activeTeams().map(team => `${teamName(team)}: ${crystals[team].toLocaleString()}`).join(' · ');
        resultDiv.innerText = `${Math.ceil(realtimeRemainingMs/1000)}s left · Crystals — ${balances}\n` +
            `${deploymentPaused ? 'Paused · ' : ''}Generation ${generation} · Live cells — ${liveScores}\n` +
            (pending ? `${teamName(currentTeam)}: ${pending.name} (${pending.cells.length.toLocaleString()} crystals). Tap to deploy, or Place the translucent preview.` :
                'Double-tap or press Deploy to choose a team and card. Drag to pan; pinch to zoom.');
        return;
    }
    const seconds = Math.max(0, Math.ceil((battleStartedAt + battleDurationMs - Date.now())/1000));
    resultDiv.innerText = `Generation ${generation} · ${seconds}s left · ${liveScores}`;
}

function finishBattle(reason = '', winner = null) {
    if (!battleInProgress) return;
    clearTimeout(battleTimerHandle);
    battleInProgress = false;
    currentSelectedCreture = null;
    closeDeploymentPicker();
    requestRender();
    const scores = activeTeams().map(team => [team, getCellCount(team)]);
    const highScore = Math.max(...scores.map(([, count]) => count));
    const leaders = scores.filter(([, count]) => count === highScore);
    winner = winner || (leaders.length === 1 ? leaders[0][0] : 'draw');
    const outcome = playerCount === 1 ? 'Solo game complete!' :
        winner === 'draw' ? 'Tie game!' : `${teamName(winner)} team wins!`;
    resultDiv.innerText = 'Game over. Press Menu to start another match.';
    alert(`${outcome} ${scores.map(([team, count]) => `${teamName(team)}: ${count}`).join('; ')}. ${reason}`);
}

function startBattle() {
    if (gameMode === 'realtime') return;
    if (!ensureCreatureDeckLoaded() || battleInProgress) return;
    if (!board.size) { resultDiv.innerText = 'Place a creature first.'; return; }
    if (currentSelectedCreture) { resultDiv.innerText = 'Place all scanned creatures before starting.'; return; }
    const answer = prompt('Battle duration in seconds:', '60');
    if (answer === null) return;
    const seconds = Number(answer);
    battleDurationMs = Number.isFinite(seconds) && seconds > 0 ? seconds*1000 : 60000;
    battleStartedAt = Date.now();
    battleInProgress = true;
    unchangedBoardFrames = 0;
    updateBattleStatus();
    const advance = () => {
        if (!battleInProgress) return;
        if (Date.now() >= battleStartedAt + battleDurationMs) { finishBattle(); return; }
        const changed = tickConwayBattle();
        unchangedBoardFrames = changed ? 0 : unchangedBoardFrames + 1;
        requestRender();
        updateBattleStatus();
        if (!board.size) { finishBattle('All cells disappeared.'); return; }
        if (unchangedBoardFrames >= 5) { finishBattle('The board is stable.'); return; }
        // Schedule only after this generation finishes; large patterns run slower.
        battleTimerHandle = setTimeout(advance, 100);
    };
    battleTimerHandle = setTimeout(advance, 100);
}

function scanQR() {
    if (!ensureCreatureDeckLoaded()) return;
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
        resultDiv.innerText = 'QR scanning needs a browser with camera and BarcodeDetector support (for example Chrome on Android).';
        return;
    }
    stopCameraStream();
    const session = scanSession;
    showScanner();
    const scanningTeam = teamName(nextScanTeam());
    resultDiv.innerText = `${scanningTeam}'s turn. Starting camera…`;
    const detector = new BarcodeDetector({formats: ['qr_code']});
    navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}}).then(async stream => {
        if (session !== scanSession) { stream.getTracks().forEach(track => track.stop()); return; }
        video.srcObject = stream;
        await video.play();
        resultDiv.innerText = `${scanningTeam}'s turn: scan one card. Ownership applies in separate-deck mode.`;
        const frame = async () => {
            if (session !== scanSession) return;
            try {
                const codes = video.readyState >= 2 ? await detector.detect(video) : [];
                if (session !== scanSession) return;
                if (codes.length) {
                    if (!addCard(codes[0].rawValue)) resultDiv.innerText = 'This card is not in the current Golly deck.';
                    showMainMenu();
                } else requestAnimationFrame(frame);
            } catch (error) {
                resultDiv.innerText = 'Scan error: ' + error.message;
                showMainMenu();
            }
        };
        requestAnimationFrame(frame);
    }).catch(error => {
        if (session !== scanSession) return;
        resultDiv.innerText = 'Camera error: ' + error.message;
        showMainMenu();
    });
}

window.addEventListener('resize', sizeCanvas);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(previewTimer);
    else startMenuPreview();
});
const requestedCard = new URLSearchParams(window.location.search).get('card');
updateScanTurn();
if (requestedCard && ensureCreatureDeckLoaded()) addCard(requestedCard);
if (!previewPattern && ensureCreatureDeckLoaded()) selectMenuPreview('gosper-glider-gun');
