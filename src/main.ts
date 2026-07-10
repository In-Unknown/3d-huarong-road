import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';
import { LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS } from './data';
import { GameLogic } from './logic';
import { createRoom, createBlocks, updateSelectionVisuals, resetHover } from './renderer';

// 1. 初始化游戏逻辑
const logic = new GameLogic(LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS);

// --- 全局状态变量 ---
let selectedBlockId: string | null = null;
let isAnimating = false;
let pointerDownPos = { x: 0, y: 0 };
const CLICK_THRESHOLD = 5;

// 2. 初始化 Three.js 核心组件
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(LEVEL_BOUNDS.x * 1.2, LEVEL_BOUNDS.y * 1.5, LEVEL_BOUNDS.z * 2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app')!.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(LEVEL_BOUNDS.x / 2, LEVEL_BOUNDS.y / 2, LEVEL_BOUNDS.z / 2);
controls.enablePan = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.panSpeed = 1.0;
controls.update();

// 3. 构建场景内容
createRoom(scene, LEVEL_BOUNDS, LEVEL_EXITS, renderer);
const blockMeshes = createBlocks(LEVEL_BLOCKS, scene, renderer);

// 4. 交互逻辑
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointermove', (event) => {
    resetHover(blockMeshes);
    if (!selectedBlockId || isAnimating) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const activeData = blockMeshes.get(selectedBlockId)!;
    const intersects = raycaster.intersectObjects(activeData.group.children.filter(c => c instanceof THREE.Mesh));

    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.face && typeof hit.face.materialIndex !== 'undefined') {
            const block = logic.blocks.find(b => b.id === selectedBlockId)!;
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
            activeData.materials[hit.face.materialIndex].emissive.setHex(
                logic.canMove(block, normal.x, normal.y, normal.z) ? 0x888888 : 0x880000
            );
        }
    }
});

window.addEventListener('pointerdown', (e) => { pointerDownPos = { x: e.clientX, y: e.clientY }; });
window.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }, { passive: false });
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('pointerup', (event) => {
    if (isAnimating || event.button !== 0) return;
    if (Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y) > CLICK_THRESHOLD) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const allMeshes = Array.from(blockMeshes.values()).flatMap(b => b.group.children.filter(c => c instanceof THREE.Mesh));
    const intersects = raycaster.intersectObjects(allMeshes);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const clickedId = hit.object.userData.id;

        if (selectedBlockId !== clickedId) {
            selectedBlockId = clickedId;
            updateSelectionVisuals(blockMeshes, selectedBlockId);
            resetHover(blockMeshes);
        }
        else if (hit.face) {
            const block = logic.blocks.find(b => b.id === clickedId)!;
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
            const { group } = blockMeshes.get(block.id)!;

            const dx = normal.x, dy = normal.y, dz = normal.z;

            if (logic.canMove(block, dx, dy, dz)) {
                isAnimating = true;
                resetHover(blockMeshes);

                // Shift 长距离滑动
                if (event.shiftKey) {
                    let moveCount = 0;
                    // 限制：最多移动到完全出去为止
                    while (logic.canMove(block, dx, dy, dz)) {
                        block.position.x += dx;
                        block.position.y += dy;
                        block.position.z += dz;
                        moveCount++;
                        // 如果这一步走完已经全出去了，直接跳出循环
                        if (logic.checkBlockExited(block)) break;
                    }

                    const duration = Math.max(200, moveCount * 80);

                    new TWEEN.Tween(group.position)
                        .to({ x: block.position.x, y: block.position.y, z: block.position.z }, duration)
                        .easing(TWEEN.Easing.Quadratic.Out)
                        .onComplete(() => {
                            if (logic.checkBlockExited(block)) {
                                removeBlockAfterExit(block.id);
                            } else {
                                isAnimating = false;
                                checkVictory();
                            }
                        }).start();
                } else {
                    // 标准单步移动
                    block.position.x += dx;
                    block.position.y += dy;
                    block.position.z += dz;

                    new TWEEN.Tween(group.position)
                        .to({ x: block.position.x, y: block.position.y, z: block.position.z }, 200)
                        .easing(TWEEN.Easing.Quadratic.Out)
                        .onComplete(() => {
                            if (logic.checkBlockExited(block)) {
                                removeBlockAfterExit(block.id);
                            } else {
                                isAnimating = false;
                                checkVictory();
                            }
                        }).start();
                }
            } else {
                // 不可移动：触发撞墙震颤
                isAnimating = true; resetHover(blockMeshes);
                const orig = { x: group.position.x, y: group.position.y, z: group.position.z };
                new TWEEN.Tween(group.position)
                    .to({ x: orig.x + dx * 0.2, y: orig.y + dy * 0.2, z: orig.z + dz * 0.2 }, 70)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .chain(new TWEEN.Tween(group.position).to(orig, 70).onComplete(() => isAnimating = false))
                    .start();
            }
        }
    }
});

function checkVictory() {
    if (logic.checkVictory()) {
        setTimeout(() => alert('全目标达成！'), 100);
    }
}

function removeBlockAfterExit(blockId: string) {
    const block = logic.blocks.find(b => b.id === blockId);
    if (!block) return;

    const meshData = blockMeshes.get(blockId);
    if (!meshData) return;

    const group = meshData.group;
    const normal = new THREE.Vector3(0, 0, 0);

    block.cells.forEach(cell => {
        const x = block.position.x + cell.x;
        const y = block.position.y + cell.y;
        const z = block.position.z + cell.z;
        if (x < 0) normal.x -= 1;
        if (x >= LEVEL_BOUNDS.x) normal.x += 1;
        if (y < 0) normal.y -= 1;
        if (y >= LEVEL_BOUNDS.y) normal.y += 1;
        if (z < 0) normal.z -= 1;
        if (z >= LEVEL_BOUNDS.z) normal.z += 1;
    });

    // 保护：如果 normal 长度为 0，避免 normalize() 返回 NaN
    if (normal.lengthSq() > 0) {
        normal.normalize().multiplyScalar(10);
    } else {
        normal.set(1, 0, 0).multiplyScalar(10); // 默认飞向 +X 方向
    }

    new TWEEN.Tween(group.position)
        .to({
            x: group.position.x + normal.x,
            y: group.position.y + normal.y,
            z: group.position.z + normal.z
        }, 500)
        .easing(TWEEN.Easing.Quadratic.In)
        .onComplete(() => {
            scene.remove(group);
            if (meshData.ghost) scene.remove(meshData.ghost);
            blockMeshes.delete(blockId);
            logic.removeBlock(blockId);
            selectedBlockId = null;
            isAnimating = false;
            checkVictory();
        })
        .start();
}

// 5. 窗口尺寸响应
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio); renderer.setSize(window.innerWidth, window.innerHeight);
});

// 6. 渲染主循环
scene.add(new THREE.AmbientLight(0xffffff, 1.0));
function animate(time: number) { requestAnimationFrame(animate); TWEEN.update(time); controls.update(); renderer.render(scene, camera); }
animate(performance.now());
