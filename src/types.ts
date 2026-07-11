import * as THREE from 'three';

export type Vec3 = { x: number, y: number, z: number };

export interface BlockDef {
    id: string;
    cells: Vec3[];
    position: Vec3;
    allowedDirs: ('+x' | '-x' | '+y' | '-y' | '+z' | '-z')[];
    isTarget?: boolean;
    targetPosition?: Vec3;
}

export type CanvasDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface BlockMeshData {
    group: THREE.Group;
    materials: THREE.MeshStandardMaterial[];
    edges: THREE.LineSegments;
    ghost?: THREE.Group;
}

export type WallFace = 0 | 1 | 2 | 3 | 4 | 5;

export interface ExitDef {
    wall: WallFace;
    cells: Vec3[];
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
    cells: Map<string, THREE.Mesh>;  // 格子映射表 (key: "wall,u,v")
    edges: Map<string, THREE.Mesh>; // 格子边缘映射表（使用圆柱体管道）
}
