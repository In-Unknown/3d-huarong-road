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
    allowedAxes: ('x' | 'y' | 'z')[]; 
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
        if (dx !== 0 && !block.allowedAxes.includes('x')) return false;
        if (dy !== 0 && !block.allowedAxes.includes('y')) return false;
        if (dz !== 0 && !block.allowedAxes.includes('z')) return false;

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

// 关卡设计: 包含目标块和各种阻碍块 (包含自由滑动块)
const LEVEL_BOUNDS = { x: 10, y: 10, z: 5 };
const LEVEL_BLOCKS: BlockDef[] = [
    // 目标块: 红色，限制只能X方向移动
    { id: 'target1', isTarget: true, allowedAxes: ['x'], position: { x: 0, y: 1, z: 1 }, targetPosition: { x: 3, y: 1, z: 1 }, cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] },
    // 目标块2: 红色，XYZ自由滑动
    { id: 'target2', isTarget: true, allowedAxes: ['x', 'y', 'z'], position: { x: 0, y: 0, z: 0 }, targetPosition: { x: 4, y: 0, z: 4 }, cells: [{ x: 0, y: 0, z: 0 }] },
    
    // 阻碍块1: 灰色，只能 Y 轴移动 (柱子)
    { id: 'obs1', allowedAxes: ['y'], position: { x: 3, y: 0, z: 1 }, cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 }] },
    // 阻碍块2: 灰色，只能 Z 轴移动
    { id: 'obs2', allowedAxes: ['z'], position: { x: 2, y: 1, z: 2 }, cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }] },
    // 阻碍块3: 灰色，自由移动XYZ (L型)
    { id: 'obs3', allowedAxes: ['x', 'y', 'z'], position: { x: 1, y: 2, z: 0 }, cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] },
    // 阻碍块4: 灰色，自由移动XYZ
    { id: 'obs4', allowedAxes: ['x', 'y', 'z'], position: { x: 0, y: 3, z: 3 }, cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }] }
];

const logic = new GameLogic(LEVEL_BOUNDS, LEVEL_BLOCKS);

// ==========================================
// 2. Three.js 渲染层与材质
// ==========================================
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
// 1. 必须重新开启平移功能
controls.enablePan = true; 

// --- 彻底禁用浏览器默认的中键滚动行为 ---

window.addEventListener('mousedown', (e) => {
    // 1 是鼠标中键（滚轮按下）
    if (e.button === 1) {
        e.preventDefault();
    }
}, { passive: false });

// 额外保险：防止右键菜单弹出（如果你想用右键控制的话）
window.addEventListener('contextmenu', (e) => e.preventDefault());

// 2. 配置鼠标按键映射
// LEFT: 旋转视角 (ROTATE)
// MIDDLE: 按住滚轮平移视角 (PAN)
// RIGHT: 这里我设为旋转，或者你可以设为 THREE.MOUSE.PAN
controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE 
};

// 3. 推荐设置：平移时的速度感
controls.panSpeed = 1.0; 
controls.update();

// 光照
// 修改光照部分
scene.add(new THREE.AmbientLight(0xffffff, 1.0)); // 从 0.6 提高到 1.0
const dirLight = new THREE.DirectionalLight(0xffffff, 0.5); // 降低直射光，减少阴影对箭头的干扰
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// --- 4. 绘制具有内部背景的空间容器 ---
// --- 4. 绘制带有网格贴图的背景容器 ---

// 1. 动态生成一张简单的网格贴图 (128x128 像素，带边缘线)
function createGridTexture() {
    const size = 512; // 提升分辨率
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 0, size, size);
    
    // 线条宽度按比例缩放，确保锐利
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = size * 0.02; 
    ctx.strokeRect(0, 0, size, size);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    // 【关键】：各向异性过滤，防止侧看背景墙时模糊
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
}

const ROOM_EXPANSION = 0.01; // 整体扩大的尺寸（每边产生 0.1 的间隙）

// 2. 为每个面创建材质，确保网格重复次数与边界大小一致
function createRoomMaterials() {
    const gridTex = createGridTexture();
    
    // 关键：贴图重复率也要加上扩大的比例，这样每一个格子依然保持绝对的 1.0 单位大小
    const repeats = [
        [LEVEL_BOUNDS.z + ROOM_EXPANSION, LEVEL_BOUNDS.y + ROOM_EXPANSION], 
        [LEVEL_BOUNDS.z + ROOM_EXPANSION, LEVEL_BOUNDS.y + ROOM_EXPANSION], 
        [LEVEL_BOUNDS.x + ROOM_EXPANSION, LEVEL_BOUNDS.z + ROOM_EXPANSION], 
        [LEVEL_BOUNDS.x + ROOM_EXPANSION, LEVEL_BOUNDS.z + ROOM_EXPANSION], 
        [LEVEL_BOUNDS.x + ROOM_EXPANSION, LEVEL_BOUNDS.y + ROOM_EXPANSION], 
        [LEVEL_BOUNDS.x + ROOM_EXPANSION, LEVEL_BOUNDS.y + ROOM_EXPANSION] 
    ];

    return repeats.map(r => {
        const t = gridTex.clone();
        t.repeat.set(r[0], r[1]);
        // 核心：偏移贴图 0.1 距离，让内部的 1.0 格子正好居中对齐
        t.offset.set(-ROOM_EXPANSION/2 / r[0], -ROOM_EXPANSION/2 / r[1]);
        t.needsUpdate = true;
        return new THREE.MeshStandardMaterial({
            map: t,
            side: THREE.BackSide,
            roughness: 1,
            metalness: 0,
            transparent: true,
            opacity: 0.9
        });
    });
}

// 2. 几何体扩大：LEVEL_BOUNDS
const roomGeo = new THREE.BoxGeometry(
    LEVEL_BOUNDS.x + ROOM_EXPANSION, 
    LEVEL_BOUNDS.y + ROOM_EXPANSION, 
    LEVEL_BOUNDS.z + ROOM_EXPANSION
);
const roomMesh = new THREE.Mesh(roomGeo, createRoomMaterials());

// 坐标对齐
roomMesh.position.set(LEVEL_BOUNDS.x/2 - 0.5, LEVEL_BOUNDS.y/2 - 0.5, LEVEL_BOUNDS.z/2 - 0.5);

// 禁止射线拦截，确保能点到里面的方块
roomMesh.raycast = () => {}; 
scene.add(roomMesh);

// --- 生成精确箭头贴图 ---
function createCanvasTexture(baseColor: number, direction: 'horizontal' | 'vertical' | 'none') {
    const size = 1024; // 1024x1024 配合 4K 屏，效果等同于矢量
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    // 背景
    ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, size, size);

    if (direction !== 'none') {
        // 使用矢量路径绘制
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = size * 0.08; // 按比例设定的粗线
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const padding = size * 0.2;
        const mid = size / 2;
        const headSize = size * 0.15;

        ctx.beginPath();
        if (direction === 'horizontal') {
            // 水平主线
            ctx.moveTo(padding, mid);
            ctx.lineTo(size - padding, mid);
            // 左箭头
            ctx.moveTo(padding + headSize, mid - headSize);
            ctx.lineTo(padding, mid);
            ctx.lineTo(padding + headSize, mid + headSize);
            // 右箭头
            ctx.moveTo(size - padding - headSize, mid - headSize);
            ctx.lineTo(size - padding, mid);
            ctx.lineTo(size - padding - headSize, mid + headSize);
        } else {
            // 垂直主线
            ctx.moveTo(mid, padding);
            ctx.lineTo(mid, size - padding);
            // 上箭头
            ctx.moveTo(mid - headSize, padding + headSize);
            ctx.lineTo(mid, padding);
            ctx.lineTo(mid + headSize, padding + headSize);
            // 下箭头
            ctx.moveTo(mid - headSize, size - padding - headSize);
            ctx.lineTo(mid, size - padding);
            ctx.lineTo(mid + headSize, size - padding - headSize);
        }
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    
    // 【核心优化】：针对 4K 屏幕的锐化设置
    // 各向异性过滤：解决视角倾斜时的贴图模糊，这是 4K 体验提升最明显的地方
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    
    // 采用更高质量的过滤算法
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    return texture;
}

// 块渲染字典
const blockMeshes: Map<string, { group: THREE.Group, materials: THREE.MeshStandardMaterial[], edges: THREE.LineSegments, ghost?: THREE.Group }> = new Map();

function createBlocks() {
    for (const block of logic.blocks) {
        const group = new THREE.Group();
        const baseColor = block.isTarget ? 0xcc3333 : 0xcccccc;
        const isFree = block.allowedAxes.length === 3;

        // 1. 生成 6 个方向的共享材质
        const blockMaterials: THREE.MeshStandardMaterial[] = [];
        for (let j = 0; j < 6; j++) {
            let arrowDir: 'horizontal' | 'vertical' | 'none' = 'none';
            const isFaceX = (j === 0 || j === 1);
            const isFaceY = (j === 2 || j === 3);
            const isFaceZ = (j === 4 || j === 5);
            if (!isFree) {
                if (block.allowedAxes.includes('x') && !isFaceX) arrowDir = 'horizontal';
                else if (block.allowedAxes.includes('y') && !isFaceY) arrowDir = 'vertical';
                else if (block.allowedAxes.includes('z') && !isFaceZ) {
                    if (isFaceX) arrowDir = 'horizontal';
                    if (isFaceY) arrowDir = 'vertical';
                }
            }
            blockMaterials.push(new THREE.MeshStandardMaterial({ 
                map: createCanvasTexture(baseColor, arrowDir), 
                roughness: 0.6,
                polygonOffset: true, // 仍然保留偏移，确保边缘线优先
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            }));
        }

        // 用于存储每个方向暴露出来的面
        const dirGeometries: THREE.BufferGeometry[][] = [[], [], [], [], [], []];
        const outerFacesForEdges: THREE.BufferGeometry[] = [];

        // 2. 遍历单元格，进行“邻居检测”并剔除内部面
        for (const cell of block.cells) {
            const hasNeighbor = (dx: number, dy: number, dz: number) => 
                block.cells.some(c => c.x === cell.x + dx && c.y === cell.y + dy && c.z === cell.z + dz);

            // 定义 6 个面的配置
            const faceConfigs = [
                { dir: [1, 0, 0],  rot: [0, Math.PI/2, 0],  pos: [0.5, 0, 0],  idx: 0 }, // +X
                { dir: [-1, 0, 0], rot: [0, -Math.PI/2, 0], pos: [-0.5, 0, 0], idx: 1 }, // -X
                { dir: [0, 1, 0],  rot: [-Math.PI/2, 0, 0], pos: [0, 0.5, 0],  idx: 2 }, // +Y
                { dir: [0, -1, 0], rot: [Math.PI/2, 0, 0],  pos: [0, -0.5, 0], idx: 3 }, // -Y
                { dir: [0, 0, 1],  rot: [0, 0, 0],          pos: [0, 0, 0.5],  idx: 4 }, // +Z
                { dir: [0, 0, -1], rot: [0, Math.PI, 0],    pos: [0, 0, -0.5], idx: 5 }  // -Z
            ];

            faceConfigs.forEach(f => {
                if (!hasNeighbor(f.dir[0], f.dir[1], f.dir[2])) {
                    // 只有当该方向没有邻居时，才创建这个面
                    const plane = new THREE.PlaneGeometry(1, 1);
                    plane.rotateX(f.rot[0]);
                    plane.rotateY(f.rot[1]);
                    plane.rotateZ(f.rot[2]);
                    plane.translate(f.pos[0] + cell.x, f.pos[1] + cell.y, f.pos[2] + cell.z);
                    
                    // 将几何体存入对应方向的数组，方便合并后保留 MaterialIndex
                    dirGeometries[f.idx].push(plane);
                    outerFacesForEdges.push(plane.clone());
                }
            });
        }

        // 3. 合并几何体并创建实心 Mesh
        const mergedGroups: THREE.BufferGeometry[] = [];
        dirGeometries.forEach((geos, index) => {
            if (geos.length > 0) {
                const merged = BufferGeometryUtils.mergeGeometries(geos);
                mergedGroups.push(merged);
            } else {
                // 如果某个方向完全没面，放一个空的占位，保持索引对齐
                mergedGroups.push(new THREE.BufferGeometry());
            }
        });

        // 最终合体并分配 MaterialIndex（极其关键，确保 Hover 高亮依然有效）
        const finalBlockGeo = BufferGeometryUtils.mergeGeometries(mergedGroups, true);
        const blockMesh = new THREE.Mesh(finalBlockGeo, blockMaterials);
        blockMesh.userData = { id: block.id };
        group.add(blockMesh);

        // 4. 生成【智能边缘线】 (复用已剔除内部面的数据)
        const weldedOuterGeom = BufferGeometryUtils.mergeVertices(BufferGeometryUtils.mergeGeometries(outerFacesForEdges));
        const edgeGeo = new THREE.EdgesGeometry(weldedOuterGeom, 1);
        const outlineMesh = new THREE.LineSegments(
            edgeGeo, 
            new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.9 })
        );
        outlineMesh.renderOrder = 10;
        (outlineMesh.material as THREE.LineBasicMaterial).polygonOffset = true;
        (outlineMesh.material as THREE.LineBasicMaterial).polygonOffsetFactor = -1;
        (outlineMesh.material as THREE.LineBasicMaterial).polygonOffsetUnits = -1;
        group.add(outlineMesh);

        group.position.set(block.position.x, block.position.y, block.position.z);
        scene.add(group);

        // 5. 生成目标虚影
        let ghostGroup: THREE.Group | undefined;
        if (block.isTarget && block.targetPosition) {
            ghostGroup = new THREE.Group();
            const ghostMat = new THREE.LineDashedMaterial({ 
                color: 0x00FF00, dashSize: 0.2, gapSize: 0.1,
                depthTest: false, transparent: true, opacity: 0.8
            });
            const ghostOutline = new THREE.LineSegments(edgeGeo, ghostMat);
            ghostOutline.computeLineDistances();
            ghostOutline.renderOrder = 999;
            ghostGroup.add(ghostOutline);
            ghostGroup.position.set(block.targetPosition.x, block.targetPosition.y, block.targetPosition.z);
            ghostGroup.visible = false;
            scene.add(ghostGroup);
        }

        blockMeshes.set(block.id, { 
            group, materials: blockMaterials, edges: outlineMesh, ghost: ghostGroup 
        });
    }
}
createBlocks();

// ==========================================
// 3. 交互逻辑 (法线高亮与移动)
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let selectedBlockId: string | null = null;
let isAnimating = false;

// 统一材质状态还原
function resetHover() {
    blockMeshes.forEach(data => {
        data.materials.forEach(mat => mat.emissive.setHex(0x000000));
    });
}

function updateSelectionVisuals() {
    blockMeshes.forEach((data, id) => {
        const isSelected = id === selectedBlockId;
        const edgeMat = data.edges.material as THREE.LineBasicMaterial;
        
        if (isSelected) {
            // 选中：青色/电光蓝。在 4K 屏上 0x00FFFF 具有非常强的视觉侵略性
            edgeMat.color.setHex(0x3333FF); 
            // 提高渲染层级到最高，确保它不仅覆盖面，还能覆盖其他未选中块的白线
            data.edges.renderOrder = 1000; 
            // 如果你觉得还是不够亮，可以尝试修改 opacity
            edgeMat.opacity = 1.0;
        } else {
            // 未选中：干净的柔和白
            edgeMat.color.setHex(0xFFFFFF); 
            data.edges.renderOrder = 10;
        }
        
        if (data.ghost) {
            data.ghost.visible = isSelected;
            // 目标虚线框也要置顶
            data.ghost.renderOrder = 999; 
        }
    });
}

// Hover 改变对应面的材质发光 (区分可移动和不可移动状态)
window.addEventListener('pointermove', (event) => {
    resetHover();
    if (!selectedBlockId || isAnimating) return;
    
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);

    const activeData = blockMeshes.get(selectedBlockId)!;
    const interactables = activeData.group.children.filter(c => c instanceof THREE.Mesh);
    const intersects = raycaster.intersectObjects(interactables);

    // 修复：添加 hit.face 的非空判断
    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.face && typeof hit.face.materialIndex !== 'undefined') {
            const block = logic.blocks.find(b => b.id === selectedBlockId)!;
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
            const canMoveHere = logic.canMove(block, normal.x, normal.y, normal.z);

            if (canMoveHere) {
                activeData.materials[hit.face.materialIndex].emissive.setHex(0x888888);
            } else {
                activeData.materials[hit.face.materialIndex].emissive.setHex(0x880000);
            }
        }
    }
});

// --- 交互辅助变量 ---
let pointerDownPos = { x: 0, y: 0 };
const CLICK_THRESHOLD = 5; // 如果按下和松开之间的距离超过 5 像素，判定为“旋转视角”而非“点击”

// 记录按下时的位置
window.addEventListener('pointerdown', (event) => {
    pointerDownPos = { x: event.clientX, y: event.clientY };
});

// 点击选择与移动逻辑：改为松开（pointerup）触发
// 点击选择与移动逻辑：改为松开（pointerup）触发，并增加“撞墙”反馈
window.addEventListener('pointerup', (event) => {
    // 如果正在动画中，或者不是左键，直接忽略所有交互
    if (isAnimating || event.button !== 0) return;

    // 1. 计算位移，防止旋转视角时误触发
    const moveDist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
    if (moveDist > CLICK_THRESHOLD) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);

    const allMeshes = Array.from(blockMeshes.values()).flatMap(b => b.group.children.filter(c => c instanceof THREE.Mesh));
    const intersects = raycaster.intersectObjects(allMeshes);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const clickedId = hit.object.userData.id;

        // 【分支A】：如果点击的是新物体 -> 切换选中
        if (selectedBlockId !== clickedId) {
            selectedBlockId = clickedId;
            updateSelectionVisuals();
            resetHover();
        } 
        // 【分支B】：如果点击的是已选中的物体 -> 尝试移动
        else if (hit.face) {
            const block = logic.blocks.find(b => b.id === clickedId)!;
            // 计算点击面的世界空间法线方向
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
            const dx = normal.x, dy = normal.y, dz = normal.z;

            const { group } = blockMeshes.get(block.id)!;

            if (logic.canMove(block, dx, dy, dz)) {
                // --- 情况1：可以移动 (成功动画) ---
                block.position.x += dx; block.position.y += dy; block.position.z += dz;
                
                isAnimating = true;
                resetHover();

                new TWEEN.Tween(group.position)
                    .to({ x: block.position.x, y: block.position.y, z: block.position.z }, 200)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .onComplete(() => {
                        isAnimating = false;
                        const targets = logic.blocks.filter(b => b.isTarget);
                        const allDone = targets.every(t => t.position.x === t.targetPosition!.x && t.position.y === t.targetPosition!.y && t.position.z === t.targetPosition!.z);
                        if (allDone) setTimeout(() => alert('全目标达成！'), 100);
                    })
                    .start();
            } else {
                // --- 情况2：不可移动 (撞墙震颤动画) ---
                isAnimating = true; // 锁定交互
                resetHover();

                const originalPos = { x: group.position.x, y: group.position.y, z: group.position.z };
                const bumpDist = 0.2; // 撞击探出的距离
                const bumpPos = { 
                    x: originalPos.x + dx * bumpDist, 
                    y: originalPos.y + dy * bumpDist, 
                    z: originalPos.z + dz * bumpDist 
                };

                // 链式动画：先快速探出，再快速弹回
                new TWEEN.Tween(group.position)
                    .to(bumpPos, 70) // 极速探出
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .chain(
                        new TWEEN.Tween(group.position)
                            .to(originalPos, 70) // 极速弹回
                            .easing(TWEEN.Easing.Quadratic.In)
                            .onComplete(() => {
                                isAnimating = false; // 动画结束，解锁交互// 点击选择与移动逻辑：改为松开（pointerup）触发，并增加“撞墙”反馈
window.addEventListener('pointerup', (event) => {
    // 如果正在动画中，或者不是左键，直接忽略所有交互
    if (isAnimating || event.button !== 0) return;

    // 1. 计算位移，防止旋转视角时误触发
    const moveDist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
    if (moveDist > CLICK_THRESHOLD) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);

    const allMeshes = Array.from(blockMeshes.values()).flatMap(b => b.group.children.filter(c => c instanceof THREE.Mesh));
    const intersects = raycaster.intersectObjects(allMeshes);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const clickedId = hit.object.userData.id;

        // 【分支A】：如果点击的是新物体 -> 切换选中
        if (selectedBlockId !== clickedId) {
            selectedBlockId = clickedId;
            updateSelectionVisuals();
            resetHover();
        } 
        // 【分支B】：如果点击的是已选中的物体 -> 尝试移动
        else if (hit.face) {
            const block = logic.blocks.find(b => b.id === clickedId)!;
            // 计算点击面的世界空间法线方向
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
            const dx = normal.x, dy = normal.y, dz = normal.z;

            const { group } = blockMeshes.get(block.id)!;

            if (logic.canMove(block, dx, dy, dz)) {
                // --- 情况1：可以移动 (成功动画) ---
                block.position.x += dx; block.position.y += dy; block.position.z += dz;
                
                isAnimating = true;
                resetHover();

                new TWEEN.Tween(group.position)
                    .to({ x: block.position.x, y: block.position.y, z: block.position.z }, 200)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .onComplete(() => {
                        isAnimating = false;
                        const targets = logic.blocks.filter(b => b.isTarget);
                        const allDone = targets.every(t => t.position.x === t.targetPosition!.x && t.position.y === t.targetPosition!.y && t.position.z === t.targetPosition!.z);
                        if (allDone) setTimeout(() => alert('全目标达成！'), 100);
                    })
                    .start();
            } else {
                // --- 情况2：不可移动 (撞墙震颤动画) ---
                isAnimating = true; // 锁定交互
                resetHover();

                const originalPos = { x: group.position.x, y: group.position.y, z: group.position.z };
                const bumpDist = 0.2; // 撞击探出的距离
                const bumpPos = { 
                    x: originalPos.x + dx * bumpDist, 
                    y: originalPos.y + dy * bumpDist, 
                    z: originalPos.z + dz * bumpDist 
                };

                // 链式动画：先快速探出，再快速弹回
                new TWEEN.Tween(group.position)
                    .to(bumpPos, 70) // 极速探出
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .chain(
                        new TWEEN.Tween(group.position)
                            .to(originalPos, 70) // 极速弹回
                            .easing(TWEEN.Easing.Quadratic.In)
                            .onComplete(() => {
                                isAnimating = false; // 动画结束，解锁交互
                            })
                    )
                    .start();
            }
        }
    }
});
                            })
                    )
                    .start();
            }
        }
    }
});
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio); 
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ==========================================
// 4. 渲染循环
// ==========================================
function animate(time: number) {
    requestAnimationFrame(animate);
    TWEEN.update(time);
    controls.update();
    renderer.render(scene, camera);
}
animate(performance.now());