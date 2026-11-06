import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS, LEVEL_VIEW } from './data';
import { GameLogic } from './logic';
import { createRoom, createBlocks, updateSelectionVisuals, resetHover, setFaceHover, disposeObjects } from './renderer';
import type { GameState } from './gameState';
import type { Direction } from './types';
import { checkVictory, isExitCausesDefeat } from './winLoss';
import { DIRECTIONS, directionVector } from './space';
import { PointerGestures } from './gestures';
import { fitCamera, fitShadow, effectiveDPR } from './view';
import { constrainRoomNavigation } from './navigation';
import { createStudioEnvironment } from './lighting';

const root = document.getElementById('app')!;
root.innerHTML = `
    <div id="viewport" aria-label="三维华容道棋盘"></div>
    <header class="toolbar">
      <div><h1>3D 华容道</h1><p id="progress"></p></div>
      <nav aria-label="游戏操作">
        <button id="fit">复位视角</button><button id="restart">重新开始</button>
      </nav>
    </header>
    <details class="help">
      <summary>玩法与操作</summary>
      <p>红块到达绿色目标，蓝块从蓝色洞口离开。红块离开房间会失败。灰块可移动，深灰墙块不可移动。</p>
      <p>点击积木选中，再点击它的面向外移动一格。面上的箭头标注允许方向；无箭头的自由块可六向移动。</p>
      <p>拖动旋转，滚轮缩放，中键平移；双指缩放和平移。按住 Shift 或勾选“滑动到底”，移动至阻挡或完全退出。</p>
      <p>点击空白或按 Esc 取消选择。也可使用下方 X / Y / Z 方向按钮移动。</p>
    </details>
    <section class="selection" aria-label="选中积木">
      <div class="selection-heading"><span id="selection-label">点击积木开始</span><label><input id="slide" type="checkbox"> 滑动到底</label></div>
      <div class="directions">${DIRECTIONS.map(d => `<button data-direction="${d}" aria-label="沿 ${d[1].toUpperCase()} ${d[0] === '+' ? '正' : '负'}方向移动">${d[1].toUpperCase()}${d[0] === '+' ? '+' : '−'}</button>`).join('')}</div>
      <p id="feedback" role="status" aria-live="polite">将红块送到目标，并让蓝块离开。</p>
    </section>
    <dialog id="result" aria-labelledby="result-title">
      <h2 id="result-title"></h2><p id="result-message"></p>
      <button id="result-restart">再玩一次</button><button id="result-dismiss">查看棋盘</button>
    </dialog>
`;
const viewport = document.getElementById('viewport')!;
const progress = document.getElementById('progress')!;
const selectionLabel = document.getElementById('selection-label')!;
const feedback = document.getElementById('feedback')!;
const slide = document.getElementById('slide') as HTMLInputElement;
const directionButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-direction]')];
const resultDialog = document.getElementById('result') as HTMLDialogElement;

function showResult(): void {
    document.getElementById('result-title')!.textContent = gameState.phase === 'won' ? '全部目标达成！' : '游戏失败';
    document.getElementById('result-message')!.textContent = gameState.phase === 'won'
        ? `你用 ${gameState.moves} 步完成了关卡。` : '红色目标块离开了房间，可以重新开始再试一次。';
    if (!resultDialog.open) resultDialog.show();
}

const gameState: GameState = {
    logic: new GameLogic(LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS),
    blockMeshes: new Map(), selectedBlockId: null, phase: 'playing', moves: 0,
};
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151b23);
const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 150);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
viewport.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '拖动旋转棋盘，点击积木选择');
const controls = new OrbitControls(camera, renderer.domElement);
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.screenSpacePanning = true;
controls.enableDamping = false;
controls.minPolarAngle = 0.08; controls.maxPolarAngle = Math.PI - 0.08;
constrainRoomNavigation(controls, camera, LEVEL_BOUNDS, LEVEL_VIEW);
const room = createRoom(scene, gameState.logic.bounds, gameState.logic.exits);
gameState.blockMeshes = createBlocks(gameState.logic.blocks, scene);
const studio = createStudioEnvironment(renderer, scene);
scene.add(new THREE.HemisphereLight(0xe5edff, 0xa4a9b1, 0.35));
const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
dirLight.castShadow = true; dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.radius = 4;
dirLight.shadow.bias = -0.00012; dirLight.shadow.normalBias = 0.018;
scene.add(dirLight, dirLight.target); fitShadow(dirLight, gameState.logic.bounds);

const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, renderTarget);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.3, 1.4);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
const aaPass = new ShaderPass(FXAAShader);
composer.addPass(aaPass);

let dirty = true, hoverDirty = true, lostContext = false, stopped = false, manualCamera = false;
let pointer: { x: number; y: number } | null = null;
let flash: { id: string; until: number } | null = null;
let animation: { id: string; kind: 'move' | 'exit' | 'blocked'; from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number; direction: Direction } | null = null;
const gestures = new PointerGestures();
const raycaster = new THREE.Raycaster();
const typeNames = { target: '红色目标块', exit: '蓝色出口块', obstacle: '灰色障碍块', wall: '固定墙块' };

function invalidate(shadows = false): void {
    dirty = hoverDirty = true;
    if (shadows) renderer.shadowMap.needsUpdate = true;
}
function updateUI(): void {
    const { logic } = gameState;
    const targets = [...logic.targetGoals].filter(([id, goal]) => {
        const p = logic.blocks.find(b => b.id === id)?.position;
        return p && p.x === goal.x && p.y === goal.y && p.z === goal.z;
    }).length;
    const exits = [...logic.exitIds].filter(id => logic.hasCompletedExit(id)).length;
    progress.textContent = `目标 ${targets}/${logic.targetGoals.size} · 出口 ${exits}/${logic.exitIds.size} · ${gameState.moves} 步`;
    const b = logic.blocks.find(b => b.id === gameState.selectedBlockId);
    selectionLabel.textContent = b ? `${typeNames[b.type]} · ${b.allowedDirs.length === 6 ? '六向自由移动' : '按箭头方向移动'}` : '点击积木开始';
    for (const button of directionButtons) {
        const dir = button.dataset.direction as Direction, v = directionVector(dir);
        button.disabled = lostContext || gameState.phase !== 'playing' || !b || !logic.canMove(b, v.x, v.y, v.z);
    }
    root.dataset.phase = gameState.phase;
}
function select(id: string | null): void {
    if (gameState.phase !== 'playing') return;
    gameState.selectedBlockId = id;
    updateSelectionVisuals(gameState.blockMeshes, id); resetHover(gameState.blockMeshes);
    feedback.textContent = id ? '点击端面向外移动，或使用方向按钮。' : '将红块送到目标，并让蓝块离开。';
    updateUI(); invalidate();
}
function finishTurn(): void {
    gameState.phase = checkVictory(gameState) ? 'won' : 'playing';
    if (gameState.phase === 'won') { feedback.textContent = '全部目标达成！你赢了。可以重新开始。'; showResult(); }
    updateUI(); invalidate(true);
}
function requestMove(direction: Direction, maximum = slide.checked): boolean {
    if (lostContext || gameState.phase !== 'playing') return false;
    const b = gameState.logic.blocks.find(b => b.id === gameState.selectedBlockId);
    if (!b || b.type === 'wall' || !DIRECTIONS.includes(direction)) return false;
    const v = directionVector(direction);
    const move = maximum ? gameState.logic.getSlideVector(b, direction) : [v.x, v.y, v.z, 1];
    const count = gameState.logic.moveBlock(b, move[0], move[1], move[2]);
    if (!count) {
        flash = { id: b.id, until: performance.now() + 220 };
        feedback.textContent = b.allowedDirs.includes(direction) ? '这个方向被挡住了。' : '这块积木不能沿这个方向移动。';
        resetHover(gameState.blockMeshes);
        const data = gameState.blockMeshes.get(b.id)!;
        const from = data.group.position.clone();
        animation = { id: b.id, kind: 'blocked', from,
            to: from.clone().add(new THREE.Vector3(v.x, v.y, v.z).multiplyScalar(0.2)),
            start: performance.now(), duration: 140, direction };
        gameState.phase = 'animating'; updateUI(); invalidate(true);
        return false;
    }
    flash = null;
    updateSelectionVisuals(gameState.blockMeshes, b.id);
    const data = gameState.blockMeshes.get(b.id)!;
    animation = { id: b.id, kind: 'move', from: data.group.position.clone(), to: new THREE.Vector3(b.position.x, b.position.y, b.position.z),
        start: performance.now(), duration: count / 0.012, direction };
    gameState.phase = 'animating'; gameState.moves++;
    resetHover(gameState.blockMeshes); feedback.textContent = '移动中…'; updateUI(); invalidate(true);
    return true;
}
function advanceAnimation(now: number): void {
    if (!animation) return;
    const a = animation, data = gameState.blockMeshes.get(a.id);
    if (!data) { animation = null; finishTurn(); return; }
    const t = Math.min(1, (now - a.start) / a.duration);
    if (a.kind === 'blocked') {
        const halfway = t < 0.5;
        const segment = halfway ? t * 2 : (t - 0.5) * 2;
        const eased = halfway ? 1 - (1 - segment) ** 2 : segment;
        data.group.position.lerpVectors(halfway ? a.from : a.to, halfway ? a.to : a.from, eased);
        invalidate(true);
        if (t < 1) return;
        data.group.position.copy(a.from); animation = null;
        gameState.phase = 'playing'; updateUI(); invalidate(true);
        return;
    }
    const eased = a.kind === 'exit' ? t ** 2 : 1 - (1 - t) ** 2;
    data.group.position.lerpVectors(a.from, a.to, eased);
    invalidate(true);
    if (t < 1) return;
    animation = null;
    const block = gameState.logic.blocks.find(b => b.id === a.id)!;
    if (a.kind === 'exit') {
        gameState.logic.removeBlock(a.id);
        disposeObjects(data.group, data.ghost); gameState.blockMeshes.delete(a.id);
        gameState.selectedBlockId = null;
        feedback.textContent = '积木已离开房间。'; finishTurn();
    } else if (gameState.logic.checkBlockExited(block)) {
        if (isExitCausesDefeat(block)) {
            gameState.phase = 'lost';
            feedback.textContent = '目标块离开了房间，游戏失败。点击“重新开始”再试一次。';
            showResult();
            updateUI(); invalidate(true);
        } else {
            const v = directionVector(a.direction);
            animation = { ...a, kind: 'exit', from: data.group.position.clone(),
                to: data.group.position.clone().add(new THREE.Vector3(v.x, v.y, v.z).multiplyScalar(10)),
                start: now, duration: 500 };
        }
    } else { feedback.textContent = '移动完成。'; finishTurn(); }
}

function restart(): void {
    animation = null; flash = null; gestures.clear(); pointer = null;
    manualCamera = false;
    resultDialog.close();
    for (const data of gameState.blockMeshes.values()) disposeObjects(data.group, data.ghost);
    gameState.logic = new GameLogic(LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS);
    gameState.blockMeshes = createBlocks(gameState.logic.blocks, scene);
    gameState.phase = 'playing'; gameState.selectedBlockId = null; gameState.moves = 0;
    slide.checked = false;
    feedback.textContent = '已重新开始。将红块送到目标，并让蓝块离开。';
    fitCamera(camera, controls, gameState.logic.bounds, true);
    updateUI(); invalidate(true);
}

function pick(x: number, y: number): THREE.Intersection | undefined {
    const rect = renderer.domElement.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    scene.updateMatrixWorld(true); camera.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
    // Body meshes are the shared hover/click occluders. Decorative glyphs never steal hits.
    return raycaster.intersectObjects([...gameState.blockMeshes.values()].map(d => d.body).concat(room.occluders), false)[0];
}
function hitDirection(hit: THREE.Intersection): Direction | undefined {
    if (!hit.face) return;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
    return DIRECTIONS.find(d => { const v = directionVector(d); return v.x === n.x && v.y === n.y && v.z === n.z; });
}
function updateHover(): void {
    resetHover(gameState.blockMeshes);
    if (gameState.phase !== 'playing' || !pointer || gestures.active) return;
    const hit = pick(pointer.x, pointer.y);
    if (!hit || hit.object.userData.id !== gameState.selectedBlockId || !hit.face) return;
    const dir = hitDirection(hit), block = gameState.logic.blocks.find(b => b.id === gameState.selectedBlockId);
    if (!dir || !block) return;
    const v = directionVector(dir);
    setFaceHover(gameState.blockMeshes.get(block.id)!, DIRECTIONS.indexOf(dir), gameState.logic.canMove(block, v.x, v.y, v.z));
}

const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => {
    gestures.down(e.pointerId, e.clientX, e.clientY, e.button, e.isPrimary);
    pointer = { x: e.clientX, y: e.clientY }; invalidate();
}, { capture: true });
canvas.addEventListener('pointermove', e => {
    gestures.move(e.pointerId, e.clientX, e.clientY);
    pointer = { x: e.clientX, y: e.clientY }; invalidate();
});
canvas.addEventListener('pointerup', e => {
    const click = gestures.up(e.pointerId, e.clientX, e.clientY);
    pointer = e.pointerType === 'touch' ? null : { x: e.clientX, y: e.clientY };
    invalidate();
    if (!click || e.button !== 0 || gameState.phase !== 'playing' || lostContext) return;
    const hit = pick(e.clientX, e.clientY);
    if (!hit) { select(null); return; }
    const block = gameState.logic.blocks.find(b => b.id === hit.object.userData.id);
    if (!block || block.type === 'wall') return;
    if (gameState.selectedBlockId !== block.id) select(block.id);
    else { const dir = hitDirection(hit); if (dir) requestMove(dir, e.shiftKey || slide.checked); }
}, { capture: true });
canvas.addEventListener('pointercancel', e => {
    gestures.cancel(e.pointerId); pointer = null; invalidate();
});
canvas.addEventListener('lostpointercapture', e => {
    if (gestures.has(e.pointerId)) { gestures.cancel(e.pointerId); pointer = null; invalidate(); }
});
canvas.addEventListener('pointerleave', () => { pointer = null; invalidate(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
window.addEventListener('blur', () => { gestures.clear(); pointer = null; invalidate(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') select(null); });
controls.addEventListener('start', () => { manualCamera = true; });
controls.addEventListener('change', () => invalidate());
document.getElementById('restart')!.addEventListener('click', restart);
document.getElementById('result-restart')!.addEventListener('click', restart);
document.getElementById('result-dismiss')!.addEventListener('click', () => resultDialog.close());
document.getElementById('fit')!.addEventListener('click', () => { manualCamera = false; fitCamera(camera, controls, gameState.logic.bounds, true); invalidate(); });
directionButtons.forEach(b => b.addEventListener('click', () => requestMove(b.dataset.direction as Direction)));

let previousSize = '';
function resize(): void {
    const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
    const ratio = effectiveDPR(width, height, window.devicePixelRatio);
    const key = `${width},${height},${ratio}`;
    if (key === previousSize) return;
    previousSize = key;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio); composer.setSize(width, height);
    aaPass.uniforms.resolution.value.set(1 / (width * ratio), 1 / (height * ratio));
    if (!manualCamera) fitCamera(camera, controls, gameState.logic.bounds);
    invalidate();
}
new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', resize);
let contextLostAt = 0;
canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); lostContext = true; contextLostAt = performance.now();
    gestures.clear(); pointer = null;
    feedback.textContent = '图形暂时中断，正在等待恢复…'; updateUI();
});
canvas.addEventListener('webglcontextrestored', () => {
    studio.rebuild();
    if (animation) animation.start += performance.now() - contextLostAt;
    lostContext = false;
    feedback.textContent = gameState.phase === 'lost' ? '游戏失败，可重新开始。' : gameState.phase === 'won' ? '全部目标达成！' : '画面已恢复。';
    updateUI(); invalidate(true);
});

function frame(now: number): void {
    if (stopped) return;
    requestAnimationFrame(frame);
    if (lostContext || document.hidden) return;
    resize(); // Also catches device-pixel-ratio changes without a resize event.
    advanceAnimation(now);
    if (flash) {
        const data = gameState.blockMeshes.get(flash.id);
        if (data) (data.edges.material as THREE.LineBasicMaterial).color.setHex(0xff6b6b);
        dirty = true;
        if (now >= flash.until) { flash = null; updateSelectionVisuals(gameState.blockMeshes, gameState.selectedBlockId); }
    }
    if (hoverDirty) { updateHover(); hoverDirty = false; }
    if (dirty) { composer.render(); dirty = false; }
}
resize(); fitCamera(camera, controls, gameState.logic.bounds, true);
updateUI(); invalidate(true); requestAnimationFrame(frame);
window.addEventListener('pagehide', e => {
    if (e.persisted) return;
    stopped = true; controls.dispose();
    for (const data of gameState.blockMeshes.values()) disposeObjects(data.group, data.ghost);
    disposeObjects(room.group, dirLight);
    composer.passes.forEach(p => p.dispose()); composer.dispose(); studio.dispose(); renderer.dispose();
});

// Module exports support reproducible integration checks; no global debug object is installed.
export { gameState, scene, camera, renderer, composer, controls, room, dirLight, requestMove, restart, select, pick, resize };
