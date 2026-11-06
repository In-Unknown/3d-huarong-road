import type { BlockDef, Direction, ExitDef, Vec3 } from './types';

export const DIRECTIONS: Direction[] = ['+x', '-x', '+y', '-y', '+z', '-z'];
export const FACE_FRAMES: { normal: Vec3; u: Vec3; v: Vec3 }[] = [
    { normal: { x: 1, y: 0, z: 0 }, u: { x: 0, y: 0, z: -1 }, v: { x: 0, y: 1, z: 0 } },
    { normal: { x: -1, y: 0, z: 0 }, u: { x: 0, y: 0, z: 1 }, v: { x: 0, y: 1, z: 0 } },
    { normal: { x: 0, y: 1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 } },
    { normal: { x: 0, y: -1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 } },
    { normal: { x: 0, y: 0, z: 1 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 } },
    { normal: { x: 0, y: 0, z: -1 }, u: { x: -1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 } },
];
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cellKey = (p: Vec3) => `${p.x},${p.y},${p.z}`;
export const exitKey = (wall: number, u: number, v: number) => `${wall},${u},${v}`;
export const directionVector = (dir: Direction): Vec3 => ({ ...FACE_FRAMES[DIRECTIONS.indexOf(dir)].normal });
export const isInside = (p: Vec3, b: Vec3) => p.x >= 0 && p.x < b.x && p.y >= 0 && p.y < b.y && p.z >= 0 && p.z < b.z;
export const createExitSet = (exits: ExitDef[]) => new Set(exits.flatMap(e => e.cells.map(c => exitKey(e.wall, c.u, c.v))));

export function wallSize(b: Vec3, wall: number): [number, number] {
    return wall < 2 ? [b.z, b.y] : wall < 4 ? [b.x, b.z] : [b.x, b.y];
}

/** Interior cell adjacent to a wall. Rendering and collision share these coordinates. */
export function wallCellPosition(b: Vec3, wall: number, u: number, v: number): Vec3 {
    switch (wall) {
        case 0: return { x: b.x - 1, y: v, z: b.z - 1 - u };
        case 1: return { x: 0, y: v, z: u };
        case 2: return { x: u, y: b.y - 1, z: b.z - 1 - v };
        case 3: return { x: u, y: 0, z: v };
        case 4: return { x: u, y: v, z: b.z - 1 };
        case 5: return { x: b.x - 1 - u, y: v, z: 0 };
        default: throw new Error('未知墙面');
    }
}

export function isExitColumn(p: Vec3, b: Vec3, exits: ReadonlySet<string>): boolean {
    const outside = [p.x < 0 || p.x >= b.x, p.y < 0 || p.y >= b.y, p.z < 0 || p.z >= b.z];
    if (outside.filter(Boolean).length !== 1) return false;
    if (p.x >= b.x) return exits.has(exitKey(0, b.z - 1 - p.z, p.y));
    if (p.x < 0) return exits.has(exitKey(1, p.z, p.y));
    if (p.y >= b.y) return exits.has(exitKey(2, p.x, b.z - 1 - p.z));
    if (p.y < 0) return exits.has(exitKey(3, p.x, p.z));
    if (p.z >= b.z) return exits.has(exitKey(4, p.x, p.y));
    return exits.has(exitKey(5, b.x - 1 - p.x, p.y));
}

function integerVector(p: Vec3 | undefined): p is Vec3 {
    return !!p && ['x', 'y', 'z'].every(k => Number.isSafeInteger(p[k as keyof Vec3]));
}

export function validateLevel(bounds: Vec3, blocks: BlockDef[], exits: ExitDef[]): void {
    if (!integerVector(bounds) || Object.values(bounds).some(n => n <= 0)) throw new Error('房间尺寸必须是正整数');
    const ids = new Set<string>(), occupied = new Set<string>();
    for (const b of blocks) {
        const fail = (message: string): never => { throw new Error(`积木 ${b.id}: ${message}`); };
        if (typeof b.id !== 'string' || !b.id.trim() || ids.has(b.id)) fail('ID 为空或重复');
        ids.add(b.id);
        if (!['wall', 'target', 'exit', 'obstacle'].includes(b.type)) fail('未知类型');
        if (!integerVector(b.position) || !Array.isArray(b.cells) || b.cells.length === 0) fail('位置或形状无效');
        if (!Array.isArray(b.allowedDirs) || b.allowedDirs.some(d => !DIRECTIONS.includes(d)) || new Set(b.allowedDirs).size !== b.allowedDirs.length) fail('移动方向无效或重复');
        if (b.type === 'wall' && b.allowedDirs.length) fail('墙体不可移动');
        if (b.type === 'target' && !integerVector(b.targetPosition)) fail('缺少有效目标位置');
        const local = new Set<string>();
        for (const c of b.cells) {
            if (!integerVector(c) || local.has(cellKey(c))) fail('单元格无效或重复');
            local.add(cellKey(c));
            const p = { x: b.position.x + c.x, y: b.position.y + c.y, z: b.position.z + c.z };
            if (!isInside(p, bounds)) fail('初始位置超出房间');
            if (occupied.has(cellKey(p))) fail(`初始位置重叠 (${cellKey(p)})`);
            occupied.add(cellKey(p));
            if (b.type === 'target') {
                const t = b.targetPosition!;
                if (!isInside({ x: t.x + c.x, y: t.y + c.y, z: t.z + c.z }, bounds)) fail('目标形状超出房间');
            }
        }
    }
    for (const e of exits) {
        if (!Number.isInteger(e.wall) || e.wall < 0 || e.wall > 5 || !Array.isArray(e.cells)) throw new Error('出口墙面无效');
        const [width, height] = wallSize(bounds, e.wall);
        if (e.cells.some(c => !Number.isSafeInteger(c.u) || !Number.isSafeInteger(c.v) || c.u < 0 || c.v < 0 || c.u >= width || c.v >= height)) throw new Error(`墙面 ${e.wall} 的出口超出范围`);
    }
}
