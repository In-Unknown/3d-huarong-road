import type { Vec3, BlockDef, ExitDef, Direction } from './types';
import { DIRECTIONS, cellKey, createExitSet, isInside, isExitColumn, validateLevel } from './space';

/** Owns a fresh level instance. Queries and commits use the same swept-cell rule. */
export class GameLogic {
    readonly bounds: Vec3;
    readonly blocks: BlockDef[];
    readonly exits: ExitDef[];
    readonly targetGoals: ReadonlyMap<string, Vec3>;
    readonly exitIds: ReadonlySet<string>;
    private readonly exitCells: Set<string>;
    private readonly completedExits = new Set<string>();

    constructor(bounds: Vec3, blocks: BlockDef[], exits: ExitDef[] = []) {
        validateLevel(bounds, blocks, exits);
        this.bounds = structuredClone(bounds);
        this.blocks = structuredClone(blocks);
        this.exits = structuredClone(exits);
        this.exitCells = createExitSet(exits);
        this.targetGoals = new Map(blocks.filter(b => b.type === 'target').map(b => [b.id, { ...b.targetPosition! }]));
        this.exitIds = new Set(blocks.filter(b => b.type === 'exit').map(b => b.id));
    }

    getBlockAt(x: number, y: number, z: number): BlockDef | null {
        return this.blocks.find(block => block.cells.some(c =>
            block.position.x + c.x === x && block.position.y + c.y === y && block.position.z + c.z === z)) ?? null;
    }

    private direction(dx: number, dy: number, dz: number): Direction | undefined {
        const values = [dx, dy, dz];
        if (!values.every(Number.isSafeInteger) || values.filter(v => v !== 0).length !== 1) return;
        return DIRECTIONS.find(d => {
            const axis = d[1] as keyof Vec3;
            return ({ x: dx, y: dy, z: dz })[axis] * (d[0] === '+' ? 1 : -1) > 0;
        });
    }

    canMove(block: BlockDef, dx: number, dy: number, dz: number): boolean {
        if (!this.direction(dx, dy, dz)) return false;
        return this.getMaxMoveDistance(block, Math.sign(dx), Math.sign(dy), Math.sign(dz))[3] === 1;
    }

    /** Bounded query: never extends the request, skips a cell or reverses direction. */
    getMaxMoveDistance(block: BlockDef, dx: number, dy: number, dz: number): [number, number, number, number] {
        const direction = this.direction(dx, dy, dz);
        if (!direction || !this.blocks.includes(block) || block.type === 'wall' ||
            !block.allowedDirs.includes(direction) || this.checkBlockExited(block)) return [0, 0, 0, 0];
        const axis = direction[1] as keyof Vec3;
        const sign = direction[0] === '+' ? 1 : -1;
        const coords = block.cells.map(c => block.position[axis] + c[axis]);
        const untilExited = sign > 0 ? this.bounds[axis] - Math.min(...coords) : Math.max(...coords) + 1;
        const limit = Math.min(Math.abs(dx || dy || dz), untilExited);
        const occupied = new Set<string>();
        for (const other of this.blocks) if (other !== block) for (const c of other.cells) {
            occupied.add(cellKey({ x: other.position.x + c.x, y: other.position.y + c.y, z: other.position.z + c.z }));
        }
        let distance = 0;
        for (let step = 1; step <= limit; step++) {
            const legal = block.cells.every(c => {
                const p = { x: block.position.x + c.x, y: block.position.y + c.y, z: block.position.z + c.z };
                p[axis] += step * sign;
                return !occupied.has(cellKey(p)) && (isInside(p, this.bounds) || isExitColumn(p, this.bounds, this.exitCells));
            });
            if (!legal) break;
            distance = step;
        }
        return [Math.sign(dx) * distance, Math.sign(dy) * distance, Math.sign(dz) * distance, distance];
    }

    /** Slide until collision or the trailing cell has completely left the room. */
    getSlideVector(block: BlockDef, direction: Direction): [number, number, number, number] {
        if (!DIRECTIONS.includes(direction)) return [0, 0, 0, 0];
        const axis = direction[1] as keyof Vec3;
        const sign = direction[0] === '+' ? 1 : -1;
        const coords = block.cells.map(c => block.position[axis] + c[axis]);
        const distance = sign > 0 ? this.bounds[axis] - Math.min(...coords) : Math.max(...coords) + 1;
        if (distance <= 0) return [0, 0, 0, 0];
        const v = { x: 0, y: 0, z: 0 }; v[axis] = sign * distance;
        return this.getMaxMoveDistance(block, v.x, v.y, v.z);
    }

    /** Atomic commit: reject an invalid request instead of partially applying it. */
    moveBlock(block: BlockDef, dx: number, dy: number, dz: number): number {
        const move = this.getMaxMoveDistance(block, dx, dy, dz);
        if (move[3] === 0 || move[0] !== dx || move[1] !== dy || move[2] !== dz) return 0;
        block.position.x += dx; block.position.y += dy; block.position.z += dz;
        return move[3];
    }

    checkBlockExited(block: BlockDef): boolean {
        return block.cells.length > 0 && block.cells.every(c => !isInside({
            x: block.position.x + c.x, y: block.position.y + c.y, z: block.position.z + c.z,
        }, this.bounds));
    }

    removeBlock(blockId: string): boolean {
        const index = this.blocks.findIndex(b => b.id === blockId);
        if (index < 0) return false;
        const block = this.blocks[index];
        if (block.type === 'target' || block.type === 'wall' || !this.checkBlockExited(block)) return false;
        if (block.type === 'exit') this.completedExits.add(blockId);
        this.blocks.splice(index, 1);
        return true;
    }

    hasCompletedExit(id: string): boolean { return this.completedExits.has(id); }
}
