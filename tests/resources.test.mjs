import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeObjects } from '../src/resources.ts';

test('shared geometry, material and texture are disposed exactly once across ownership roots', () => {
    const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const group = new THREE.Group(), ghost = new THREE.Group(), scene = new THREE.Scene();
    group.add(new THREE.Mesh(geometry, material)); ghost.add(new THREE.Mesh(geometry, material)); scene.add(group, ghost);
    const count = { geometry: 0, material: 0, texture: 0 };
    geometry.addEventListener('dispose', () => count.geometry++);
    material.addEventListener('dispose', () => count.material++);
    texture.addEventListener('dispose', () => count.texture++);
    disposeObjects(group, ghost);
    assert.deepEqual(count, { geometry: 1, material: 1, texture: 1 });
    assert.equal(scene.children.length, 0);
});
