import type { GameLogic } from './logic';
import type { BlockMeshData } from './types';

/**
 * 全局游戏状态：存储游戏的所有共享数据。
 * 胜负判定等模块接收此引用（只读语义），从中提取所需数据。
 */
export interface GameState {
    logic: GameLogic;
    blockMeshes: Map<string, BlockMeshData>;
    selectedBlockId: string | null;
    phase: 'playing' | 'animating' | 'won' | 'lost';
    moves: number;
}
