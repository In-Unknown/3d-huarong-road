import * as THREE from 'three';

/** Room walls and immovable blocks are the same surface, with independent ownership. */
export function createWallMaterial(side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#303943'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#505c69'; ctx.lineWidth = 1.5; ctx.strokeRect(0, 0, 128, 128);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map, side, roughness: 1, metalness: 0 });
}
