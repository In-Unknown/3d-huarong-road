import * as THREE from 'three';
import type { Vec3, ExitDef, WallMeshData } from './types';

// 创建格子纹理（带边缘线）
function createCellTexture(isExit: boolean): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 背景
    if (isExit) {
        ctx.fillStyle = '#0066ff';
        ctx.globalAlpha = 0.15;
        ctx.fillRect(0, 0, size, size);
    } else {
        // 墙面格子：绘制背景和边缘线
        ctx.fillStyle = '#222222';
        ctx.globalAlpha = 1.0;
        ctx.fillRect(0, 0, size, size);

        // 边缘线（只在墙面格子上绘制）
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = size * 0.02;
        ctx.strokeRect(size * 0.01, size * 0.01, size - size * 0.02, size - size * 0.02);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;  // 提高纹理清晰度
    return texture;
}

// 创建房间网格（格子化墙面渲染）
export function createRoom(scene: THREE.Scene, bounds: Vec3, exits: ExitDef[]): WallMeshData {
    // 墙面配置：定义每面墙的位置、旋转和尺寸
    const wallConfigs = [
        { wall: 0, normal: [1, 0, 0], size1: bounds.z, size2: bounds.y, pos: [bounds.x - 0.5, bounds.y / 2 - 0.5, bounds.z / 2 - 0.5], rot: [0, Math.PI / 2, 0] },
        { wall: 1, normal: [-1, 0, 0], size1: bounds.z, size2: bounds.y, pos: [-0.5, bounds.y / 2 - 0.5, bounds.z / 2 - 0.5], rot: [0, -Math.PI / 2, 0] },
        { wall: 2, normal: [0, 1, 0], size1: bounds.x, size2: bounds.z, pos: [bounds.x / 2 - 0.5, bounds.y - 0.5, bounds.z / 2 - 0.5], rot: [-Math.PI / 2, 0, 0] },
        { wall: 3, normal: [0, -1, 0], size1: bounds.x, size2: bounds.z, pos: [bounds.x / 2 - 0.5, -0.5, bounds.z / 2 - 0.5], rot: [Math.PI / 2, 0, 0] },
        { wall: 4, normal: [0, 0, 1], size1: bounds.x, size2: bounds.y, pos: [bounds.x / 2 - 0.5, bounds.y / 2 - 0.5, bounds.z - 0.5], rot: [0, 0, 0] },
        { wall: 5, normal: [0, 0, -1], size1: bounds.x, size2: bounds.y, pos: [bounds.x / 2 - 0.5, bounds.y / 2 - 0.5, -0.5], rot: [0, Math.PI, 0] }
    ];

    const roomGroup = new THREE.Group();
    const cellsMap = new Map<string, THREE.Mesh>();
    const edgesMap = new Map<string, THREE.Mesh>();

    // 为墙面格子和孔洞格子创建纹理材质
    // 墙面格子：纹理包含边缘线
    // 孔洞格子：纹理只有填充，边缘线用圆柱体单独绘制
    const wallTexture = createCellTexture(false);
    const exitTexture = createCellTexture(true);

    // 墙面格子材质：带边缘线纹理，BackSide 只渲染内面
    const wallMaterial = new THREE.MeshStandardMaterial({
        map: wallTexture,
        side: THREE.BackSide,  // 渲染法线反面（内面），外面透视进去
        roughness: 1,
        transparent: true,
        opacity: 0.9
    });

    // 孔洞填充材质：只有蓝色填充纹理，DoubleSide 双面可见
    const exitMaterial = new THREE.MeshBasicMaterial({
        map: exitTexture,
        transparent: true,
        opacity: 1.0,  // 透明度已在纹理中设置
        side: THREE.DoubleSide,
        depthWrite: false  // 半透明面不写入深度缓冲，避免遮挡后方物体
    });

    // 孔洞边缘线材质：蓝色圆柱体
    const exitEdgeMaterial = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.9
    });

    wallConfigs.forEach((cfg) => {
        const wallExits = exits.filter(e => e.wall === cfg.wall);
        const exitSet = new Set<string>();

        // 构建孔洞格子集合（使用墙面局部坐标）
        wallExits.forEach(exit => {
            exit.cells.forEach(cell => {
                // ExitDef 直接使用墙面局部坐标(u,v)，无需转换
                exitSet.add(`${cell.u},${cell.v}`);
            });
        });

        // 遍历每个格子位置
        for (let u = 0; u < cfg.size1; u++) {
            for (let v = 0; v < cfg.size2; v++) {
                const isExit = exitSet.has(`${u},${v}`);
                const offset1 = u - cfg.size1 / 2 + 0.5;
                const offset2 = v - cfg.size2 / 2 + 0.5;

                // 创建格子平面
                const plane = new THREE.PlaneGeometry(1, 1);
                plane.translate(offset1, offset2, 0);
                plane.rotateX(cfg.rot[0]);
                plane.rotateY(cfg.rot[1]);
                plane.rotateZ(cfg.rot[2]);
                plane.translate(cfg.pos[0], cfg.pos[1], cfg.pos[2]);

                // 根据是否是孔洞选择材质
                const material = isExit ? exitMaterial : wallMaterial;
                const cellMesh = new THREE.Mesh(plane, material);
                const cellKey = `${cfg.wall},${u},${v}`;

                roomGroup.add(cellMesh);
                cellsMap.set(cellKey, cellMesh);

                // 孔洞格子：绘制边缘线圆柱体（检查相邻孔洞，避免重复）
                if (isExit) {
                    const edges = createExitEdges(
                        u, v, offset1, offset2, cfg.rot, cfg.pos,
                        exitEdgeMaterial, exitSet, cfg.size1, cfg.size2
                    );
                    edges.forEach((edgeMesh, edgeKey) => {
                        roomGroup.add(edgeMesh);
                        edgesMap.set(`${cellKey}_${edgeKey}`, edgeMesh);
                    });
                }
            }
        }
    });

    scene.add(roomGroup);

    return {
        group: roomGroup,
        cells: cellsMap,
        edges: edgesMap
    };
}

// 创建孔洞边缘线（圆柱体，检查相邻孔洞避免重复）
function createExitEdges(
    u: number,
    v: number,
    offset1: number,
    offset2: number,
    rot: number[],
    pos: number[],
    material: THREE.Material,
    exitSet: Set<string>,
    size1: number,
    size2: number
): Map<string, THREE.Mesh> {
    const edgesMap = new Map<string, THREE.Mesh>();

    // 四条边的位置和对应的相邻格子偏移
    const edgePositions = [
        { key: 'left', p1: [-0.5, -0.5, 0], p2: [-0.5, 0.5, 0], neighborOffset: { du: -1, dv: 0 } },
        { key: 'right', p1: [0.5, -0.5, 0], p2: [0.5, 0.5, 0], neighborOffset: { du: 1, dv: 0 } },
        { key: 'bottom', p1: [-0.5, -0.5, 0], p2: [0.5, -0.5, 0], neighborOffset: { du: 0, dv: -1 } },
        { key: 'top', p1: [-0.5, 0.5, 0], p2: [0.5, 0.5, 0], neighborOffset: { du: 0, dv: 1 } }
    ];

    edgePositions.forEach(({ key, p1, p2, neighborOffset }) => {
        const neighborU = u + neighborOffset.du;
        const neighborV = v + neighborOffset.dv;

        // 如果相邻格子也在墙内且也是孔洞，则不渲染这条内边缘
        if (neighborU >= 0 && neighborU < size1 &&
            neighborV >= 0 && neighborV < size2 &&
            exitSet.has(`${neighborU},${neighborV}`)) {
            return; // 不渲染这条边缘
        }

        const start = new THREE.Vector3(p1[0] + offset1, p1[1] + offset2, p1[2]);
        const end = new THREE.Vector3(p2[0] + offset1, p2[1] + offset2, p2[2]);

        // 应用旋转和平移变换
        [start, end].forEach(p => {
            p.applyEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
            p.add(new THREE.Vector3(pos[0], pos[1], pos[2]));
        });

        // 使用圆柱体管道绘制粗线条
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        const tubeRadius = 0.02; // 线条粗细

        const tubeGeometry = new THREE.CylinderGeometry(tubeRadius, tubeRadius, length, 6);
        const tubeMesh = new THREE.Mesh(tubeGeometry, material);

        // 定位管道
        const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        tubeMesh.position.copy(midpoint);

        // 旋转管道使其对齐线段方向
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
        tubeMesh.quaternion.copy(quaternion);

        // 设置渲染优先级：孔洞蓝线高于墙面和墙边缘，低于方块
        tubeMesh.renderOrder = 5;

        edgesMap.set(key, tubeMesh);
    });

    return edgesMap;
}

// 检查指定位置是否有墙面格子（用于移动判断）
export function hasWallCell(wallMeshData: WallMeshData, wall: number, u: number, v: number): boolean {
    const key = `${wall},${u},${v}`;
    const cell = wallMeshData.cells.get(key);
    // 如果格子存在，则返回true（孔洞格子也有mesh，但视觉上透明）
    return cell !== undefined;
}