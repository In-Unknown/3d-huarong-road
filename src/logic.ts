import type { Vec3, BlockDef } from './types';

export class GameLogic {
    bounds: Vec3;
    blocks: BlockDef[];

    constructor(bounds: Vec3, blocks: BlockDef[]) {
        this.bounds = bounds;
        this.blocks = blocks;
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

    canMove(block: BlockDef, dx: number, dy: number, dz: number): boolean {
        if (dx > 0 && !block.allowedDirs.includes('+x')) return false;
        if (dx < 0 && !block.allowedDirs.includes('-x')) return false;
        if (dy > 0 && !block.allowedDirs.includes('+y')) return false;
        if (dy < 0 && !block.allowedDirs.includes('-y')) return false;
        if (dz > 0 && !block.allowedDirs.includes('+z')) return false;
        if (dz < 0 && !block.allowedDirs.includes('-z')) return false;

        for (const cell of block.cells) {
            const nextX = block.position.x + cell.x + dx;
            const nextY = block.position.y + cell.y + dy;
            const nextZ = block.position.z + cell.z + dz;

            if (nextX < 0 || nextX >= this.bounds.x || nextY < 0 || nextY >= this.bounds.y || nextZ < 0 || nextZ >= this.bounds.z) {
                return false;
            }
            const occupant = this.getBlockAt(nextX, nextY, nextZ);
            if (occupant && occupant !== block) return false;
        }
        return true;
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
