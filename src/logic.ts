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

    private isExit(pos: Vec3): boolean {
        const { x, y, z } = pos;

        let exitWall: number;
        let wallX: number, wallY: number;

        if (x >= this.bounds.x) { exitWall = 0; wallX = x - this.bounds.x; wallY = y; }
        else if (x < 0) { exitWall = 1; wallX = this.bounds.x - 1 + x; wallY = y; }
        else if (y >= this.bounds.y) { exitWall = 2; wallX = x; wallY = y - this.bounds.y; }
        else if (y < 0) { exitWall = 3; wallX = x; wallY = this.bounds.y - 1 + y; }
        else if (z >= this.bounds.z) { exitWall = 4; wallX = x; wallY = y; }
        else if (z < 0) { exitWall = 5; wallX = x; wallY = y; }
        else return false;

        const exit = this.exits.find(e => e.wall === exitWall);
        if (!exit) return false;

        return exit.cells.some(c => c.x === wallX && c.y === wallY);
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
