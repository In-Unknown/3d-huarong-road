import type * as THREE from 'three';

export type Vec3 = { x: number, y: number, z: number };
export type Direction = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface LevelViewConfig {
    allowInteriorView: boolean;
}

// 块类型：
// - target（红色）：必须抵达 targetPosition，若离开世界则游戏失败
// - exit（蓝色）：目标是离开世界，全部离开即完成该部分目标
// - obstacle（灰色）：障碍/通道块，有方向移动限制，可离开世界但不影响胜负
// - wall（深灰色）：完全不可移动，充当墙体
export type BlockType = 'target' | 'exit' | 'obstacle' | 'wall';

export interface BlockDef {
    id: string;
    type: BlockType;
    cells: Vec3[];
    position: Vec3;
    allowedDirs: Direction[];
    targetPosition?: Vec3;  // 仅 type='target' 时使用
}

export interface BlockMeshData {
    group: THREE.Group;
    body: THREE.Mesh;
    materials: THREE.MeshStandardMaterial[];
    baseColors: Float32Array;
    hoveredFace: number | null;
    edges: THREE.LineSegments;
    ghost?: THREE.Group;
}

export type WallFace = 0 | 1 | 2 | 3 | 4 | 5;

// 墙面局部坐标（用于出口定义）
export interface WallCellCoord {
    u: number;  // 墙面局部坐标 u
    v: number;  // 墙面局部坐标 v
}

export interface ExitDef {
    wall: WallFace;
    cells: WallCellCoord[];  // 使用墙面局部坐标
}

// 墙面格子定义（用于格子化墙面渲染）
export interface WallCellDef {
    wall: WallFace;        // 墙面索引 (0-5: +X, -X, +Y, -Y, +Z, -Z)
    u: number;             // 墙面局部坐标 u
    v: number;             // 墙面局部坐标 v
    isExit: boolean;       // 是否是出口孔洞
}

export interface WallMeshData {
    group: THREE.Group;
    solidCells: Set<string>;
    occluders: THREE.Mesh[];
    lights: THREE.SpotLight[];
}
