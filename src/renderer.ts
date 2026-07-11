// 渲染器模块入口 - 统一导出墙面和方块渲染功能
export { createRoom, hasWallCell } from './wallRenderer';
export { createCanvasTexture, createBlocks, resetHover, updateSelectionVisuals } from './blockRenderer';
export type { WallMeshData } from './types';