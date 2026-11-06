import type { GameLogic } from './logic';
import type { BlockDef } from './types';

export type GameResult = 'pending' | 'victory' | 'defeat';

export function checkVictory(state: { logic: GameLogic }): boolean {
    const { logic } = state;
    if (logic.targetGoals.size + logic.exitIds.size === 0) return false;
    for (const [id, target] of logic.targetGoals) {
        const block = logic.blocks.find(b => b.id === id);
        if (!block || block.position.x !== target.x || block.position.y !== target.y || block.position.z !== target.z) return false;
    }
    return [...logic.exitIds].every(id => logic.hasCompletedExit(id));
}

export const isExitCausesDefeat = (block: BlockDef) => block.type === 'target';
