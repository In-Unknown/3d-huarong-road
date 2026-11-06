import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSurfaces, arrowStrokes } from '../src/surfaces.ts';
import { DIRECTIONS, FACE_FRAMES, directionVector, dot } from '../src/space.ts';
import { PointerGestures } from '../src/gestures.ts';

test('a three-cell strip has a single continuous shaft with only two end heads', () => {
    const cells = [0, 1, 2].map(x => ({ x, y: 0, z: 0 }));
    const patch = extractSurfaces(cells).find(p => p.face === 4);
    assert.equal(patch.cells.length, 3);
    const strokes = arrowStrokes(patch, ['+x', '-x']);
    assert.equal(strokes.filter(s => s.head).length, 2);
    assert(strokes.some(s => s.from.u === 0 && s.to.u === 1));
    assert(strokes.some(s => s.from.u === 1 && s.to.u === 2));
});

test('L/T shapes, holes and disconnected surfaces never bridge empty space or a different plane', () => {
    const shapes = [
        [[0, 0], [1, 0], [0, 1]], [[0, 1], [1, 0], [1, 1], [1, 2]],
        [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]], [[0, 0], [2, 0]],
    ];
    for (const shape of shapes) for (const patch of extractSurfaces(shape.map(([x, y]) => ({ x, y, z: 0 })))) {
        for (const s of arrowStrokes(patch, DIRECTIONS)) for (let i = 0; i <= 20; i++) {
            const u = s.from.u + (s.to.u - s.from.u) * i / 20, v = s.from.v + (s.to.v - s.from.v) * i / 20;
            assert(patch.cells.some(c => Math.abs(c.u - u) <= 0.501 && Math.abs(c.v - v) <= 0.501));
        }
    }
    const disconnected = extractSurfaces([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }]).filter(p => p.face === 4);
    assert.equal(disconnected.length, 2);
    const stepped = extractSurfaces([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }]).filter(p => p.face === 4);
    assert.equal(stepped.length, 2); assert.notEqual(stepped[0].plane, stepped[1].plane);
});

test('dragging back, multiple pointers, cancellation and non-primary input never become clicks', () => {
    const g = new PointerGestures();
    g.down(1, 0, 0, 0, true); g.move(1, 100, 0); assert.equal(g.up(1, 0, 0), false);
    g.down(1, 0, 0, 0, true); g.down(2, 0, 0, 0, false);
    assert.equal(g.up(2, 0, 0), false); assert.equal(g.up(1, 0, 0), false);
    g.down(1, 0, 0, 0, true); g.cancel(1); assert.equal(g.up(1, 0, 0), false);
    g.down(1, 0, 0, 2, true); assert.equal(g.up(1, 0, 0), false);
    g.down(1, 0, 0, 0, true); g.clear(); assert.equal(g.up(1, 0, 0), false);
    g.down(1, 0, 0, 0, true); assert.equal(g.up(1, 2, 0), true);
});

test('arrowheads preserve each allowed world direction on all six face orientations', () => {
    const patches = extractSurfaces([{ x: 0, y: 0, z: 0 }]);
    for (const patch of patches) for (const dir of DIRECTIONS) {
        const frame = FACE_FRAMES[patch.face], world = directionVector(dir);
        const u = dot(world, frame.u), v = dot(world, frame.v);
        const heads = arrowStrokes(patch, [dir]).filter(s => s.head);
        assert.equal(heads.length, u || v ? 1 : 0);
        for (const head of heads) {
            assert.equal(Math.sign(head.to.u - head.from.u) || 0, u || 0);
            assert.equal(Math.sign(head.to.v - head.from.v) || 0, v || 0);
        }
    }
});
