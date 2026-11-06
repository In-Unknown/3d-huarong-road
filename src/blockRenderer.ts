import * as THREE from 'three';
import type { BlockDef, BlockMeshData } from './types';
import { DIRECTIONS, FACE_FRAMES } from './space';
import { extractSurfaces, arrowStrokes } from './surfaces';
import type { SurfacePatch, Point2 } from './surfaces';
import { mergeAndDispose } from './resources';
import { createWallMaterial } from './wallMaterial';

function pointOnFace(patch: SurfacePatch, p: Point2, offset = 0): THREE.Vector3 {
    const { u, v, normal: n } = FACE_FRAMES[patch.face];
    return new THREE.Vector3(u.x * p.u + v.x * p.v + n.x * (patch.plane + offset),
        u.y * p.u + v.y * p.v + n.y * (patch.plane + offset),
        u.z * p.u + v.z * p.v + n.z * (patch.plane + offset));
}

function surfacePlane(patch: SurfacePatch, cell: Point2): THREE.BufferGeometry {
    const { u, v, normal } = FACE_FRAMES[patch.face];
    const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(u.x, u.y, u.z),
        new THREE.Vector3(v.x, v.y, v.z), new THREE.Vector3(normal.x, normal.y, normal.z));
    matrix.setPosition(pointOnFace(patch, cell));
    return new THREE.PlaneGeometry(1, 1).applyMatrix4(matrix);
}

// Vector strokes, constant world-space width: no giant repeated textures or baked shadows.
function arrowGeometry(patches: SurfacePatch[], block: BlockDef): THREE.BufferGeometry | null {
    const positions: number[] = [];
    for (const patch of patches) {
        for (const { from, to } of arrowStrokes(patch, block.allowedDirs)) {
            const du = to.u - from.u, dv = to.v - from.v, length = Math.hypot(du, dv);
            if (!length) continue;
            const radius = 0.038, angle = Math.atan2(dv, du);
            const contour: Point2[] = [];
            // Capsule polygon keeps connections and arrowhead tips smoothly joined.
            for (let i = 0; i <= 6; i++) {
                const a = angle - Math.PI / 2 + i * Math.PI / 6;
                contour.push({ u: to.u + Math.cos(a) * radius, v: to.v + Math.sin(a) * radius });
            }
            for (let i = 0; i <= 6; i++) {
                const a = angle + Math.PI / 2 + i * Math.PI / 6;
                contour.push({ u: from.u + Math.cos(a) * radius, v: from.v + Math.sin(a) * radius });
            }
            const center = pointOnFace(patch, { u: (from.u + to.u) / 2, v: (from.v + to.v) / 2 }, 0.003);
            for (let i = 0; i < contour.length; i++) {
                const a = pointOnFace(patch, contour[i], 0.003), b = pointOnFace(patch, contour[(i + 1) % contour.length], 0.003);
                positions.push(...center.toArray(), ...a.toArray(), ...b.toArray());
            }
        }
    }
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
}

export function createBlocks(blocks: BlockDef[], scene: THREE.Scene): Map<string, BlockMeshData> {
    const result = new Map<string, BlockMeshData>();
    const colors = { target: 0xc6534d, exit: 0x397dbd, obstacle: 0x99a4b2, wall: 0xffffff };
    for (const block of blocks) {
        const group = new THREE.Group();
        const patches = extractSurfaces(block.cells);
        const material = block.type === 'wall' ? createWallMaterial() : new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.46, metalness: 0,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        });
        const materials = [material];
        const faces = DIRECTIONS.map((_, face) => mergeAndDispose(patches.filter(p => p.face === face).flatMap(p => p.cells.map(c => surfacePlane(p, c)))));
        const geometry = mergeAndDispose(faces, true);
        const baseColors = new Float32Array(geometry.attributes.position.count * 3);
        geometry.groups.forEach((g, face) => {
            const color = new THREE.Color(colors[block.type]);
            // A direction cue must not erase the block's pigment in shadow.
            if (block.type !== 'wall' && !block.allowedDirs.includes(DIRECTIONS[face])) {
                color.multiplyScalar(0.65);
            }
            for (let i = g.start; i < g.start + g.count; i++) color.toArray(baseColors, geometry.index!.getX(i) * 3);
        });
        geometry.setAttribute('color', new THREE.BufferAttribute(baseColors.slice(), 3));
        geometry.setAttribute('hoverEmission', new THREE.Float32BufferAttribute(new Float32Array(baseColors.length), 3));
        // Per-face emission preserves the original hover cue without six material draws.
        materials[0].onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader.replace('#include <common>',
                '#include <common>\nattribute vec3 hoverEmission;\nvarying vec3 vHoverEmission;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHoverEmission = hoverEmission;');
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
                '#include <common>\nvarying vec3 vHoverEmission;')
                .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vHoverEmission;');
        };
        // One draw per block, including shadow passes. Groups remain available for face feedback.
        const body = new THREE.Mesh(geometry, materials[0]);
        body.userData.id = block.id;
        body.userData.blockType = block.type;
        body.castShadow = true; body.receiveShadow = true;
        group.add(body);
        // Free blocks intentionally remain unmarked; the selection panel names all six directions.
        if (block.type !== 'wall' && block.allowedDirs.length !== 6) {
            const arrows = arrowGeometry(patches, block);
            if (arrows) {
                const marks = new THREE.Mesh(arrows, new THREE.MeshStandardMaterial({
                    color: 0xe0e5eb, roughness: 0.65, metalness: 0, depthWrite: false,
                }));
                marks.receiveShadow = true;
                marks.name = 'continuous-arrows';
                group.add(marks);
            }
        }
        const edgeGeometry = new THREE.EdgesGeometry(geometry, 1);
        const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({
            color: 0xadc1cf, transparent: true, opacity: 0.28, depthWrite: false,
        }));
        edges.renderOrder = block.type === 'wall' ? 2 : 10;
        if (block.type !== 'wall') group.add(edges);
        // Keep the unused outline owned by the group for deterministic disposal.
        else { edges.visible = false; group.add(edges); }
        group.position.set(block.position.x, block.position.y, block.position.z);
        scene.add(group);
        let ghost: THREE.Group | undefined;
        if (block.type === 'target' && block.targetPosition) {
            ghost = new THREE.Group();
            // The target is a navigation aid: keep it legible even behind other blocks.
            for (const hidden of [true, false]) {
                const line = new THREE.LineSegments(edgeGeometry, new THREE.LineDashedMaterial({
                    color: 0x00ff00, dashSize: 0.2, gapSize: 0.1,
                    transparent: true, opacity: 0.8,
                    depthTest: true, depthWrite: false, depthFunc: hidden ? THREE.GreaterDepth : THREE.LessEqualDepth,
                }));
                line.computeLineDistances(); line.renderOrder = 1001;
                ghost.add(line);
            }
            ghost.position.set(block.targetPosition.x, block.targetPosition.y, block.targetPosition.z);
            ghost.visible = false; scene.add(ghost);
        }
        result.set(block.id, { group, body, materials, edges, ghost, baseColors, hoveredFace: null });
    }
    return result;
}

export function resetHover(blocks: Map<string, BlockMeshData>): void {
    blocks.forEach(d => {
        if (d.hoveredFace === null) return;
        const attribute = d.body.geometry.getAttribute('hoverEmission') as THREE.BufferAttribute;
        attribute.array.fill(0); attribute.needsUpdate = true; d.hoveredFace = null;
    });
}

export function setFaceHover(data: BlockMeshData, face: number, allowed: boolean): void {
    const geometry = data.body.geometry, group = geometry.groups[face];
    const colors = geometry.getAttribute('hoverEmission') as THREE.BufferAttribute;
    const color = new THREE.Color(allowed ? 0x888888 : 0x880000);
    for (let i = group.start; i < group.start + group.count; i++) {
        const vertex = geometry.index!.getX(i);
        colors.setXYZ(vertex, color.r, color.g, color.b);
    }
    colors.needsUpdate = true; data.hoveredFace = face;
}

export function updateSelectionVisuals(blocks: Map<string, BlockMeshData>, selected: string | null): void {
    blocks.forEach((d, id) => {
        const active = id === selected;
        const mat = d.edges.material as THREE.LineBasicMaterial;
        const wall = d.body.userData.blockType === 'wall';
        mat.color.setHex(active ? 0x00ffff : 0xadc1cf); mat.opacity = active ? 1 : 0.28;
        d.edges.renderOrder = active ? 1000 : wall ? 2 : 10;
        if (d.ghost) d.ghost.visible = active;
    });
}
