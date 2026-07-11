import type { Vec3, BlockDef, ExitDef } from './types';

export const LEVEL_BOUNDS: Vec3 = { x: 5, y: 5, z: 5 };

export const LEVEL_BLOCKS: BlockDef[] = [
    { id: 'target1', isTarget: true, position: { x: 0, y: 1, z: 1 }, targetPosition: { x: 3, y: 1, z: 1 }, allowedDirs: ['+x', '-x'], cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] },
    { id: 'target2', isTarget: true, position: { x: 0, y: 0, z: 0 }, targetPosition: { x: 4, y: 0, z: 4 }, allowedDirs: ['+x', '-x', '+y', '-y', '+z', '-z'], cells: [{ x: 0, y: 0, z: 0 }] },
    { id: 'obs1', position: { x: 3, y: 0, z: 1 }, allowedDirs: ['+y', '-y'], cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 }] },
    { id: 'obs2', position: { x: 2, y: 1, z: 2 }, allowedDirs: ['+z', '-z'], cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }] },
    { id: 'obs3', position: { x: 1, y: 2, z: 0 }, allowedDirs: ['+z'], cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] },
    { id: 'obs4', position: { x: 0, y: 3, z: 3 }, allowedDirs: ['+x', '-x', '+y', '-y', '+z', '-z'], cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }] }
];

export const LEVEL_EXITS: ExitDef[] = [
    // +X 面（右侧墙）
    { wall: 0, cells: [{ u: 1, v: 1 }, { u: 2, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 2 }] },
    // -X 面（左侧墙）
    { wall: 1, cells: [{ u: 1, v: 1 }, { u: 2, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 2 }] },
    // +Y 面（顶部墙）
    { wall: 2, cells: [{ u: 1, v: 1 }, { u: 2, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 2 }] },
    // -Y 面（底部墙）
    { wall: 3, cells: [{ u: 1, v: 1 }, { u: 2, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 2 }] },
    // +Z 面（前墙）
    { wall: 4, cells: [{ u: 1, v: 1 }, { u: 2, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 2 }] },
    // -Z 面（后墙）
    { wall: 5, cells: [{ u: 1, v: 1 }, { u: 2, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 2 }] }
];
