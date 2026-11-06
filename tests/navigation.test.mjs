import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { clipOrbitPath } from '../src/navigation.ts';

const box = new T.Box3(new T.Vector3(-5, -2, -2), new T.Vector3(5, 2, 2));
const up = new T.Quaternion();
const pose = (radius, theta = 0, target = new T.Vector3(), phi = Math.PI / 2) => ({ target, orbit: new T.Spherical(radius, phi, theta) });
const point = (a, b, t) => new T.Vector3().setFromSpherical(new T.Spherical(
    T.MathUtils.lerp(a.orbit.radius, b.orbit.radius, t), T.MathUtils.lerp(a.orbit.phi, b.orbit.phi, t),
    T.MathUtils.lerp(a.orbit.theta, b.orbit.theta, t),
)).add(new T.Vector3().lerpVectors(a.target, b.target, t));

test('zoom stops at the first boundary, repeated inward input stays still, outward input works immediately', () => {
    const a = pose(10), b = pose(0.75), t = clipOrbitPath(box, a, b, up);
    const p = point(a, b, t);
    assert.ok(p.z >= 2 && p.z < 2.000002);
    const edge = pose(p.z);
    assert.ok(clipOrbitPath(box, edge, b, up) < 1e-6);
    assert.equal(clipOrbitPath(box, edge, a, up), 1);
});

test('rotation stops on its arc before entry even when both endpoints are outside', () => {
    for (const end of [Math.PI, -Math.PI, 4 * Math.PI]) {
        const a = pose(3), b = pose(3, end), t = clipOrbitPath(box, a, b, up);
        assert.ok(t > 0 && t < 1);
        const p = point(a, b, t);
        assert.ok(p.z >= 2 && p.z < 2.000003);
        assert.ok(Math.abs(p.length() - 3) < 1e-9, 'no radial push-out during rotation');
        const edge = pose(3, end * t);
        assert.equal(clipOrbitPath(box, edge, a, up), 1);
    }
});

test('pan cannot cross the room in one event and a clear arc is not stopped by its chord', () => {
    const a = pose(3), b = pose(3, 0, new T.Vector3(0, 0, -10));
    const t = clipOrbitPath(box, a, b, up);
    assert.ok(point(a, b, t).z >= 2 && point(a, b, t).z < 2.000002);
    assert.equal(clipOrbitPath(box, pose(10), pose(10, Math.PI), up), 1);
});

test('combined pan, rotation and zoom never accept a sampled point inside the room', () => {
    let seed = 73951;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 300; i++) {
        const a = pose(10, rand() * Math.PI * 2);
        const b = pose(0.75 + rand() * 12, a.orbit.theta + (rand() - 0.5) * 8,
            new T.Vector3((rand() - 0.5) * 10, (rand() - 0.5) * 5, (rand() - 0.5) * 10), 0.1 + rand() * 2.9);
        const t = clipOrbitPath(box, a, b, up);
        for (let j = 0; j <= 100; j++) assert.equal(box.containsPoint(point(a, b, t * j / 100)), false);
    }
});
