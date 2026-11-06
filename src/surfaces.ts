import type { Direction, Vec3 } from './types';
import { cellKey, directionVector, dot, FACE_FRAMES } from './space';

export type Point2 = { u: number; v: number };
export interface SurfacePatch { face: number; plane: number; cells: Point2[] }
export interface ArrowStroke { from: Point2; to: Point2; head?: Direction }
const key = (p: Point2) => `${p.u},${p.v}`;
const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function connectedRegions(cells: Point2[]): Point2[][] {
    const remaining = new Map(cells.map(p => [key(p), p]));
    const regions: Point2[][] = [];
    while (remaining.size) {
        const first = remaining.values().next().value!;
        const region = [first]; remaining.delete(key(first));
        for (let i = 0; i < region.length; i++) for (const [du, dv] of neighbors) {
            const k = key({ u: region[i].u + du, v: region[i].v + dv });
            const p = remaining.get(k);
            if (p) { region.push(p); remaining.delete(k); }
        }
        regions.push(region);
    }
    return regions;
}

/** Split only at a real edge, a step in depth, or a disconnected surface. */
export function extractSurfaces(cells: Vec3[]): SurfacePatch[] {
    const occupied = new Set(cells.map(cellKey));
    const patches: SurfacePatch[] = [];
    FACE_FRAMES.forEach((frame, face) => {
        const planes = new Map<number, Point2[]>();
        for (const cell of cells) {
            const n = frame.normal;
            if (occupied.has(cellKey({ x: cell.x + n.x, y: cell.y + n.y, z: cell.z + n.z }))) continue;
            const plane = dot(cell, n) + 0.5;
            const group = planes.get(plane) ?? [];
            group.push({ u: dot(cell, frame.u), v: dot(cell, frame.v) }); planes.set(plane, group);
        }
        for (const [plane, cells] of planes) for (const region of connectedRegions(cells)) patches.push({ face, plane, cells: region });
    });
    return patches;
}

/** A continuous centerline network, with arrowheads only at allowed boundary directions.
 * Each segment stays inside the union of its neighboring cells, including concave patches.
 */
export function arrowStrokes(patch: SurfacePatch, allowed: Direction[]): ArrowStroke[] {
    const frame = FACE_FRAMES[patch.face];
    const dirs = allowed.map(dir => ({ dir, u: dot(directionVector(dir), frame.u), v: dot(directionVector(dir), frame.v) }))
        .filter(d => d.u || d.v);
    if (!dirs.length) return [];
    const cells = new Set(patch.cells.map(key));
    const strokes: ArrowStroke[] = [];
    for (const p of patch.cells) {
        // Connect each shared edge once. No repeated arrowheads at cell seams.
        for (const [u, v] of [[1, 0], [0, 1]]) {
            const next = { u: p.u + u, v: p.v + v };
            if (cells.has(key(next))) strokes.push({ from: p, to: next });
        }
        for (const d of dirs) if (!cells.has(key({ u: p.u + d.u, v: p.v + d.v }))) {
            const tip = { u: p.u + d.u * 0.32, v: p.v + d.v * 0.32 };
            strokes.push({ from: p, to: tip, head: d.dir });
            for (const side of [-1, 1]) strokes.push({
                from: { u: tip.u - d.u * 0.15 - d.v * 0.13 * side, v: tip.v - d.v * 0.15 + d.u * 0.13 * side },
                to: tip,
            });
        }
    }
    return strokes;
}
