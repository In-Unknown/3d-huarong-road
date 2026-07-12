import type { GameState } from './gameState';
import type { BlockDef } from './types';

/**
 * 胜负判定模块：从全局状态中提取数据，判断游戏胜负。
 * 不修改任何状态，纯只读判定。
 */

// 游戏结果
export type GameResult = 'pending' | 'victory' | 'defeat';

/**
 * 胜利判定：
 * 1. 所有 target 块到达各自 targetPosition
 * 2. 所有 exit 块已离开世界（从 blocks 中移除）
 */
export function checkVictory(state: GameState): boolean {
    const { blocks } = state.logic;

    const targets = blocks.filter(b => b.type === 'target');
    const targetsDone = targets.every(t =>
        t.targetPosition &&
        t.position.x === t.targetPosition.x &&
        t.position.y === t.targetPosition.y &&
        t.position.z === t.targetPosition.z
    );
    if (!targetsDone) return false;

    // exit 块离开世界后会被 removeBlock 移除，blocks 中不再存在即完成
    const remainingExits = blocks.filter(b => b.type === 'exit');
    return remainingExits.length === 0;
}

/**
 * 失败判定：指定块离开世界是否导致游戏失败。
 * target 块不能离开世界，否则游戏失败（死局）。
 */
export function isExitCausesDefeat(block: BlockDef): boolean {
    return block.type === 'target';
}
