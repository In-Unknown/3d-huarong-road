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
