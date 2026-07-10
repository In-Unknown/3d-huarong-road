import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3, BlockDef, CanvasDirection, BlockMeshData } from './types';

// 生成网格贴图（房间背景）
export function createGridTexture(renderer: THREE.WebGLRenderer) {
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

// 生成矢量箭头贴图（方块表面）
export function createCanvasTexture(baseColor: number, dirs: CanvasDirection[], renderer: THREE.WebGLRenderer) {
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
    ctx.lineWidth = size * 0.1;
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
        } else if (d === 'UP') {
            ctx.moveTo(mid, mid); ctx.lineTo(mid, padding);
            ctx.moveTo(mid - head, padding + head); ctx.lineTo(mid, padding); ctx.lineTo(mid + head, padding + head);
        } else if (d === 'DOWN') {
            ctx.moveTo(mid, mid); ctx.lineTo(mid, size - padding);
            ctx.moveTo(mid - head, size - padding - head); ctx.lineTo(mid, size - padding); ctx.lineTo(mid + head, size - padding - head);
        }
        ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
}

// 创建房间网格
export function createRoom(scene: THREE.Scene, bounds: Vec3, renderer: THREE.WebGLRenderer) {
    const ROOM_EXPANSION = 0.2;
    const gridTex = createGridTexture(renderer);
    const repeats = [
        [bounds.z + ROOM_EXPANSION, bounds.y + ROOM_EXPANSION], [bounds.z + ROOM_EXPANSION, bounds.y + ROOM_EXPANSION],
        [bounds.x + ROOM_EXPANSION, bounds.z + ROOM_EXPANSION], [bounds.x + ROOM_EXPANSION, bounds.z + ROOM_EXPANSION],
        [bounds.x + ROOM_EXPANSION, bounds.y + ROOM_EXPANSION], [bounds.x + ROOM_EXPANSION, bounds.y + ROOM_EXPANSION]
    ];
    const materials = repeats.map(r => {
        const t = gridTex.clone(); t.repeat.set(r[0], r[1]);
        t.offset.set(-ROOM_EXPANSION / 2 / r[0], -ROOM_EXPANSION / 2 / r[1]);
        t.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ map: t, side: THREE.BackSide, roughness: 1, transparent: true, opacity: 0.9 });
    });
    const roomGeo = new THREE.BoxGeometry(bounds.x + ROOM_EXPANSION, bounds.y + ROOM_EXPANSION, bounds.z + ROOM_EXPANSION);
    const roomMesh = new THREE.Mesh(roomGeo, materials);
    roomMesh.position.set(bounds.x / 2 - 0.5, bounds.y / 2 - 0.5, bounds.z / 2 - 0.5);
    roomMesh.raycast = () => { };
    scene.add(roomMesh);
}

// 创建所有方块的 mesh，返回映射表
export function createBlocks(blocks: BlockDef[], scene: THREE.Scene, renderer: THREE.WebGLRenderer): Map<string, BlockMeshData> {
    const blockMeshes: Map<string, BlockMeshData> = new Map();

    for (const block of blocks) {
        const group = new THREE.Group();
        const baseColor = block.isTarget ? 0xcc3333 : 0xcccccc;
        const isFree = block.allowedDirs.length === 6;
        const blockMaterials: THREE.MeshStandardMaterial[] = [];

        // 索引顺序: 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
        for (let j = 0; j < 6; j++) {
            const canvasDirs: CanvasDirection[] = [];

            if (!isFree) {
                block.allowedDirs.forEach(worldDir => {
                    if (j === 0 || j === 1) if (worldDir.includes('x')) return;
                    if (j === 2 || j === 3) if (worldDir.includes('y')) return;
                    if (j === 4 || j === 5) if (worldDir.includes('z')) return;

                    if (j === 0) {
                        if (worldDir === '+y') canvasDirs.push('UP');
                        if (worldDir === '-y') canvasDirs.push('DOWN');
                        if (worldDir === '+z') canvasDirs.push('LEFT');
                        if (worldDir === '-z') canvasDirs.push('RIGHT');
                    }
                    else if (j === 1) {
                        if (worldDir === '+y') canvasDirs.push('UP');
                        if (worldDir === '-y') canvasDirs.push('DOWN');
                        if (worldDir === '+z') canvasDirs.push('RIGHT');
                        if (worldDir === '-z') canvasDirs.push('LEFT');
                    }
                    else if (j === 2) {
                        if (worldDir === '+x') canvasDirs.push('RIGHT');
                        if (worldDir === '-x') canvasDirs.push('LEFT');
                        if (worldDir === '+z') canvasDirs.push('DOWN');
                        if (worldDir === '-z') canvasDirs.push('UP');
                    }
                    else if (j === 3) {
                        if (worldDir === '+x') canvasDirs.push('RIGHT');
                        if (worldDir === '-x') canvasDirs.push('LEFT');
                        if (worldDir === '+z') canvasDirs.push('UP');
                        if (worldDir === '-z') canvasDirs.push('DOWN');
                    }
                    else if (j === 4) {
                        if (worldDir === '+x') canvasDirs.push('RIGHT');
                        if (worldDir === '-x') canvasDirs.push('LEFT');
                        if (worldDir === '+y') canvasDirs.push('UP');
                        if (worldDir === '-y') canvasDirs.push('DOWN');
                    }
                    else if (j === 5) {
                        if (worldDir === '+x') canvasDirs.push('LEFT');
                        if (worldDir === '-x') canvasDirs.push('RIGHT');
                        if (worldDir === '+y') canvasDirs.push('UP');
                        if (worldDir === '-y') canvasDirs.push('DOWN');
                    }
                });
            }

            blockMaterials.push(new THREE.MeshStandardMaterial({
                map: createCanvasTexture(baseColor, canvasDirs, renderer),
                roughness: 0.6,
                polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
            }));
        }

        // Voxel 剔除逻辑
        const dirGeos: THREE.BufferGeometry[][] = [[], [], [], [], [], []];
        const outerFacesForEdges: THREE.BufferGeometry[] = [];
        for (const cell of block.cells) {
            const hasNeighbor = (dx: number, dy: number, dz: number) => block.cells.some(c => c.x === cell.x + dx && c.y === cell.y + dy && c.z === cell.z + dz);
            const faceConfigs = [
                { dir: [1, 0, 0], rot: [0, Math.PI / 2, 0], pos: [0.5, 0, 0], idx: 0 }, { dir: [-1, 0, 0], rot: [0, -Math.PI / 2, 0], pos: [-0.5, 0, 0], idx: 1 },
                { dir: [0, 1, 0], rot: [-Math.PI / 2, 0, 0], pos: [0, 0.5, 0], idx: 2 }, { dir: [0, -1, 0], rot: [Math.PI / 2, 0, 0], pos: [0, -0.5, 0], idx: 3 },
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

    return blockMeshes;
}

// 重置所有方块的 hover 高亮
export function resetHover(blockMeshes: Map<string, BlockMeshData>) {
    blockMeshes.forEach(d => d.materials.forEach(m => m.emissive.setHex(0x000000)));
}

// 更新选中方块的视觉表现
export function updateSelectionVisuals(blockMeshes: Map<string, BlockMeshData>, selectedBlockId: string | null) {
    blockMeshes.forEach((data, id) => {
        const isSelected = id === selectedBlockId;
        const edgeMat = data.edges.material as THREE.LineBasicMaterial;
        if (isSelected) { edgeMat.color.setHex(0x00FFFF); data.edges.renderOrder = 1000; edgeMat.opacity = 1.0; }
        else { edgeMat.color.setHex(0xFFFFFF); data.edges.renderOrder = 10; edgeMat.opacity = 0.9; }
        if (data.ghost) data.ghost.visible = isSelected;
    });
}
