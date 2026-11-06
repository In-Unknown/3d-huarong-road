import type { Vec3, BlockDef, ExitDef } from './types';

export const LEVEL_BOUNDS: Vec3 = { x: 10, y: 5, z: 5 };

export const LEVEL_BLOCKS: BlockDef[] = [
    // 红色目标块：必须抵达 targetPosition
    { 
        id: 'target1', 
        type: 'target', 
        position: { x: 0, y: 1, z: 1 }, 
        targetPosition: { x: 3, y: 1, z: 1 }, 
        allowedDirs: ['+x', '-x'], 
        cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] 
    },
    { 
        id: 'target2', 
        type: 'target', 
        position: { x: 0, y: 0, z: 0 }, 
        targetPosition: { x: 4, y: 0, z: 4 }, 
        allowedDirs: ['+x', '-x', '+y', '-y', '+z', '-z'], 
        cells: [{ x: 0, y: 0, z: 0 }] 
    },
    // 蓝色出口块：目标是离开世界
    { 
        id: 'exit1', 
        type: 'exit', 
        position: { x: 4, y: 2, z: 3 }, 
        allowedDirs: ['+x', '-x', '+y', '-y'], 
        cells: [{ x: 0, y: 0, z: 0 }] 
    },
    { 
        id: 'exit2', 
        type: 'exit', 
        position: { x: 4, y: 4, z: 0 }, 
        allowedDirs: ['+x', '+y', '-y', '+z', '-z'], 
        cells: [{ x: 0, y: 0, z: 0 }] 
    },
    // 灰色障碍块：有方向限制，可移动
    { 
        id: 'obs1', 
        type: 'obstacle', 
        position: { x: 3, y: 0, z: 1 }, 
        allowedDirs: ['+y', '-y'], 
        cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 }] 
    },
    { 
        id: 'obs2', 
        type: 'obstacle', 
        position: { x: 2, y: 1, z: 2 }, 
        allowedDirs: ['+z', '-z'], 
        cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }] 
    },
    { 
        id: 'obs3', 
        type: 'obstacle', 
        position: { x: 1, y: 2, z: 0 }, 
        allowedDirs: ['+y', '-y'], 
        cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] 
    },
    { 
        id: 'obs4', 
        type: 'obstacle', 
        position: { x: 0, y: 3, z: 3 }, 
        allowedDirs: ['+x', '-x', '+y', '-y', '+z', '-z'], 
        cells: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }] 
    },
    // 深灰色墙体块：完全不可移动
    { 
        id: 'wall1', 
        type: 'wall', 
        position: { x: 4, y: 4, z: 4 }, 
        allowedDirs: [], 
        cells: [{ x: 0, y: 0, z: 0 }] 
    },
    { 
        id: 'wall2', 
        type: 'wall', 
        position: { x: 2, y: 0, z: 3 }, 
        allowedDirs: [], 
        cells: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }] 
    }
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
