import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3, BlockDef, CanvasDirection, BlockMeshData, ExitDef } from './types';

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

// 创建房间网格（带出口孔洞）
export function createRoom(scene: THREE.Scene, bounds: Vec3, exits: ExitDef[], renderer: THREE.WebGLRenderer) {
    const ROOM_EXPANSION = 0.2;
    const gridTex = createGridTexture(renderer);

    const wallConfigs = [
        { normal: [1, 0, 0], axis1: 'z', axis2: 'y', size1: bounds.z, size2: bounds.y, pos: [bounds.x - 0.5, bounds.y / 2 - 0.5, bounds.z / 2 - 0.5], rot: [0, Math.PI / 2, 0] },
        { normal: [-1, 0, 0], axis1: 'z', axis2: 'y', size1: bounds.z, size2: bounds.y, pos: [-0.5, bounds.y / 2 - 0.5, bounds.z / 2 - 0.5], rot: [0, -Math.PI / 2, 0] },
        { normal: [0, 1, 0], axis1: 'x', axis2: 'z', size1: bounds.x, size2: bounds.z, pos: [bounds.x / 2 - 0.5, bounds.y - 0.5, bounds.z / 2 - 0.5], rot: [-Math.PI / 2, 0, 0] },
        { normal: [0, -1, 0], axis1: 'x', axis2: 'z', size1: bounds.x, size2: bounds.z, pos: [bounds.x / 2 - 0.5, -0.5, bounds.z / 2 - 0.5], rot: [Math.PI / 2, 0, 0] },
        { normal: [0, 0, 1], axis1: 'x', axis2: 'y', size1: bounds.x, size2: bounds.y, pos: [bounds.x / 2 - 0.5, bounds.y / 2 - 0.5, bounds.z - 0.5], rot: [0, 0, 0] },
        { normal: [0, 0, -1], axis1: 'x', axis2: 'y', size1: bounds.x, size2: bounds.y, pos: [bounds.x / 2 - 0.5, bounds.y / 2 - 0.5, -0.5], rot: [0, Math.PI, 0] }
    ];

    const roomGroup = new THREE.Group();

    wallConfigs.forEach((cfg, wallIndex) => {
        const wallExits = exits.filter(e => e.wall === wallIndex);
        const exitCells = new Set<string>();
        wallExits.forEach(e => {
            e.cells.forEach(c => exitCells.add(`${c.x},${c.y},${c.z}`));
        });

        const faceGeos: THREE.BufferGeometry[] = [];

        for (let i = 0; i < cfg.size1; i++) {
            for (let j = 0; j < cfg.size2; j++) {
                let cellKey: string;
                if (wallIndex === 0) cellKey = `${bounds.x - 1 - i},${j},${0}`;
                else if (wallIndex === 1) cellKey = `${i},${j},${0}`;
                else if (wallIndex === 2) cellKey = `${i},${bounds.y - 1 - j},${0}`;
                else if (wallIndex === 3) cellKey = `${i},${j},${0}`;
                else if (wallIndex === 4) cellKey = `${i},${j},${0}`;
                else cellKey = `${bounds.x - 1 - i},${j},${0}`;

                if (exitCells.has(cellKey)) continue;

                const plane = new THREE.PlaneGeometry(1, 1);

                // 手动偏移 UV 坐标，确保网格线在整面墙上铺开而不是每个格子重复
                const uvAttribute = plane.attributes.uv;
                const uvOffsetX = i / cfg.size1;
                const uvOffsetY = j / cfg.size2;
                const uvScaleX = 1 / cfg.size1;
                const uvScaleY = 1 / cfg.size2;

                for (let k = 0; k < uvAttribute.count; k++) {
                    uvAttribute.setXY(k,
                        uvOffsetX + uvAttribute.getX(k) * uvScaleX,
                        uvOffsetY + uvAttribute.getY(k) * uvScaleY
                    );
                }

                const offset1 = i - cfg.size1 / 2 + 0.5;
                const offset2 = j - cfg.size2 / 2 + 0.5;

                plane.translate(offset1, offset2, 0);
                plane.rotateX(cfg.rot[0]);
                plane.rotateY(cfg.rot[1]);
                plane.rotateZ(cfg.rot[2]);
                plane.translate(cfg.pos[0], cfg.pos[1], cfg.pos[2]);

                faceGeos.push(plane);
            }
        }

        const t = gridTex.clone();
        t.repeat.set(cfg.size1 + ROOM_EXPANSION, cfg.size2 + ROOM_EXPANSION);
        t.offset.set(-ROOM_EXPANSION / 2 / (cfg.size1 + ROOM_EXPANSION), -ROOM_EXPANSION / 2 / (cfg.size2 + ROOM_EXPANSION));
        t.needsUpdate = true;

        const mat = new THREE.MeshStandardMaterial({ map: t, side: THREE.BackSide, roughness: 1, transparent: true, opacity: 0.9 });

        if (faceGeos.length > 0) {
            const wallGeo = BufferGeometryUtils.mergeGeometries(faceGeos);
            const wallMesh = new THREE.Mesh(wallGeo, mat);
            wallMesh.raycast = () => { };
            roomGroup.add(wallMesh);
        }

        // 创建孔洞处的半透明蓝色面板
        if (exitCells.size > 0) {
            const panelMaterial = new THREE.MeshBasicMaterial({
                color: 0x0066ff,
                transparent: true,
                opacity: 0.15,
                side: THREE.DoubleSide
            });

            exitCells.forEach(key => {
                const parts = key.split(',');
                const exitI = parseInt(parts[0]);
                const exitJ = parseInt(parts[1]);

                // 创建孔洞面板
                const panel = new THREE.PlaneGeometry(1, 1);
                const offset1 = exitI - cfg.size1 / 2 + 0.5;
                const offset2 = exitJ - cfg.size2 / 2 + 0.5;

                panel.translate(offset1, offset2, 0);
                panel.rotateX(cfg.rot[0]);
                panel.rotateY(cfg.rot[1]);
                panel.rotateZ(cfg.rot[2]);
                panel.translate(cfg.pos[0], cfg.pos[1], cfg.pos[2]);

                const panelMesh = new THREE.Mesh(panel, panelMaterial);
                roomGroup.add(panelMesh);
            });
        }

        // 创建孔洞边缘的蓝色描边（使用管道网格实现粗线条）
        if (exitCells.size > 0) {
            const edgeMaterial = new THREE.MeshBasicMaterial({
                color: 0x00aaff,
                transparent: true,
                opacity: 0.9
            });

            exitCells.forEach(key => {
                const parts = key.split(',');
                const exitI = parseInt(parts[0]);
                const exitJ = parseInt(parts[1]);

                // 检查四个方向的相邻格子是否不是孔洞
                const neighbors = [
                    { di: 1, dj: 0 },  // 右
                    { di: -1, dj: 0 }, // 左
                    { di: 0, dj: 1 },  // 上
                    { di: 0, dj: -1 }  // 下
                ];

                neighbors.forEach(n => {
                    const neighborKey = `${exitI + n.di},${exitJ + n.dj},0`;
                    if (!exitCells.has(neighborKey)) {
                        // 绘制这条边
                        const baseOffset1 = exitI - cfg.size1 / 2 + 0.5;
                        const baseOffset2 = exitJ - cfg.size2 / 2 + 0.5;

                        let p1: THREE.Vector3, p2: THREE.Vector3;

                        if (n.di === 1) { // 右边
                            p1 = new THREE.Vector3(baseOffset1 + 0.5, baseOffset2 - 0.5, 0);
                            p2 = new THREE.Vector3(baseOffset1 + 0.5, baseOffset2 + 0.5, 0);
                        } else if (n.di === -1) { // 左边
                            p1 = new THREE.Vector3(baseOffset1 - 0.5, baseOffset2 - 0.5, 0);
                            p2 = new THREE.Vector3(baseOffset1 - 0.5, baseOffset2 + 0.5, 0);
                        } else if (n.dj === 1) { // 上边
                            p1 = new THREE.Vector3(baseOffset1 - 0.5, baseOffset2 + 0.5, 0);
                            p2 = new THREE.Vector3(baseOffset1 + 0.5, baseOffset2 + 0.5, 0);
                        } else { // 下边
                            p1 = new THREE.Vector3(baseOffset1 - 0.5, baseOffset2 - 0.5, 0);
                            p2 = new THREE.Vector3(baseOffset1 + 0.5, baseOffset2 - 0.5, 0);
                        }

                        // 应用旋转和平移变换
                        [p1, p2].forEach(p => {
                            p.applyEuler(new THREE.Euler(cfg.rot[0], cfg.rot[1], cfg.rot[2]));
                            p.add(new THREE.Vector3(cfg.pos[0], cfg.pos[1], cfg.pos[2]));
                        });

                        // 使用圆柱体管道绘制粗线条
                        const direction = new THREE.Vector3().subVectors(p2, p1);
                        const length = direction.length();
                        const tubeRadius = 0.02; // 线条粗细

                        const tubeGeometry = new THREE.CylinderGeometry(tubeRadius, tubeRadius, length, 6);
                        const tubeMesh = new THREE.Mesh(tubeGeometry, edgeMaterial);

                        // 定位管道
                        const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
                        tubeMesh.position.copy(midpoint);

                        // 旋转管道使其对齐线段方向
                        const up = new THREE.Vector3(0, 1, 0);
                        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
                        tubeMesh.quaternion.copy(quaternion);

                        roomGroup.add(tubeMesh);
                    }
                });
            });
        }
    });

    scene.add(roomGroup);
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
