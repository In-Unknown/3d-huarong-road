import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from './types';

export function roomBox(bounds: Vec3): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(bounds.x - 0.5, bounds.y - 0.5, bounds.z - 0.5));
}

/** Choose distance using every corner in camera axes, including depth perspective. */
export function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, bounds: Vec3, resetDirection = false): void {
    const box = roomBox(bounds), center = box.getCenter(new THREE.Vector3());
    const outward = resetDirection ? new THREE.Vector3(1, 0.85, 1.3).normalize() : camera.position.clone().sub(controls.target).normalize();
    if (!outward.lengthSq()) outward.set(1, 0.85, 1.3).normalize();
    camera.up.set(0, 1, 0);
    camera.position.copy(center).add(outward); camera.lookAt(center); camera.updateMatrixWorld();
    const inverseRotation = camera.quaternion.clone().invert();
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * camera.aspect;
    let distance = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(inverseRotation);
        distance = Math.max(distance, p.z + Math.abs(p.x) / (tanX * 0.86), p.z + Math.abs(p.y) / (tanY * 0.86));
    }
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    controls.target.copy(center); controls.cursor.copy(center);
    // Keep orbit radius nonzero; room access is controlled by the level's view config.
    controls.minDistance = 0.75;
    controls.maxDistance = Math.max(distance * 3, radius * 6);
    controls.maxTargetRadius = radius * 0.65;
    camera.position.copy(center).addScaledVector(outward, Math.max(distance, controls.minDistance));
    camera.near = 0.05; camera.far = controls.maxDistance + radius * 4 + 20; camera.updateProjectionMatrix();
    controls.update(); camera.updateMatrixWorld();
}

export function fitShadow(light: THREE.DirectionalLight, bounds: Vec3): void {
    const box = roomBox(bounds), center = box.getCenter(new THREE.Vector3());
    const diagonal = box.getSize(new THREE.Vector3()).length();
    light.position.copy(center).add(new THREE.Vector3(1.2, 1.9, 1.5).normalize().multiplyScalar(diagonal * 2));
    light.target.position.copy(center); light.target.updateMatrixWorld(); light.updateMatrixWorld();
    light.shadow.updateMatrices(light);
    const camera = light.shadow.camera;
    const corners = new THREE.Box3();
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        corners.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    }
    const margin = 2;
    camera.left = corners.min.x - margin; camera.right = corners.max.x + margin;
    camera.bottom = corners.min.y - margin; camera.top = corners.max.y + margin;
    camera.near = Math.max(0.1, -corners.max.z - margin); camera.far = -corners.min.z + margin;
    camera.updateProjectionMatrix(); light.shadow.needsUpdate = true;
}

export function effectiveDPR(width: number, height: number, deviceRatio: number): number {
    return Math.min(deviceRatio || 1, 1.75, Math.sqrt(2_000_000 / Math.max(1, width * height)));
}
