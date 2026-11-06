import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeAndDispose(geometries: THREE.BufferGeometry[], groups = false): THREE.BufferGeometry {
    if (!geometries.length) return new THREE.BufferGeometry();
    const result = mergeGeometries(geometries, groups);
    geometries.forEach(g => g.dispose());
    if (!result) throw new Error('无法合并几何体');
    return result;
}

/** One ownership boundary, including shared geometry between body outlines and ghosts. */
export function disposeObjects(...roots: (THREE.Object3D | undefined)[]): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    for (const root of roots) {
        if (!root) continue;
        root.removeFromParent();
        root.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (mesh.geometry) geometries.add(mesh.geometry);
            if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
            if (o instanceof THREE.SpotLight || o instanceof THREE.DirectionalLight) o.dispose();
        });
    }
    for (const m of materials) for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
    textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
}
