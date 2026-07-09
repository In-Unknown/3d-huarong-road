import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ==========================================
// 1. 类型定义与游戏逻辑层
// ==========================================
type Vec3 = { x: number, y: number, z: number };

interface BlockDef {
    id: string;
    cells: Vec3[]; 
    position: Vec3; 
    allowedDirs: ('+x' | '-x' | '+y' | '-y' | '+z' | '-z')[]; 
    isTarget?: boolean;     
    targetPosition?: Vec3;  
}

class GameLogic {
    bounds: Vec3; 
    blocks: BlockDef[];
    
    constructor(bounds: Vec3, blocks: BlockDef[]) {
        this.bounds = bounds;
        this.blocks = blocks;
    }

    getBlockAt(x: number, y: number, z: number): BlockDef | null {
        for (const block of this.blocks) {
            for (const cell of block.cells) {
                if (block.position.x + cell.x === x &&
                    block.position.y + cell.y === y &&
                    block.position.z + cell.z === z) {
                    return block;
                }
            }
        }
        return null;
    }

    canMove(block: BlockDef, dx: number, dy: number, dz: number): boolean {
        if (dx > 0 && !block.allowedDirs.includes('+x')) return false;
        if (dx < 0 && !block.allowedDirs.includes('-x')) return false;
        if (dy > 0 && !block.allowedDirs.includes('+y')) return false;
        if (dy < 0 && !block.allowedDirs.includes('-y')) return false;
        if (dz > 0 && !block.allowedDirs.includes('+z')) return false;
        if (dz < 0 && !block.allowedDirs.includes('-z')) return false;

        for (const cell of block.cells) {
            const nextX = block.position.x + cell.x + dx;
            const nextY = block.position.y + cell.y + dy;
            const nextZ = block.position.z + cell.z + dz;

            if (nextX < 0 || nextX >= this.bounds.x || nextY < 0 || nextY >= this.bounds.y || nextZ < 0 || nextZ >= this.bounds.z) {
                return false; 
            }
            const occupant = this.getBlockAt(nextX, nextY, nextZ);
            if (occupant && occupant !== block) return false;
        }
        return true;
    }
}

// ==========================================
// 2. 关卡数据与初始化
// ==========================================
const LEVEL_BOUNDS = { x: 5, y: 5, z: 5 };
const LEVEL_BLOCKS: BlockDef[] = [
    { id: 'target1', isTarget: true, position: { x: 0, y: 1, z: 1 }, targetPosition: { x: 3, y: 1, z: 1 }, allowedDirs: ['+x', '-x'], cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] },
    { id: 'target2', isTarget: true, position: { x: 0, y: 0, z: 0 }, targetPosition: { x: 4, y: 0, z: 4 }, allowedDirs: ['+x', '-x', '+y', '-y', '+z', '-z'], cells: [{ x: 0, y: 0, z: 0 }] },
    { id: 'obs1', position: { x: 3, y: 0, z: 1 }, allowedDirs: ['+y', '-y'], cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 }] },
    { id: 'obs2', position: { x: 2, y: 1, z: 2 }, allowedDirs: ['+z', '-z'], cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }] },
    { id: 'obs3', position: { x: 1, y: 2, z: 0 }, allowedDirs: ['+z'], cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] },
    { id: 'obs4', position: { x: 0, y: 3, z: 3 }, allowedDirs: ['+x', '-x', '+y', '-y', '+z', '-z'], cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }] }
];

const logic = new GameLogic(LEVEL_BOUNDS, LEVEL_BLOCKS);

// --- 全局状态变量 ---
let selectedBlockId: string | null = null;
let isAnimating = false;
let pointerDownPos = { x: 0, y: 0 };
const CLICK_THRESHOLD = 5;

// --- 三维渲染场景初始化 ---
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

// --- 背景与贴图工具 ---
function createGridTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#222222'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#444444'; ctx.lineWidth = size * 0.02; ctx.strokeRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
}

const ROOM_EXPANSION = 0.2;
function createRoomMaterials() {
    const gridTex = createGridTexture();
    const repeats = [
        [LEVEL_BOUNDS.z + ROOM_EXPANSION, LEVEL_BOUNDS.y + ROOM_EXPANSION], [LEVEL_BOUNDS.z + ROOM_EXPANSION, LEVEL_BOUNDS.y + ROOM_EXPANSION],
        [LEVEL_BOUNDS.x + ROOM_EXPANSION, LEVEL_BOUNDS.z + ROOM_EXPANSION], [LEVEL_BOUNDS.x + ROOM_EXPANSION, LEVEL_BOUNDS.z + ROOM_EXPANSION],
        [LEVEL_BOUNDS.x + ROOM_EXPANSION, LEVEL_BOUNDS.y + ROOM_EXPANSION], [LEVEL_BOUNDS.x + ROOM_EXPANSION, LEVEL_BOUNDS.y + ROOM_EXPANSION]
    ];
    return repeats.map(r => {
        const t = gridTex.clone(); t.repeat.set(r[0], r[1]);
        t.offset.set(-ROOM_EXPANSION/2 / r[0], -ROOM_EXPANSION/2 / r[1]);
        t.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ map: t, side: THREE.BackSide, roughness: 1, transparent: true, opacity: 0.9 });
    });
}
const roomGeo = new THREE.BoxGeometry(LEVEL_BOUNDS.x + ROOM_EXPANSION, LEVEL_BOUNDS.y + ROOM_EXPANSION, LEVEL_BOUNDS.z + ROOM_EXPANSION);
const roomMesh = new THREE.Mesh(roomGeo, createRoomMaterials());
roomMesh.position.set(LEVEL_BOUNDS.x/2 - 0.5, LEVEL_BOUNDS.y/2 - 0.5, LEVEL_BOUNDS.z/2 - 0.5);
roomMesh.raycast = () => {}; 
scene.add(roomMesh);

// 定义画布上的四个物理方向
type CanvasDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

function createCanvasTexture(baseColor: number, dirs: CanvasDirection[]) {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, size, size);

    if (dirs.length === 0) return new THREE.CanvasTexture(canvas);

    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = size * 0.1; // 稍微加粗更清晰
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const padding = size * 0.2;
    const mid = size / 2;
    const head = size * 0.15;

    dirs.forEach(d => {
        ctx.beginPath();
        if (d === 'LEFT') {
            ctx.moveTo(mid, mid); ctx.lineTo(padding, mid);
            ctx.moveTo(padding + head, mid - head); ctx.lineTo(padding, mid); ctx.lineTo(padding + head, mid + head);
        } else if (d === 'RIGHT') {
            ctx.moveTo(mid, mid); ctx.lineTo(size - padding, mid);
            ctx.moveTo(size - padding - head, mid - head); ctx.lineTo(size - padding, mid); ctx.lineTo(size - padding - head, mid + head);
        } else if (d === 'UP') { // 对应 V+ 方向
            ctx.moveTo(mid, mid); ctx.lineTo(mid, padding);
            ctx.moveTo(mid - head, padding + head); ctx.lineTo(mid, padding); ctx.lineTo(mid + head, padding + head);
        } else if (d === 'DOWN') { // 对应 V- 方向
            ctx.moveTo(mid, mid); ctx.lineTo(mid, size - padding);
            ctx.moveTo(mid - head, size - padding - head); ctx.lineTo(mid, size - padding); ctx.lineTo(mid + head, size - padding - head);
        }
        ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
}

// --- 方块渲染与逻辑映射 ---
const blockMeshes: Map<string, { group: THREE.Group, materials: THREE.MeshStandardMaterial[], edges: THREE.LineSegments, ghost?: THREE.Group }> = new Map();

function createBlocks() {
    for (const block of logic.blocks) {
        const group = new THREE.Group();
        const baseColor = block.isTarget ? 0xcc3333 : 0xcccccc;
        const isFree = block.allowedDirs.length === 6;
        const blockMaterials: THREE.MeshStandardMaterial[] = [];

        // --- 建立每个面(Face)在允许特定世界方向移动时，应该在画布上画哪个方向的箭头 ---
        // 索引顺序: 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
        for (let j = 0; j < 6; j++) {
            const canvasDirs: CanvasDirection[] = [];
            
            if (!isFree) {
                block.allowedDirs.forEach(worldDir => {
                    // 逻辑：如果允许的世界方向与当前面的法线平行，则不画箭头
                    if (j === 0 || j === 1) if (worldDir.includes('x')) return;
                    if (j === 2 || j === 3) if (worldDir.includes('y')) return;
                    if (j === 4 || j === 5) if (worldDir.includes('z')) return;

                    // 核心映射：根据 Three.js 默认 UV 布局计算
                    if (j === 0) { // +X面: U轴是-Z, V轴是+Y
                        if (worldDir === '+y') canvasDirs.push('UP');
                        if (worldDir === '-y') canvasDirs.push('DOWN');
                        if (worldDir === '+z') canvasDirs.push('LEFT');
                        if (worldDir === '-z') canvasDirs.push('RIGHT');
                    }
                    else if (j === 1) { // -X面: U轴是+Z, V轴是+Y
                        if (worldDir === '+y') canvasDirs.push('UP');
                        if (worldDir === '-y') canvasDirs.push('DOWN');
                        if (worldDir === '+z') canvasDirs.push('RIGHT');
                        if (worldDir === '-z') canvasDirs.push('LEFT');
                    }
                    else if (j === 2) { // +Y面: U轴是+X, V轴是-Z
                        if (worldDir === '+x') canvasDirs.push('RIGHT');
                        if (worldDir === '-x') canvasDirs.push('LEFT');
                        if (worldDir === '+z') canvasDirs.push('DOWN');
                        if (worldDir === '-z') canvasDirs.push('UP');
                    }
                    else if (j === 3) { // -Y面: U轴是+X, V轴是+Z
                        if (worldDir === '+x') canvasDirs.push('RIGHT');
                        if (worldDir === '-x') canvasDirs.push('LEFT');
                        if (worldDir === '+z') canvasDirs.push('UP');
                        if (worldDir === '-z') canvasDirs.push('DOWN');
                    }
                    else if (j === 4) { // +Z面: U轴是+X, V轴是+Y
                        if (worldDir === '+x') canvasDirs.push('RIGHT');
                        if (worldDir === '-x') canvasDirs.push('LEFT');
                        if (worldDir === '+y') canvasDirs.push('UP');
                        if (worldDir === '-y') canvasDirs.push('DOWN');
                    }
                    else if (j === 5) { // -Z面: U轴是-X, V轴是+Y
                        if (worldDir === '+x') canvasDirs.push('LEFT');
                        if (worldDir === '-x') canvasDirs.push('RIGHT');
                        if (worldDir === '+y') canvasDirs.push('UP');
                        if (worldDir === '-y') canvasDirs.push('DOWN');
                    }
                });
            }

            blockMaterials.push(new THREE.MeshStandardMaterial({ 
                map: createCanvasTexture(baseColor, canvasDirs), 
                roughness: 0.6,
                polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
            }));
        }

        // --- 保持原有的 Voxel 剔除逻辑不变 ---
        const dirGeos: THREE.BufferGeometry[][] = [[], [], [], [], [], []];
        const outerFacesForEdges: THREE.BufferGeometry[] = [];
        for (const cell of block.cells) {
            const hasNeighbor = (dx: number, dy: number, dz: number) => block.cells.some(c => c.x === cell.x + dx && c.y === cell.y + dy && c.z === cell.z + dz);
            const faceConfigs = [
                { dir: [1, 0, 0], rot: [0, Math.PI/2, 0], pos: [0.5, 0, 0], idx: 0 }, { dir: [-1, 0, 0], rot: [0, -Math.PI/2, 0], pos: [-0.5, 0, 0], idx: 1 },
                { dir: [0, 1, 0], rot: [-Math.PI/2, 0, 0], pos: [0, 0.5, 0], idx: 2 }, { dir: [0, -1, 0], rot: [Math.PI/2, 0, 0], pos: [0, -0.5, 0], idx: 3 },
                { dir: [0, 0, 1], rot: [0, 0, 0], pos: [0, 0, 0.5], idx: 4 }, { dir: [0, 0, -1], rot: [0, Math.PI, 0], pos: [0, 0, -0.5], idx: 5 }
            ];
            faceConfigs.forEach(f => {
                if (!hasNeighbor(f.dir[0], f.dir[1], f.dir[2])) {
                    const plane = new THREE.PlaneGeometry(1, 1);
                    plane.rotateX(f.rot[0]); plane.rotateY(f.rot[1]); plane.rotateZ(f.rot[2]);
                    plane.translate(f.pos[0] + cell.x, f.pos[1] + cell.y, f.pos[2] + cell.z);
                    dirGeos[f.idx].push(plane); outerFacesForEdges.push(plane.clone());
                }
            });
        }
        const finalBlockGeo = BufferGeometryUtils.mergeGeometries(dirGeos.map(geos => geos.length > 0 ? BufferGeometryUtils.mergeGeometries(geos) : new THREE.BufferGeometry()), true);
        const blockMesh = new THREE.Mesh(finalBlockGeo, blockMaterials);
        blockMesh.userData = { id: block.id }; group.add(blockMesh);
        const edgeGeo = new THREE.EdgesGeometry(BufferGeometryUtils.mergeVertices(BufferGeometryUtils.mergeGeometries(outerFacesForEdges)), 1);
        const outlineMesh = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
        outlineMesh.renderOrder = 10;
        (outlineMesh.material as THREE.LineBasicMaterial).polygonOffset = true;
        (outlineMesh.material as THREE.LineBasicMaterial).polygonOffsetFactor = -1;
        (outlineMesh.material as THREE.LineBasicMaterial).polygonOffsetUnits = -1;
        group.add(outlineMesh);
        group.position.set(block.position.x, block.position.y, block.position.z);
        scene.add(group);

        let ghostGroup: THREE.Group | undefined;
        if (block.isTarget && block.targetPosition) {
            ghostGroup = new THREE.Group();
            const ghostMat = new THREE.LineDashedMaterial({ color: 0x00FF00, dashSize: 0.2, gapSize: 0.1, depthTest: false, transparent: true, opacity: 0.8 });
            const ghostOutline = new THREE.LineSegments(edgeGeo, ghostMat);
            ghostOutline.computeLineDistances(); ghostOutline.renderOrder = 999;
            ghostGroup.add(ghostOutline);
            ghostGroup.position.set(block.targetPosition.x, block.targetPosition.y, block.targetPosition.z);
            ghostGroup.visible = false;
            scene.add(ghostGroup);
        }
        blockMeshes.set(block.id, { group, materials: blockMaterials, edges: outlineMesh, ghost: ghostGroup });
    }
}
createBlocks();

// --- 交互逻辑 ---
function resetHover() { blockMeshes.forEach(d => d.materials.forEach(m => m.emissive.setHex(0x000000))); }
function updateSelectionVisuals() {
    blockMeshes.forEach((data, id) => {
        const isSelected = id === selectedBlockId;
        const edgeMat = data.edges.material as THREE.LineBasicMaterial;
        if (isSelected) { edgeMat.color.setHex(0x00FFFF); data.edges.renderOrder = 1000; edgeMat.opacity = 1.0; }
        else { edgeMat.color.setHex(0xFFFFFF); data.edges.renderOrder = 10; edgeMat.opacity = 0.9; }
        if (data.ghost) data.ghost.visible = isSelected;
    });
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointermove', (event) => {
    resetHover();
    if (!selectedBlockId || isAnimating) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const activeData = blockMeshes.get(selectedBlockId)!;
    const intersects = raycaster.intersectObjects(activeData.group.children.filter(c => c instanceof THREE.Mesh));
    
    if (intersects.length > 0) {
        const hit = intersects[0];
        // 【关键修复】：显式判断 hit.face 是否存在
        if (hit.face && typeof hit.face.materialIndex !== 'undefined') {
            const block = logic.blocks.find(b => b.id === selectedBlockId)!;
            // 此时 hit.face 已被 TypeScript 确定为非空
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
            updateSelectionVisuals();
            resetHover();
        } 
        // 【关键修复】：显式判断 hit.face 是否存在
        else if (hit.face) {
            const block = logic.blocks.find(b => b.id === clickedId)!;
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
            const { group } = blockMeshes.get(block.id)!;
            
            if (logic.canMove(block, normal.x, normal.y, normal.z)) {
                block.position.x += normal.x; block.position.y += normal.y; block.position.z += normal.z;
                isAnimating = true; resetHover();
                new TWEEN.Tween(group.position).to({ x: block.position.x, y: block.position.y, z: block.position.z }, 200)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .onComplete(() => {
                        isAnimating = false;
                        const targets = logic.blocks.filter(b => b.isTarget);
                        if (targets.every(t => t.position.x === t.targetPosition!.x && t.position.y === t.targetPosition!.y && t.position.z === t.targetPosition!.z)) {
                            setTimeout(() => alert('全目标达成！'), 100);
                        }
                    }).start();
            } else {
                isAnimating = true; resetHover();
                const orig = { x: group.position.x, y: group.position.y, z: group.position.z };
                new TWEEN.Tween(group.position).to({ x: orig.x + normal.x * 0.2, y: orig.y + normal.y * 0.2, z: orig.z + normal.z * 0.2 }, 70)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .chain(new TWEEN.Tween(group.position).to(orig, 70).onComplete(() => isAnimating = false))
                    .start();
            }
        }
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio); renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.AmbientLight(0xffffff, 1.0));
function animate(time: number) { requestAnimationFrame(animate); TWEEN.update(time); controls.update(); renderer.render(scene, camera); }
animate(performance.now());