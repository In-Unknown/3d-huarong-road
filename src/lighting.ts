import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Local studio illumination: no downloaded HDR dependency. Rebuild after context loss. */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    let target: THREE.WebGLRenderTarget | undefined;
    function rebuild(): void {
        scene.environment = null;
        target?.dispose();
        const room = new RoomEnvironment();
        const generator = new THREE.PMREMGenerator(renderer);
        try {
            target = generator.fromScene(room, 0.06);
            scene.environment = target.texture;
            scene.environmentIntensity = 0.35;
        } finally {
            room.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
            room.dispose(); generator.dispose();
        }
    }
    rebuild();
    return { rebuild, dispose() { scene.environment = null; target?.dispose(); target = undefined; } };
}
