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
            // 边界位置的 y 和 z 决定了洞的位置
            wallU = this.bounds.z - z;  // z 坐标反向映射到 u
            wallV = y;                   // y 坐标映射到 v
        }
        // -X 方向：x < 0 都属于 -X 面（wall: 1）的柱状范围
        else if (x < 0) {
            exitWall = 1;
            wallU = z;                   // z 坐标映射到 u
            wallV = y;                   // y 坐标映射到 v
        }
        // +Y 方向：y >= bounds.y 都属于 +Y 面（wall: 2）的柱状范围
        else if (y >= this.bounds.y) {
            exitWall = 2;
            wallU = x;                   // x 坐标映射到 u
            wallV = this.bounds.z - z;   // z 坐标反向映射到 v
        }
        // -Y 方向：y < 0 都属于 -Y 面（wall: 3）的柱状范围
        else if (y < 0) {
            exitWall = 3;
            wallU = x;                   // x 坐标映射到 u
            wallV = z;                   // z 坐标映射到 v
        }
        // +Z 方向：z >= bounds.z 都属于 +Z 面（wall: 4）的柱状范围
        else if (z >= this.bounds.z) {
            exitWall = 4;
            wallU = x;                   // x 坐标映射到 u
            wallV = y;                   // y 坐标映射到 v
        }
        // -Z 方向：z < 0 都属于 -Z 面（wall: 5）的柱状范围
        else if (z < 0) {
            exitWall = 5;
            wallU = this.bounds.x - x;   // x 坐标反向映射到 u
            wallV = y;                   // y 坐标映射到 v
        }
        // 在世界范围内，不是洞的位置
        else return false;

        // 检查该墙面是否有洞
        const exit = this.exits.find(e => e.wall === exitWall);
        if (!exit) return false;

        // 检查该位置是否在洞的范围内（使用墙面局部坐标）
        return exit.cells.some(c => c.u === wallU && c.v === wallV);
    }

    canMove(block: BlockDef, dx: number, dy: number, dz: number): boolean {
        if (dx > 0 && !block.allowedDirs.includes('+x')) return false;
        if (dx < 0 && !block.allowedDirs.includes('-x')) return false;
        if (dy > 0 && !block.allowedDirs.includes('+y')) return false;
        if (dy < 0 && !block.allowedDirs.includes('-y')) return false;
        if (dz > 0 && !block.allowedDirs.includes('+z')) return false;
        if (dz < 0 && !block.allowedDirs.includes('-z')) return false;

        if (this.checkBlockExited(block)) {
            return false;
        }

        for (const cell of block.cells) {
            const nextX = block.position.x + cell.x + dx;
            const nextY = block.position.y + cell.y + dy;
            const nextZ = block.position.z + cell.z + dz;

            const isOutOfBounds = nextX < 0 || nextX >= this.bounds.x || nextY < 0 || nextY >= this.bounds.y || nextZ < 0 || nextZ >= this.bounds.z;

            if (isOutOfBounds) {
                if (!this.isExit({ x: nextX, y: nextY, z: nextZ })) {
                    return false;
                }
            } else {
                const occupant = this.getBlockAt(nextX, nextY, nextZ);
                if (occupant && occupant !== block) return false;
            }
        }
        return true;
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
