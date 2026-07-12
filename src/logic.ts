import type { Vec3, BlockDef, ExitDef } from './types';

export class GameLogic {
    bounds: Vec3;
    blocks: BlockDef[];
    exits: ExitDef[];

    constructor(bounds: Vec3, blocks: BlockDef[], exits: ExitDef[] = []) {
        this.bounds = bounds;
        this.blocks = blocks;
        this.exits = exits;
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

    // 判断位置是否在某个洞的柱状范围内（包括边界位置和边界外的位置）
    private isExit(pos: Vec3): boolean {
        const { x, y, z } = pos;

        // 确定所在的墙面（根据位置相对于世界边界的方向）
        let exitWall: number;
        let wallU: number, wallV: number;

        // +X 方向：x >= bounds.x 都属于 +X 面（wall: 0）的柱状范围
        if (x >= this.bounds.x) {
            exitWall = 0;
            // 渲染端 rotateY(PI/2) 使 z 轴翻转，u = (bounds.z - 1) - z
            wallU = this.bounds.z - 1 - z;
            wallV = y;
        }
        // -X 方向：x < 0 都属于 -X 面（wall: 1）的柱状范围
        else if (x < 0) {
            exitWall = 1;
            wallU = z;
            wallV = y;
        }
        // +Y 方向：y >= bounds.y 都属于 +Y 面（wall: 2）的柱状范围
        else if (y >= this.bounds.y) {
            exitWall = 2;
            wallU = x;
            // 渲染端 rotateX(-PI/2) 使 z 轴翻转，v = (bounds.z - 1) - z
            wallV = this.bounds.z - 1 - z;
        }
        // -Y 方向：y < 0 都属于 -Y 面（wall: 3）的柱状范围
        else if (y < 0) {
            exitWall = 3;
            wallU = x;
            wallV = z;
        }
        // +Z 方向：z >= bounds.z 都属于 +Z 面（wall: 4）的柱状范围
        else if (z >= this.bounds.z) {
            exitWall = 4;
            wallU = x;
            wallV = y;
        }
        // -Z 方向：z < 0 都属于 -Z 面（wall: 5）的柱状范围
        else if (z < 0) {
            exitWall = 5;
            // 渲染端 rotateY(PI) 使 x 轴翻转，u = (bounds.x - 1) - x
            wallU = this.bounds.x - 1 - x;
            wallV = y;
        }
        // 在世界范围内，不是洞的位置
        else return false;

        // 检查该墙面是否有洞
        const exit = this.exits.find(e => e.wall === exitWall);
        if (!exit) return false;

        // 检查该位置是否在洞的范围内（使用墙面局部坐标）
        return exit.cells.some(c => c.u === wallU && c.v === wallV);
    }

    // 判断方块 block 是否可以沿 (dx, dy, dz) 方向至少移动一格
    canMove(block: BlockDef, dx: number, dy: number, dz: number): boolean {
        return this.getMaxMoveDistance(block, dx, dy, dz)[3] >= 1;
    }

    // 执行方块移动：直接按传入向量更新位置
    // 返回实际移动的格数
    moveBlock(block: BlockDef, dx: number, dy: number, dz: number): number {
        block.position.x += dx;
        block.position.y += dy;
        block.position.z += dz;
        return Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    }

    // 射线投射法：计算方块沿 (dx, dy, dz) 方向可以移动的最大格数
    // 返回元组 [移动向量x, 移动向量y, 移动向量z, 最大格数]
    getMaxMoveDistance(block: BlockDef, dx: number, dy: number, dz: number): [number, number, number, number] {
        // 1. 检查移动方向是否在该方块的允许移动方向列表中
        if (dx > 0 && !block.allowedDirs.includes('+x')) return [0, 0, 0, 0];
        if (dx < 0 && !block.allowedDirs.includes('-x')) return [0, 0, 0, 0];
        if (dy > 0 && !block.allowedDirs.includes('+y')) return [0, 0, 0, 0];
        if (dy < 0 && !block.allowedDirs.includes('-y')) return [0, 0, 0, 0];
        if (dz > 0 && !block.allowedDirs.includes('+z')) return [0, 0, 0, 0];
        if (dz < 0 && !block.allowedDirs.includes('-z')) return [0, 0, 0, 0];

        // 2. 已经完全移出的方块不能再移动
        if (this.checkBlockExited(block)) return [0, 0, 0, 0];

        // 3. 确定移动方向的主轴和符号
        const axis: 'x' | 'y' | 'z' = dx !== 0 ? 'x' : dy !== 0 ? 'y' : 'z';
        const sign = dx !== 0 ? Math.sign(dx) : dy !== 0 ? Math.sign(dy) : Math.sign(dz);
        const otherAxis1 = axis === 'x' ? 'y' : 'x';
        const otherAxis2 = axis === 'z' ? 'y' : 'z';

        // 4. 找到方块在移动方向上的前表面单元格（最前沿的格子集合）
        const cellCoords = block.cells.map(c => c[axis]);
        const frontCells = block.cells.filter(cell => {
            const hasNeighborInFront = block.cells.some(other => 
                    other[axis] === cell[axis] + sign && 
                    other[otherAxis1] === cell[otherAxis1] &&
                    other[otherAxis2] === cell[otherAxis2]
                );
                return !hasNeighborInFront;
        });

        // 方块在移动方向上的宽度（格数）
        const blockDepth = Math.max(...cellCoords) - Math.min(...cellCoords) + 1;

        // 5. 射线最大投射距离 = 输入的移动距离（dx, dy, dz 的绝对值之和）
        let maxRayDist : number;
        if (axis === 'x') {
            maxRayDist = Math.abs(dx);
        } else if (axis === 'y') {
            maxRayDist = Math.abs(dy);
        } else {
            maxRayDist = Math.abs(dz);
        }


        // 6. 对每个前表面单元格投射射线，记录命中信息
        const hits: { distance: number; isExit: boolean }[] = [];

        for (const cell of frontCells) {
            let hit: { distance: number; isExit: boolean } | null = null;

            for (let step = 1; step <= maxRayDist; step++) {
                const nx = block.position.x + cell.x + step * sign * (axis === 'x' ? 1 : 0);
                const ny = block.position.y + cell.y + step * sign * (axis === 'y' ? 1 : 0);
                const nz = block.position.z + cell.z + step * sign * (axis === 'z' ? 1 : 0);

                const isOutOfBounds = nx < 0 || nx >= this.bounds.x ||
                                      ny < 0 || ny >= this.bounds.y ||
                                      nz < 0 || nz >= this.bounds.z;

                if (isOutOfBounds) {
                    // 超出边界：命中墙面或洞口
                    hit = { distance: step - 1, isExit: this.isExit({ x: nx, y: ny, z: nz }) };
                    break;
                } else {
                    // 边界内：检查是否被其他方块占据
                    const occupant = this.getBlockAt(nx, ny, nz);
                    if (occupant && occupant !== block) {
                        hit = { distance: step - 1, isExit: false };
                        break;
                    }
                }
            }

            if (hit) hits.push(hit);
        }

        // 构造方向单位向量
        const dir: [number, number, number] = [0, 0, 0];
        dir[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] = sign;

        // 7. 没有任何命中 → 射线畅通无阻，可移动最大距离
        if (hits.length === 0) return [dir[0] * maxRayDist, dir[1] * maxRayDist, dir[2] * maxRayDist, maxRayDist];

        // 8. 所有命中面都是洞口面 → 移动距离 = 最短命中距离 + 方块宽度（完全穿过洞口）
        const minDistance = Math.min(...hits.map(h => h.distance));
        if (hits.every(h => h.isExit)) {
            const d = minDistance + blockDepth;
            return [dir[0] * d, dir[1] * d, dir[2] * d, d];
        }

        // 9. 否则（部分或全部命中墙面/积木）→ 移动距离 = 最短命中距离
        return [dir[0] * minDistance, dir[1] * minDistance, dir[2] * minDistance, minDistance];
    }

    checkBlockExited(block: BlockDef): boolean {
        return block.cells.every(cell => {
            const x = block.position.x + cell.x;
            const y = block.position.y + cell.y;
            const z = block.position.z + cell.z;
            return x < 0 || x >= this.bounds.x || y < 0 || y >= this.bounds.y || z < 0 || z >= this.bounds.z;
        });
    }

    removeBlock(blockId: string): void {
        const index = this.blocks.findIndex(b => b.id === blockId);
        if (index !== -1) {
            this.blocks.splice(index, 1);
        }
    }

    checkVictory(): boolean {
        const targets = this.blocks.filter(b => b.isTarget);
        return targets.every(t =>
            t.targetPosition &&
            t.position.x === t.targetPosition.x &&
            t.position.y === t.targetPosition.y &&
            t.position.z === t.targetPosition.z
        );
    }
}
