import { test, expect } from '@playwright/test';

async function load(page) {
    await page.goto('/');
    await page.evaluate(async () => { window.game = await import('/src/main.ts'); });
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForFunction(() => window.game.renderer.info.render.frame > 0);
}
async function settled(page) { await page.waitForFunction(() => window.game.gameState.phase !== 'animating'); }
async function aim(page, id, direction) {
    await page.evaluate(({ id, direction }) => {
        const g = window.game, block = g.gameState.logic.blocks.find(b => b.id === id);
        // Test-only close inspection may target a corner beyond the normal pan limit.
        g.controls.maxTargetRadius = Infinity;
        const axis = direction[1], sign = direction[0] === '+' ? 1 : -1;
        const front = block.cells.reduce((a, b) => (b[axis] - a[axis]) * sign > 0 ? b : a);
        const p = { x: block.position.x + front.x, y: block.position.y + front.y, z: block.position.z + front.z };
        g.camera.up.set(0, 1, 0); g.controls.target.set(p.x, p.y, p.z);
        g.camera.position.set(p.x + (axis === 'x' ? sign * 20 : 0.01), p.y + (axis === 'y' ? sign * 20 : 0.01), p.z + (axis === 'z' ? sign * 20 : 0.01));
        g.controls.update(); g.camera.updateMatrixWorld(true); g.scene.updateMatrixWorld(true);
    }, { id, direction });
    const box = await page.locator('canvas').boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function click(page, point, shift = false) {
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(point.x, point.y);
    if (shift) await page.keyboard.up('Shift');
}
async function move(page, id, direction, count = 1) {
    await page.evaluate(({ id, direction }) => { window.game.select(id); window.game.requestMove(direction); }, { id, direction });
    await settled(page);
    for (let i = 1; i < count; i++) { await page.evaluate(d => window.game.requestMove(d), direction); await settled(page); }
}

test('scene boots without runtime errors and uses bounded, correctly encoded resources', async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await load(page);
    const state = await page.evaluate(() => {
        const g = window.game, maps = [], points = [], inside = [];
        g.scene.traverse(o => {
            if (o.isPointLight) points.push(o.id);
            if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.map) maps.push(m.map.colorSpace);
        });
        for (const light of g.room.lights) for (const block of g.gameState.logic.blocks) for (const c of block.cells) {
            if (['x', 'y', 'z'].every(k => Math.abs(light.position[k] - block.position[k] - c[k]) < 0.5)) inside.push(block.id);
        }
        const hiddenEdges = g.room.group.getObjectByName('occluded-room-edges');
        g.renderer.info.autoReset = false; g.renderer.info.reset(); g.renderer.shadowMap.needsUpdate = true; g.composer.render();
        const fullCalls = g.renderer.info.render.calls;
        g.renderer.info.reset(); g.composer.render(); const idleCalls = g.renderer.info.render.calls;
        g.renderer.info.autoReset = true;
        return { maps, points, inside, allShadows: g.room.lights.every(l => l.castShadow), fullCalls, idleCalls,
            textureCount: g.renderer.info.memory.textures, samples: g.composer.renderTarget1.samples,
            holeIsWall: g.room.solidCells.has('0,1,1'), solidIsWall: g.room.solidCells.has('0,0,0'),
            passes: g.composer.passes.map(p => p.constructor.name), hiddenRoomEdges: hiddenEdges && {
                segments: hiddenEdges.geometry.attributes.position.count / 2,
                dashed: hiddenEdges.material.isLineDashedMaterial,
                vacantOnly: hiddenEdges.material.depthFunc === 3,
                depthWrite: hiddenEdges.material.depthWrite,
                lineDistances: hiddenEdges.geometry.attributes.lineDistance.count,
            } };
    });
    expect(errors).toEqual([]); expect(state.points).toEqual([]); expect(state.inside).toEqual([]);
    expect(state.maps.every(c => c === 'srgb')).toBe(true); expect(state.allShadows).toBe(true);
    expect(state.samples).toBe(4); expect(state.holeIsWall).toBe(false); expect(state.solidIsWall).toBe(true);
    expect(state.hiddenRoomEdges).toEqual({ segments: 12, dashed: true, vacantOnly: true, depthWrite: false, lineDistances: 24 });
    expect(state.fullCalls).toBeLessThan(200); expect(state.idleCalls).toBeLessThan(90);
    expect(state.textureCount).toBeLessThan(40); expect(state.passes).toEqual(['RenderPass', 'UnrealBloomPass', 'OutputPass', 'ShaderPass']);
    await info.attach('render-budget', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('initial.png') });
});

test('initial view and shadow camera contain all corners, including portrait and DPR changes', async ({ page }, info) => {
    await load(page);
    for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 1600, height: 600 }]) {
        await page.setViewportSize(size);
        await page.waitForTimeout(100);
        const result = await page.evaluate(async () => {
            const g = window.game, { Vector3 } = await import('/tests/browser/three.ts');
            g.resize(); g.camera.updateMatrixWorld(); g.dirLight.shadow.updateMatrices(g.dirLight);
            const view = [], shadow = [];
            for (const x of [-0.5, 9.5]) for (const y of [-0.5, 4.5]) for (const z of [-0.5, 4.5]) {
                view.push(new Vector3(x, y, z).project(g.camera).toArray());
                shadow.push(new Vector3(x, y, z).project(g.dirLight.shadow.camera).toArray());
            }
            Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true }); g.resize();
            const target = g.composer.renderTarget1;
            return { view, shadow, buffer: [target.width, target.height], canvas: [g.renderer.domElement.width, g.renderer.domElement.height], ratio: g.renderer.getPixelRatio() };
        });
        expect(result.view.every(p => p.every(n => n >= -1.001 && n <= 1.001))).toBe(true);
        expect(result.shadow.every(p => p.every(n => n >= -1.001 && n <= 1.001))).toBe(true);
        expect(result.ratio).toBeLessThanOrEqual(1.75);
        expect(result.canvas[0]).toBe(Math.floor(result.buffer[0])); expect(result.canvas[1]).toBe(Math.floor(result.buffer[1]));
        if (size.width === 390) await page.screenshot({ path: info.outputPath('portrait.png') });
    }
});

test('real Shift clicks finish partial exits; defeat is recoverable and restart resets the template', async ({ page }) => {
    await load(page);
    let point = await aim(page, 'target1', '-x');
    await click(page, point); await click(page, point); await settled(page);
    expect(await page.evaluate(() => window.game.gameState.logic.blocks.find(b => b.id === 'target1').position.x)).toBe(-1);
    point = await aim(page, 'target1', '-x'); await click(page, point, true); await settled(page);
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'lost');
    await expect(page.locator('#feedback')).toContainText('游戏失败');
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#result-title')).toHaveText('游戏失败');
    await page.getByRole('button', { name: '重新开始' }).click();
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
    expect(await page.evaluate(() => window.game.gameState.logic.blocks.length)).toBe(10);
    expect(await page.evaluate(() => window.game.gameState.logic.blocks.find(b => b.id === 'target1').position.x)).toBe(0);
    point = await aim(page, 'obs2', '+z'); await click(page, point);
    for (let i = 0; i < 2; i++) { await click(page, point); await settled(page); point = await aim(page, 'obs2', '+z'); }
    expect(await page.evaluate(() => window.game.gameState.logic.blocks.find(b => b.id === 'obs2').position.z)).toBe(4);
    await click(page, point, true); await settled(page);
    expect(await page.evaluate(() => window.game.gameState.logic.blocks.some(b => b.id === 'obs2'))).toBe(false);
});

test('returning drags, blank clicks and escape have distinct selection behavior', async ({ page }) => {
    await load(page); const p = await aim(page, 'target2', '-x');
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move(p.x + 110, p.y, { steps: 8 }); await page.mouse.move(p.x, p.y, { steps: 8 }); await page.mouse.up();
    expect(await page.evaluate(() => window.game.gameState.selectedBlockId)).toBeNull();
    const p2 = await aim(page, 'target2', '-x'); await click(page, p2);
    expect(await page.evaluate(() => window.game.gameState.selectedBlockId)).toBe('target2');
    expect(await page.evaluate(() => {
        const d = window.game.gameState.blockMeshes.get('target2');
        return { color: d.edges.material.color.getHex(), opacity: d.edges.material.opacity, order: d.edges.renderOrder };
    })).toEqual({ color: 0x00ffff, opacity: 1, order: 1000 });
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.game.gameState.selectedBlockId)).toBeNull();
    expect(await page.evaluate(() => {
        const d = window.game.gameState.blockMeshes.get('target2');
        return { color: d.edges.material.color.getHex(), opacity: d.edges.material.opacity, order: d.edges.renderOrder };
    })).toEqual({ color: 0xadc1cf, opacity: 0.28, order: 10 });
    await click(page, p2);
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + 2, box.y + 2);
    expect(await page.evaluate(() => window.game.gameState.selectedBlockId)).toBeNull();
});

test('hover respects occluders, updates after clicking, and clears on leaving', async ({ page }) => {
    await load(page);
    const p = await aim(page, 'target2', '-x'); await click(page, p);
    await page.waitForFunction(() => window.game.gameState.blockMeshes.get('target2').hoveredFace !== null);
    await page.mouse.move(3, 3);
    await page.waitForFunction(() => window.game.gameState.blockMeshes.get('target2').hoveredFace === null);
    await page.getByRole('button', { name: '复位视角' }).click();
    const hidden = await page.evaluate(async () => {
        const g = window.game, { Raycaster, Vector2 } = await import('/tests/browser/three.ts');
        g.select('target1'); const rect = g.renderer.domElement.getBoundingClientRect();
        g.scene.updateMatrixWorld(true); g.camera.updateMatrixWorld(true);
        const ray = new Raycaster();
        for (let y = 5; y < rect.height; y += 8) for (let x = 5; x < rect.width; x += 8) {
            ray.setFromCamera(new Vector2(x / rect.width * 2 - 1, -y / rect.height * 2 + 1), g.camera);
            const own = ray.intersectObject(g.gameState.blockMeshes.get('target1').body)[0];
            const hit = g.pick(rect.x + x, rect.y + y);
            if (own && hit && hit.object.userData.id !== 'target1') return { x: rect.x + x, y: rect.y + y };
        }
        return null;
    });
    expect(hidden).not.toBeNull(); await page.mouse.move(hidden.x, hidden.y);
    expect(await page.evaluate(() => window.game.gameState.blockMeshes.get('target1').hoveredFace)).toBeNull();
});

test('restart cancels both bump feedback and an actual move in flight', async ({ page }) => {
    await load(page);
    for (const [id, direction, maximum] of [['obs1', '+x', false], ['target2', '+x', true]]) {
        const active = await page.evaluate(({ id, direction, maximum }) => {
            const g = window.game; g.select(id); g.requestMove(direction, maximum);
            return g.gameState.phase;
        }, { id, direction, maximum });
        expect(active).toBe('animating');
        await page.getByRole('button', { name: '重新开始' }).click();
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => ({
            position: window.game.gameState.blockMeshes.get('target2').group.position.toArray(),
            moves: window.game.gameState.moves, phase: window.game.gameState.phase,
        }))).toEqual({ position: [0, 0, 0], moves: 0, phase: 'playing' });
    }
});

test('forbidden directions and physical collisions bump back without committing a move', async ({ page }) => {
    await page.clock.install();
    await load(page);
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    for (const [id, direction, axis] of [['obs2', '+x', 'x'], ['target2', '-x', 'x']]) {
        const before = await page.evaluate(({ id, direction }) => {
            const g = window.game; g.select(id);
            const position = structuredClone(g.gameState.logic.blocks.find(b => b.id === id).position);
            return { position, moves: g.gameState.moves, accepted: g.requestMove(direction) };
        }, { id, direction });
        expect(before.accepted).toBe(false);
        const offsets = [];
        for (let i = 0; i < 6; i++) {
            await page.clock.runFor(30);
            offsets.push(await page.evaluate(({ id, axis, origin }) =>
                window.game.gameState.blockMeshes.get(id).group.position[axis] - origin,
                { id, axis, origin: before.position[axis] }));
        }
        expect(offsets.some(n => direction[0] === '+' ? n > 0.02 : n < -0.02)).toBe(true);
        expect(offsets.every(n => Math.abs(n) <= 0.201)).toBe(true);
        const after = await page.evaluate(id => ({
            position: window.game.gameState.logic.blocks.find(b => b.id === id).position,
            rendered: window.game.gameState.blockMeshes.get(id).group.position.toArray(),
            moves: window.game.gameState.moves, phase: window.game.gameState.phase,
        }), id);
        expect(after.position).toEqual(before.position);
        expect(after.rendered).toEqual([before.position.x, before.position.y, before.position.z]);
        expect(after.moves).toBe(before.moves); expect(after.phase).toBe('playing');
    }
});

test('an exited movable block flies outward at full size before disposal', async ({ page }) => {
    await load(page);
    const samples = await page.evaluate(async () => {
        const g = window.game; g.select('obs2'); g.requestMove('+z', true);
        const data = g.gameState.blockMeshes.get('obs2'), flight = [];
        await new Promise(resolve => {
            const sample = () => {
                if (data.group.position.z > 5) flight.push({ z: data.group.position.z, scale: data.group.scale.x });
                if (g.gameState.phase === 'animating') requestAnimationFrame(sample); else resolve();
            };
            requestAnimationFrame(sample);
        });
        return { flight, removed: !g.gameState.blockMeshes.has('obs2') };
    });
    expect(samples.flight.some(p => p.z > 6)).toBe(true);
    expect(samples.flight.every(p => p.scale === 1)).toBe(true);
    expect(samples.removed).toBe(true);
});

test('complete game reaches one stable won state through the animation pipeline', async ({ page }) => {
    await load(page);
    for (const [id, dir, n] of [['obs1', '+y', 2], ['target1', '+x', 3], ['target2', '+x', 4], ['target2', '+z', 4],
        ['exit1', '-x', 2], ['exit1', '+y', 3], ['exit2', '+x', 3], ['exit2', '-y', 3], ['exit2', '-z', 1]]) await move(page, id, dir, n);
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'won');
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#result-title')).toHaveText('全部目标达成！');
    await page.getByRole('button', { name: '查看棋盘' }).click();
    const before = await page.locator('#feedback').textContent();
    const accepted = await page.evaluate(() => { window.game.select('obs4'); return window.game.requestMove('+x'); });
    expect(accepted).toBe(false); expect(await page.locator('#feedback').textContent()).toBe(before);
    expect(await page.evaluate(() => window.game.gameState.moves)).toBe(25);
});

test('exits dispose resources and repeated restarts converge to the same GPU budget', async ({ page }) => {
    await load(page);
    const initial = await page.evaluate(() => ({ ...window.game.renderer.info.memory }));
    await page.evaluate(() => {
        const data = window.game.gameState.blockMeshes.get('obs2'); window.disposals = [];
        data.body.geometry.addEventListener('dispose', () => window.disposals.push('body'));
        data.edges.geometry.addEventListener('dispose', () => window.disposals.push('edge'));
        data.materials[0].addEventListener('dispose', () => window.disposals.push('material'));
        window.game.select('obs2'); window.game.requestMove('+z', true);
    });
    await settled(page);
    expect(await page.evaluate(() => window.disposals.sort())).toEqual(['body', 'edge', 'material']);
    expect(await page.evaluate(() => window.game.renderer.info.memory.geometries)).toBeLessThan(initial.geometries);
    const budgets = [];
    for (let i = 0; i < 5; i++) {
        const frame = await page.evaluate(() => window.game.renderer.info.render.frame);
        await page.getByRole('button', { name: '重新开始' }).click();
        await page.waitForFunction(before => window.game.renderer.info.render.frame > before, frame);
        budgets.push(await page.evaluate(() => ({ ...window.game.renderer.info.memory })));
    }
    expect(budgets.every(b => b.geometries === budgets[0].geometries && b.textures === budgets[0].textures)).toBe(true);
});

test('touch gestures cannot commit accidental moves and graphics context can recover', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Native multi-touch and context-loss injection use Chromium CDP.');
    await load(page); const p = await aim(page, 'target2', '-x');
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }, { x: p.x + 50, y: p.y, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x - 20, y: p.y, id: 1 }, { x: p.x + 70, y: p.y, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await page.evaluate(() => window.game.gameState.selectedBlockId)).toBeNull();
    expect(await page.evaluate(() => window.game.gameState.moves)).toBe(0);
    const environmentBefore = await page.evaluate(() => window.game.scene.environment.uuid);
    await page.evaluate(() => { window.lose = window.game.renderer.getContext().getExtension('WEBGL_lose_context'); window.lose.loseContext(); });
    await expect(page.locator('#feedback')).toContainText('图形暂时中断');
    await page.evaluate(() => window.lose.restoreContext());
    await expect(page.locator('#feedback')).toContainText('画面已恢复');
    await page.waitForFunction(() => window.game.renderer.info.render.frame > 0 && window.game.renderer.info.memory.textures > 0);
    expect(await page.evaluate(() => window.game.scene.environment.uuid)).not.toBe(environmentBefore);
    expect(await page.evaluate(() => window.game.gameState.logic.blocks.length)).toBe(10);
});

test('fixed blocks and room walls render the same pigment under identical lighting', async ({ page }) => {
    await load(page);
    const samples = await page.evaluate(async () => {
        const T = await import('/tests/browser/three.ts'), g = window.game;
        const fixed = [...g.gameState.blockMeshes.values()].find(d => d.body.userData.blockType === 'wall');
        const scene = new T.Scene();
        scene.environment = g.scene.environment; scene.environmentIntensity = g.scene.environmentIntensity;
        const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera.position.z = 2;
        const target = new T.WebGLRenderTarget(32, 32), previous = g.renderer.getRenderTarget();
        const geometry = new T.PlaneGeometry(2, 2);
        geometry.setAttribute('hoverEmission', new T.Float32BufferAttribute(new Float32Array(12), 3));
        geometry.setAttribute('color', new T.Float32BufferAttribute(fixed.baseColors.slice(0, 12), 3));
        const mesh = new T.Mesh(geometry, fixed.body.material); scene.add(mesh);
        const read = () => {
            g.renderer.setRenderTarget(target); g.renderer.render(scene, camera);
            const pixel = new Uint8Array(4); g.renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
            return [...pixel];
        };
        try {
            const block = read();
            mesh.material = g.room.occluders[0].material;
            mesh.rotation.y = Math.PI; // BackSide wall, same visible normal as the block.
            const wall = read();
            return { block, wall };
        } finally {
            g.renderer.setRenderTarget(previous); geometry.dispose(); target.dispose();
        }
    });
    expect(samples.block[3]).toBe(255);
    expect(samples.block.slice(0, 3).some(v => v > 0)).toBe(true);
    samples.block.forEach((v, i) => expect(Math.abs(v - samples.wall[i])).toBeLessThanOrEqual(1));
});

test('camera framing survives resizing and DPR changes after manual navigation', async ({ page }) => {
    await load(page);
    const rect = await page.locator('canvas').boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.wheel(0, -120);
    const before = await page.evaluate(() => ({ p: window.game.camera.position.toArray(), t: window.game.controls.target.toArray() }));
    await page.setViewportSize({ width: 900, height: 750 });
    await page.evaluate(() => { Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true }); window.game.resize(); });
    const after = await page.evaluate(() => ({ p: window.game.camera.position.toArray(), t: window.game.controls.target.toArray() }));
    expect(after).toEqual(before);
    await page.getByRole('button', { name: '复位视角' }).click();
    expect(await page.evaluate(() => window.game.camera.position.toArray())).not.toEqual(before.p);
});

test('wheel zoom enters the room without snapping back and remains reversible', async ({ page }) => {
    await page.route('**/src/data.ts*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(/allowInteriorView: (true|false)/, 'allowInteriorView: true') });
    });
    await load(page);
    const rect = await page.locator('canvas').boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const distances = [];
    for (let i = 0; i < 24; i++) {
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(60);
        distances.push(await page.evaluate(() => window.game.camera.position.distanceTo(window.game.controls.target)));
    }
    for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeLessThanOrEqual(distances[i - 1] + 0.000001);
    expect(await page.evaluate(() => {
        const g = window.game;
        return ['x', 'y', 'z'].every(axis => g.camera.position[axis] > -0.5 && g.camera.position[axis] < g.gameState.logic.bounds[axis] - 0.5);
    })).toBe(true);
    await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 50, rect.y + rect.height / 2 + 20, { steps: 5 }); await page.mouse.up();
    const rotated = await page.evaluate(() => window.game.camera.position.distanceTo(window.game.controls.target));
    expect(rotated).toBeCloseTo(distances.at(-1), 5);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.game.camera.position.distanceTo(window.game.controls.target))).toBeGreaterThan(rotated);
    await page.getByRole('button', { name: '复位视角' }).click();
    expect(await page.evaluate(() => window.game.camera.position.distanceTo(window.game.controls.target))).toBeGreaterThan(distances[0]);
    expect(await page.evaluate(() => window.game.gameState.moves)).toBe(0);
});

test('an exterior-only level stops wheel zoom and rotation at contact without a rebound', async ({ page }) => {
    // Load the other level configuration before app initialization, without changing repo data.
    await page.route('**/src/data.ts*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(/allowInteriorView: (true|false)/, 'allowInteriorView: false') });
    });
    await load(page);
    const rect = await page.locator('canvas').boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const distances = [];
    for (let i = 0; i < 24; i++) {
        await page.mouse.wheel(0, -300); await page.waitForTimeout(60);
        distances.push(await page.evaluate(() => window.game.camera.position.distanceTo(window.game.controls.target)));
    }
    for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeLessThanOrEqual(distances[i - 1] + 0.000001);
    expect(distances.at(-1)).toBeGreaterThan(2);
    expect(distances.at(-1)).toBeCloseTo(distances.at(-4), 5);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.game.camera.position.distanceTo(window.game.controls.target))).toBeGreaterThan(distances.at(-1));
    const rotation = await page.evaluate(() => {
        const g = window.game;
        g.controls.target.set(4.5, 2, 2); g.camera.position.set(4.5, 2, 5); g.controls.update();
        const startRadius = g.controls.getDistance();
        g.controls.rotateLeft(Math.PI);
        const first = g.camera.position.toArray(), radius = g.controls.getDistance();
        g.controls.rotateLeft(0.1);
        const blocked = g.camera.position.toArray();
        g.controls.rotateLeft(-0.1);
        return { first, blocked, radius, startRadius, reversed: g.camera.position.toArray() };
    });
    expect(rotation.first[2]).toBeGreaterThanOrEqual(4.6);
    expect(rotation.first[2]).toBeLessThan(4.60001);
    expect(rotation.radius).toBeCloseTo(rotation.startRadius, 6);
    rotation.blocked.forEach((n, i) => expect(n).toBeCloseTo(rotation.first[i], 5));
    expect(rotation.reversed[2]).toBeGreaterThan(rotation.first[2]);
});

test('selected targets remain legible behind blocks and hovered faces emit light', async ({ page }) => {
    await load(page);
    const p = await aim(page, 'target2', '-x'); await click(page, p);
    await page.waitForFunction(() => window.game.gameState.blockMeshes.get('target2').hoveredFace !== null);
    const result = await page.evaluate(() => {
        const data = window.game.gameState.blockMeshes.get('target2');
        return { ghost: data.ghost.visible, lines: data.ghost.children.map(l => ({ color: l.material.color.getHex(), opacity: l.material.opacity, depthWrite: l.material.depthWrite })),
            emission: Array.from(data.body.geometry.getAttribute('hoverEmission').array) };
    });
    expect(result.ghost).toBe(true);
    expect(result.lines.every(l => l.color === 0x00ff00 && l.opacity >= 0.8 && !l.depthWrite)).toBe(true);
    expect(result.emission.some(n => n > 0)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.game.gameState.blockMeshes.get('target2').ghost.visible)).toBe(false);
    expect(await page.evaluate(() => Array.from(window.game.gameState.blockMeshes.get('target2').body.geometry.getAttribute('hoverEmission').array).every(n => n === 0))).toBe(true);
});
