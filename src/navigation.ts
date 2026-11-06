import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LevelViewConfig, Vec3 } from './types';
import { roomBox } from './view';

export interface OrbitPose { target: THREE.Vector3; orbit: THREE.Spherical }

/** First contact along the orbit arc, including simultaneous pan and dolly.
 * A second-derivative bound encloses each curved interval, so a large input
 * cannot skip through a corner even when both endpoints are outside. */
export function clipOrbitPath(box: THREE.Box3, from: OrbitPose, to: OrbitPose, up: THREE.Quaternion): number {
    const dr = to.orbit.radius - from.orbit.radius;
    const dp = to.orbit.phi - from.orbit.phi, dt = to.orbit.theta - from.orbit.theta;
    const angle = Math.abs(dp) + Math.abs(dt);
    const radius = Math.max(from.orbit.radius, to.orbit.radius);
    const acceleration = radius * angle * angle + 2 * Math.abs(dr) * angle;
    const speed = from.target.distanceTo(to.target) + Math.abs(dr) + radius * angle;
    if (speed < 1e-10) return 1;
    const at = (t: number) => new THREE.Vector3().setFromSpherical(new THREE.Spherical(
        from.orbit.radius + dr * t, from.orbit.phi + dp * t, from.orbit.theta + dt * t,
    )).applyQuaternion(up).add(new THREE.Vector3().lerpVectors(from.target, to.target, t));
    let budget = 4096;
    const visit = (a: number, b: number, p: THREE.Vector3, q: THREE.Vector3, depth: number): number => {
        const error = acceleration * (b - a) ** 2 / 8;
        // A disjoint enclosure proves that the entire arc interval is safe.
        if (['x', 'y', 'z'].some(k => {
            const axis = k as keyof Vec3;
            return Math.max(p[axis], q[axis]) + error <= box.min[axis]
                || Math.min(p[axis], q[axis]) - error >= box.max[axis];
        })) return b;
        if (--budget <= 0 || depth === 28 || speed * (b - a) < 1e-6) return a;
        const mid = (a + b) / 2, m = at(mid);
        const first = visit(a, mid, p, m, depth + 1);
        return first < mid ? first : visit(mid, b, m, q, depth + 1);
    };
    return visit(0, 1, at(0), at(1), 0);
}

/** Evaluate input on a scratch camera; only the allowed part reaches the visible
 * camera. OrbitControls consumes the whole input so blocked motion never builds up.
 * This adapter uses the app's non-damped, non-cursor-zoom perspective controls. */
export function constrainRoomNavigation(controls: OrbitControls, camera: THREE.PerspectiveCamera,
    bounds: Vec3, config: LevelViewConfig): void {
    const candidate = camera.clone();
    const update = controls.update.bind(controls);
    controls.update = (deltaTime?: number | null): boolean => {
        if (config.allowInteriorView) return update(deltaTime);
        const align = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0));
        const up = align.clone().invert();
        const from: OrbitPose = { target: controls.target.clone(), orbit: new THREE.Spherical()
            .setFromVector3(camera.position.clone().sub(controls.target).applyQuaternion(align)) };
        candidate.copy(camera);
        controls.object = candidate;
        let changed: boolean;
        try { changed = update(deltaTime); } finally { controls.object = camera; }
        const to: OrbitPose = { target: controls.target.clone(), orbit: new THREE.Spherical(
            candidate.position.distanceTo(controls.target), controls.getPolarAngle(), controls.getAzimuthalAngle()) };
        // Margin keeps the near clipping plane outside the room as well.
        const box = roomBox(bounds).expandByScalar(Math.max(0.1, camera.near * 2));
        const t = clipOrbitPath(box, from, to, up);
        controls.target.lerpVectors(from.target, to.target, t);
        camera.position.setFromSpherical(new THREE.Spherical(
            THREE.MathUtils.lerp(from.orbit.radius, to.orbit.radius, t),
            THREE.MathUtils.lerp(from.orbit.phi, to.orbit.phi, t),
            THREE.MathUtils.lerp(from.orbit.theta, to.orbit.theta, t),
        )).applyQuaternion(up).add(controls.target);
        camera.lookAt(controls.target);
        // Synchronize the public angle getters and change-event cache at the accepted pose.
        update(0);
        return changed;
    };
}
