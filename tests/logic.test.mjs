import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLogic } from '../src/logic.ts';
import { checkVictory } from '../src/winLoss.ts';
import { LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS } from '../src/data.ts';
import { DIRECTIONS, directionVector, wallCellPosition, wallSize } from '../src/space.ts';

const c = (x, y, z = 0) => ({ x, y, z });
const block = (cells = [c(0, 0)], position = c(0, 0), type = 'obstacle') => ({ id: 'a', type, cells, position, allowedDirs: [...DIRECTIONS] });
const make = (b, bounds = c(5, 5, 5), exits = []) => { const logic = new GameLogic(bounds, [b], exits); return [logic, logic.blocks[0]]; };

test('Shift cannot push the shorter arm of an L shape through a solid wall', () => {
    const [l, b] = make(block([c(0, 0), c(1, 0), c(1, 1)]), c(3, 3, 3), [{ wall: 1, cells: [{ u: 0, v: 0 }] }]);
    assert.equal(l.getMaxMoveDistance(b, -1, 0, 0)[3], 1);
    assert.deepEqual(l.getSlideVector(b, '-x'), [-1, 0, 0, 1]);
    assert.equal(l.moveBlock(b, -2, 0, 0), 0);
    assert.deepEqual(b.position, c(0, 0));
});

test('an opening is not a blocker when another arm later meets a wall', () => {
    const [l, b] = make(block([c(0, 0), c(1, 0), c(0, 1)], c(1, 0)), c(4, 3, 3), [{ wall: 0, cells: [{ u: 2, v: 0 }] }]);
    assert.equal(l.getSlideVector(b, '+x')[3], 2);
    assert.equal(l.getMaxMoveDistance(b, 1, 0, 0)[3], 1);
});

test('all exit definitions on a wall are accepted', () => {
    const [l, b] = make(block([c(0, 0)], c(2, 1)), c(3, 3, 3), [
        { wall: 0, cells: [{ u: 2, v: 0 }] }, { wall: 0, cells: [{ u: 2, v: 1 }] },
    ]);
    assert.equal(l.moveBlock(b, 1, 0, 0), 1);
});

test('partially exited blocks finish a slide in both signs without overshooting or reversing', () => {
    for (const dir of DIRECTIONS) {
        const axis = dir[1], sign = dir[0] === '+' ? 1 : -1;
        const cells = [c(0, 0, 0), c(0, 0, 0), c(0, 0, 0)]; cells[1][axis] = 1; cells[2][axis] = 2;
        const position = c(1, 1, 1); position[axis] = sign > 0 ? 2 : 0;
        const wall = DIRECTIONS.indexOf(dir);
        const openings = Array.from({ length: 25 }, (_, i) => ({ u: i % 5, v: Math.floor(i / 5) }));
        const [l, b] = make(block(cells, position), c(5, 5, 5), [{ wall, cells: openings }]);
        const v = directionVector(dir);
        assert.equal(l.moveBlock(b, v.x, v.y, v.z), 1);
        assert.equal(l.moveBlock(b, v.x, v.y, v.z), 1);
        const slide = l.getSlideVector(b, dir);
        assert.equal(slide[3], 1, dir);
        assert.equal(l.moveBlock(b, ...slide.slice(0, 3)), 1);
        assert.equal(l.checkBlockExited(b), true);
    }
});

test('queries and public commits reject invalid directions, foreign blocks and wall motion', () => {
    const source = block([c(0, 0)], c(1, 1, 1)); const [l, b] = make(source);
    for (const v of [[0, 0, 0], [1, 1, 0], [0.5, 0, 0], [NaN, 0, 0], [Infinity, 0, 0]]) {
        assert.equal(l.getMaxMoveDistance(b, ...v)[3], 0);
        assert.equal(l.moveBlock(b, ...v), 0);
    }
    assert.equal(l.moveBlock(source, 1, 0, 0), 0);
    b.allowedDirs = ['-x']; assert.equal(l.moveBlock(b, 1, 0, 0), 0);
    b.type = 'wall'; assert.equal(l.moveBlock(b, -1, 0, 0), 0);
    assert.deepEqual(b.position, c(1, 1, 1));
});

test('level templates survive play, exit removal and restart', () => {
    const snapshot = JSON.stringify([LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS]);
    const l = new GameLogic(LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS);
    const b = l.blocks.find(b => b.id === 'obs2');
    const move = l.getSlideVector(b, '+z'); l.moveBlock(b, ...move.slice(0, 3));
    assert.equal(l.removeBlock('obs2'), true);
    assert.equal(JSON.stringify([LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS]), snapshot);
    assert.equal(new GameLogic(LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS).blocks.length, 10);
});

test('current level is solvable in 25 unit steps and original objectives cannot disappear', () => {
    const l = new GameLogic(LEVEL_BOUNDS, LEVEL_BLOCKS, LEVEL_EXITS);
    const plan = [['obs1', '+y', 2], ['target1', '+x', 3], ['target2', '+x', 4], ['target2', '+z', 4],
        ['exit1', '-x', 2], ['exit1', '+y', 3], ['exit2', '+x', 3], ['exit2', '-y', 3], ['exit2', '-z', 1]];
    let steps = 0;
    for (const [id, dir, count] of plan) {
        const b = l.blocks.find(b => b.id === id), v = directionVector(dir);
        for (let i = 0; i < count; i++) { assert.equal(l.moveBlock(b, v.x, v.y, v.z), 1, id); steps++; }
        if (l.checkBlockExited(b)) assert.equal(l.removeBlock(id), true);
    }
    assert.equal(steps, 25); assert.equal(checkVictory({ logic: l }), true);
    l.blocks.splice(l.blocks.findIndex(b => b.id === 'target1'), 1);
    assert.equal(checkVictory({ logic: l }), false);
    assert.equal(checkVictory({ logic: new GameLogic(c(3, 3, 3), [], []) }), false);
});

test('only a legitimate exit can complete an exit objective', () => {
    const [l, b] = make(block([c(0, 0)], c(0, 0), 'exit'));
    assert.equal(l.removeBlock(b.id), false);
    l.blocks.splice(0, 1);
    assert.equal(checkVictory({ logic: l }), false);
});

test('invalid level data fails early with useful errors', () => {
    const a = block();
    assert.throws(() => new GameLogic(c(0, 5, 5), [a]), /尺寸/);
    assert.throws(() => new GameLogic(c(5, 5, 5), [a, a]), /ID/);
    assert.throws(() => make({ ...a, cells: [] }), /形状/);
    assert.throws(() => make({ ...a, cells: [c(0, 0), c(0, 0)] }), /重复/);
    assert.throws(() => make({ ...a, position: c(-1, 0) }), /超出/);
    assert.throws(() => make({ ...a, type: 'target' }), /目标/);
    assert.throws(() => make({ ...a, type: 'wall' }), /墙体/);
    assert.throws(() => new GameLogic(c(5, 5, 5), [a, { ...a, id: 'b' }]), /重叠/);
    assert.throws(() => make(a, c(5, 5, 5), [{ wall: 0, cells: [{ u: 5, v: 0 }] }]), /出口/);
});

test('wall coordinates work for every face and non-cubic dimensions', () => {
    const bounds = c(10, 5, 7);
    for (let wall = 0; wall < 6; wall++) {
        const [w, h] = wallSize(bounds, wall), d = directionVector(DIRECTIONS[wall]);
        for (let u = 0; u < w; u++) for (let v = 0; v < h; v++) {
            const [l, b] = make(block([c(0, 0)], wallCellPosition(bounds, wall, u, v)), bounds, [{ wall, cells: [{ u, v }] }]);
            assert.equal(l.moveBlock(b, d.x, d.y, d.z), 1, JSON.stringify({ wall, u, v }));
        }
    }
});

// Independent reference: enumerate legal world coordinates, not production exit projection.
function oracle(logic, b, dir) {
    const vector = directionVector(dir), holes = new Set();
    for (const e of logic.exits) for (const { u, v } of e.cells) for (let d = 1; d <= 12; d++) {
        const { x: bx, y: by, z: bz } = logic.bounds;
        const p = [c(bx - 1 + d, v, bz - 1 - u), c(-d, v, u), c(u, by - 1 + d, bz - 1 - v),
            c(u, -d, v), c(u, v, bz - 1 + d), c(bx - 1 - u, v, -d)][e.wall];
        holes.add(JSON.stringify(p));
    }
    const occupied = logic.blocks.filter(x => x !== b).flatMap(o => o.cells.map(p => c(o.position.x + p.x, o.position.y + p.y, o.position.z + p.z)));
    const inside = p => Object.keys(p).every(axis => p[axis] >= 0 && p[axis] < logic.bounds[axis]);
    let distance = 0;
    for (let step = 1; step <= 12; step++) {
        const next = b.cells.map(p => c(b.position.x + p.x + vector.x * step, b.position.y + p.y + vector.y * step, b.position.z + p.z + vector.z * step));
        if (next.some(p => !inside(p) && !holes.has(JSON.stringify(p)) || occupied.some(o => o.x === p.x && o.y === p.y && o.z === p.z))) break;
        distance = step; if (next.every(p => !inside(p))) break;
    }
    return distance;
}
test('18,000 randomized slides match an independent swept-volume oracle', () => {
    let seed = 12345;
    const rand = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    const shapes = [[c(0, 0)], [c(0, 0), c(1, 0)], [c(0, 0), c(1, 0), c(0, 1)], [c(0, 0), c(0, 1), c(1, 1), c(1, 2)]];
    for (let trial = 0; trial < 3000; trial++) {
        const b = block(shapes[rand(4)], c(rand(3), rand(3), rand(3)));
        const exits = Array.from({ length: 6 }, (_, wall) => ({ wall, cells: Array.from({ length: 25 }, (_, i) => ({ u: i % 5, v: Math.floor(i / 5) })).filter(() => rand(3) !== 0) }));
        const blockers = [];
        for (let i = 0; i < 3; i++) {
            const p = c(rand(5), rand(5), rand(5));
            if (b.cells.some(k => b.position.x + k.x === p.x && b.position.y + k.y === p.y && b.position.z + k.z === p.z) || blockers.some(k => JSON.stringify(k.position) === JSON.stringify(p))) continue;
            blockers.push({ id: 'wall' + i, type: 'wall', cells: [c(0, 0)], position: p, allowedDirs: [] });
        }
        const l = new GameLogic(c(5, 5, 5), [b, ...blockers], exits);
        for (const dir of DIRECTIONS) assert.equal(l.getSlideVector(l.blocks[0], dir)[3], oracle(l, l.blocks[0], dir), JSON.stringify({ trial, dir, b }));
    }
});
