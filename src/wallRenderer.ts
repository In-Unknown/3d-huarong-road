import * as THREE from 'three';
import type { Vec3, ExitDef, WallMeshData } from './types';
import { FACE_FRAMES, wallSize, wallCellPosition, createExitSet, exitKey } from './space';
import { connectedRegions } from './surfaces';
import type { Point2 } from './surfaces';
import { mergeAndDispose } from './resources';
import { createWallMaterial } from './wallMaterial';

function wallPoint(bounds: Vec3, wall: number, u: number, v: number): THREE.Vector3 {
    const p = wallCellPosition(bounds, wall, u, v), n = FACE_FRAMES[wall].normal;
    return new THREE.Vector3(p.x + n.x * 0.5, p.y + n.y * 0.5, p.z + n.z * 0.5);
}
function wallPlane(bounds: Vec3, wall: number, u: number, v: number): THREE.BufferGeometry {
    const f = FACE_FRAMES[wall];
    const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.u.x, f.u.y, f.u.z),
        new THREE.Vector3(f.v.x, f.v.y, f.v.z), new THREE.Vector3(f.normal.x, f.normal.y, f.normal.z));
    matrix.setPosition(wallPoint(bounds, wall, u, v));
    return new THREE.PlaneGeometry(1, 1).applyMatrix4(matrix);
}

/** Largest filled rectangle: the spotlight's cone fits through real opening cells,
 * including L-shaped openings. It never shines through the bounding box's missing cells.
 */
function aperture(region: Point2[]): { u: number; v: number; radius: number } {
    const set = new Set(region.map(c => `${c.u},${c.v}`));
    let best = { u: region[0].u, v: region[0].v, radius: 0.42 };
    for (const p of region) {
        let width = Infinity;
        for (let height = 1; set.has(`${p.u},${p.v + height - 1}`); height++) {
            let rowWidth = 0;
            while (set.has(`${p.u + rowWidth},${p.v + height - 1}`)) rowWidth++;
            width = Math.min(width, rowWidth);
            const radius = Math.min(width, height) / 2 - 0.08;
            if (radius > best.radius) best = { u: p.u + (width - 1) / 2, v: p.v + (height - 1) / 2, radius };
        }
    }
    return best;
}

export function createRoom(scene: THREE.Scene, bounds: Vec3, exits: ExitDef[]): WallMeshData {
    const group = new THREE.Group(), solidCells = new Set<string>(), lights: THREE.SpotLight[] = [];
    const occluders: THREE.Mesh[] = [];
    const exitCells = createExitSet(exits);
    const wallMaterial = createWallMaterial(THREE.BackSide);
    const fillMaterial = new THREE.MeshBasicMaterial({
        color: 0x238fcf, side: THREE.DoubleSide, transparent: true, opacity: 0.1, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
        color: 0x16495f, emissive: 0x00aadd, emissiveIntensity: 0.8, roughness: 0.65,
    });
    const box = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(bounds.x - 0.5, bounds.y - 0.5, bounds.z - 0.5));
    const min = box.min.clone().addScalar(-0.012), max = box.max.clone().addScalar(0.012);
    const hiddenEdges: number[] = [];
    for (let axis = 0; axis < 3; axis++) {
        const other = [0, 1, 2].filter(i => i !== axis);
        for (const a of [min.getComponent(other[0]), max.getComponent(other[0])])
            for (const b of [min.getComponent(other[1]), max.getComponent(other[1])]) {
                const start = new THREE.Vector3().setComponent(other[0], a).setComponent(other[1], b).setComponent(axis, min.getComponent(axis));
                const end = start.clone().setComponent(axis, max.getComponent(axis));
                hiddenEdges.push(...start.toArray(), ...end.toArray());
            }
    }
    const hiddenEdgeGeometry = new THREE.BufferGeometry();
    hiddenEdgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hiddenEdges, 3));
    hiddenEdgeGeometry.computeBoundingSphere();
    const hiddenEdgeMaterial = new THREE.LineDashedMaterial({
        color: 0x83a9d4, transparent: true, opacity: 0.72,
        dashSize: 0.065, gapSize: 0.055, depthTest: true, depthWrite: false, depthFunc: THREE.LessEqualDepth,
    });
    const hiddenEdgeLines = new THREE.LineSegments(hiddenEdgeGeometry, hiddenEdgeMaterial);
    hiddenEdgeLines.name = 'occluded-room-edges';
    hiddenEdgeLines.computeLineDistances();
    hiddenEdgeLines.renderOrder = 10;
    group.add(hiddenEdgeLines);
    for (let wall = 0; wall < 6; wall++) {
        const [width, height] = wallSize(bounds, wall);
        const solids: THREE.BufferGeometry[] = [], fills: THREE.BufferGeometry[] = [], tubes: THREE.BufferGeometry[] = [];
        const opening: Point2[] = [];
        for (let u = 0; u < width; u++) for (let v = 0; v < height; v++) {
            const key = exitKey(wall, u, v);
            const plane = wallPlane(bounds, wall, u, v);
            if (!exitCells.has(key)) { solidCells.add(key); solids.push(plane); continue; }
            fills.push(plane); opening.push({ u, v });
            // Only the actual contour, not internal seams between opening cells.
            for (const [du, dv] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                if (exitCells.has(exitKey(wall, u + du, v + dv))) continue;
                const centerU = u + du * 0.5, centerV = v + dv * 0.5;
                const start = wallPoint(bounds, wall, centerU - (dv ? 0.5 : 0), centerV - (du ? 0.5 : 0));
                const end = wallPoint(bounds, wall, centerU + (dv ? 0.5 : 0), centerV + (du ? 0.5 : 0));
                const tube = new THREE.CylinderGeometry(0.015, 0.015, 1, 8);
                const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
                tube.applyQuaternion(rotation); tube.translate(...start.add(end).multiplyScalar(0.5).toArray());
                tubes.push(tube);
            }
        }
        if (solids.length) {
            const mesh = new THREE.Mesh(mergeAndDispose(solids), wallMaterial);
            mesh.receiveShadow = true;
            // Cutaway walls receive illumination but do not seal the room from the studio key light.
            group.add(mesh); occluders.push(mesh);
        }
        if (fills.length) {
            const fill = new THREE.Mesh(mergeAndDispose(fills), fillMaterial);
            fill.renderOrder = 1; group.add(fill);
        }
        if (tubes.length) group.add(new THREE.Mesh(mergeAndDispose(tubes), edgeMaterial));
        for (const region of connectedRegions(opening)) {
            const a = aperture(region);
            const center = wallPoint(bounds, wall, a.u, a.v);
            const n = FACE_FRAMES[wall].normal;
            const normal = new THREE.Vector3(n.x, n.y, n.z);
            const distance = 4;
            const light = new THREE.SpotLight(0x63b7ef, 5, Math.hypot(bounds.x, bounds.y, bounds.z) + distance + 2,
                Math.atan(a.radius / distance), 0.65, 2);
            light.position.copy(center).addScaledVector(normal, distance);
            light.target.position.copy(center).addScaledVector(normal, -1);
            light.castShadow = true;
            light.shadow.mapSize.set(512, 512);
            light.shadow.camera.near = 0.1;
            light.shadow.bias = -0.00015; light.shadow.normalBias = 0.015;
            group.add(light, light.target); lights.push(light);
        }
    }
    // Dispose materials that an unusual all-open/all-closed room did not use.
    if (!solidCells.size) { wallMaterial.map!.dispose(); wallMaterial.dispose(); }
    if (!exitCells.size) { fillMaterial.dispose(); edgeMaterial.dispose(); }
    scene.add(group);
    return { group, solidCells, lights, occluders };
}

export function hasWallCell(room: WallMeshData, wall: number, u: number, v: number): boolean {
    return room.solidCells.has(exitKey(wall, u, v));
}
