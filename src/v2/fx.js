// Pooled particles for the realistic version: tyre spray, skid smoke, sparks.
// Two draw calls in total, no allocation after startup.
import * as THREE from 'three';
import { createGlowTexture } from './textures.js';

const vertexShader = /* glsl */`
    attribute vec4 tint;
    attribute float size;
    uniform float scale;
    varying vec4 vTint;
    void main() {
        vTint = tint;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(0.1, -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;
const fragmentShader = /* glsl */`
    uniform sampler2D map;
    varying vec4 vTint;
    void main() {
        float alpha = texture2D(map, gl_PointCoord).a * vTint.a;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(vTint.rgb, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

function createSystem(scene, map, count, additive) {
    const positions = new Float32Array(count * 3);
    const tints = new Float32Array(count * 4);
    const sizes = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
        uniforms: { map: { value: map }, scale: { value: 600 } },
        vertexShader, fragmentShader,
        transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 3;
    scene.add(points);

    const velocity = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const maxLife = new Float32Array(count);
    const baseAlpha = new Float32Array(count);
    const growth = new Float32Array(count);
    const gravity = new Float32Array(count);
    let cursor = 0;
    let alive = 0;

    function emit(x, y, z, vx, vy, vz, options) {
        const i = cursor;
        cursor = (cursor + 1) % count;
        positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
        velocity[i * 3] = vx; velocity[i * 3 + 1] = vy; velocity[i * 3 + 2] = vz;
        life[i] = maxLife[i] = options.life;
        tints[i * 4] = options.r; tints[i * 4 + 1] = options.g; tints[i * 4 + 2] = options.b;
        baseAlpha[i] = options.alpha;
        sizes[i] = options.size;
        growth[i] = options.growth || 0;
        gravity[i] = options.gravity;
        alive = Math.max(alive, 1);
    }

    function update(dt, scale) {
        material.uniforms.scale.value = scale;
        if (!alive) return;
        alive = 0;
        for (let i = 0; i < count; i++) {
            if (life[i] <= 0) continue;
            life[i] -= dt;
            if (life[i] <= 0) {
                tints[i * 4 + 3] = 0;
                sizes[i] = 0;
                continue;
            }
            alive++;
            velocity[i * 3 + 1] += gravity[i] * dt;
            positions[i * 3] += velocity[i * 3] * dt;
            positions[i * 3 + 1] += velocity[i * 3 + 1] * dt;
            positions[i * 3 + 2] += velocity[i * 3 + 2] * dt;
            if (positions[i * 3 + 1] < 0.02) {
                positions[i * 3 + 1] = 0.02;
                velocity[i * 3 + 1] *= -0.3;
            }
            const t = life[i] / maxLife[i];
            tints[i * 4 + 3] = baseAlpha[i] * Math.min(1, t * 2.2);
            sizes[i] += growth[i] * dt;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.tint.needsUpdate = true;
        geometry.attributes.size.needsUpdate = true;
    }

    function clear() {
        life.fill(0);
        sizes.fill(0);
        for (let i = 0; i < count; i++) tints[i * 4 + 3] = 0;
        geometry.attributes.tint.needsUpdate = true;
        geometry.attributes.size.needsUpdate = true;
        alive = 0;
    }

    return { emit, update, clear };
}

export function createFx({ scene, mobile }) {
    const map = createGlowTexture();
    const soft = createSystem(scene, map, mobile ? 110 : 220, false);
    const sparks = createSystem(scene, map, mobile ? 140 : 260, true);
    const rand = (min, max) => min + Math.random() * (max - min);
    let sprayDebt = 0;

    // Water lifted by a tyre. `bikeVelocity` is in world units per second;
    // droplets keep most of it so the plume trails just behind the wheel.
    function spray(point, bikeVelocity, amount, dt) {
        sprayDebt += amount * dt;
        while (sprayDebt >= 1) {
            sprayDebt -= 1;
            const drift = -Math.min(0.12, 9 / (bikeVelocity.length() || 1));
            soft.emit(
                point.x + rand(-0.12, 0.12), 0.06, point.z + rand(-0.1, 0.1),
                bikeVelocity.x * (1 + drift) + rand(-1.3, 1.3),
                rand(1.2, 3.6),
                bikeVelocity.z * (1 + drift * rand(0.6, 1.4)),
                { life: rand(0.35, 0.7), r: 0.78, g: 0.83, b: 0.9, alpha: rand(0.1, 0.22), size: rand(0.16, 0.3), growth: 0.9, gravity: -7 }
            );
        }
    }

    function smoke(point, bikeVelocity) {
        soft.emit(
            point.x + rand(-0.25, 0.25), 0.3, point.z + rand(-0.3, 0.3),
            bikeVelocity.x * 0.55 + rand(-0.8, 0.8), rand(0.6, 1.6), bikeVelocity.z * 0.55,
            { life: rand(0.9, 1.5), r: 0.72, g: 0.72, b: 0.74, alpha: 0.34, size: rand(0.6, 0.9), growth: 1.6, gravity: 0.5 }
        );
    }

    function spark(point, bikeVelocity, count = 1) {
        for (let i = 0; i < count; i++) {
            sparks.emit(
                point.x + rand(-0.12, 0.12), point.y + rand(0, 0.08), point.z + rand(-0.12, 0.12),
                bikeVelocity.x * 0.82 + rand(-2.6, 2.6), rand(1, 4.2), bikeVelocity.z * 0.82 + rand(-2, 2),
                { life: rand(0.2, 0.55), r: 1, g: rand(0.55, 0.85), b: 0.25, alpha: 1, size: rand(0.07, 0.14), growth: -0.1, gravity: -11 }
            );
        }
    }

    // Boost flames out of the exhaust: hot core, orange tongue, trailing back.
    function flame(point, backX, backZ, vehicleVelocity, amount = 4) {
        for (let i = 0; i < amount; i++) {
            const push = rand(5, 10);
            const core = Math.random() < 0.35;
            sparks.emit(
                point.x + rand(-0.06, 0.06), point.y + rand(-0.04, 0.04), point.z + rand(-0.06, 0.06),
                vehicleVelocity.x * 0.92 + backX * push + rand(-0.6, 0.6), rand(0.2, 1.4), vehicleVelocity.z * 0.92 + backZ * push + rand(-0.6, 0.6),
                core
                    ? { life: rand(0.06, 0.12), r: 1, g: 0.92, b: 0.6, alpha: 1, size: rand(0.25, 0.4), growth: 0.6, gravity: 2 }
                    : { life: rand(0.12, 0.26), r: 1, g: rand(0.35, 0.6), b: 0.08, alpha: 0.9, size: rand(0.35, 0.6), growth: 1.4, gravity: 3 }
            );
        }
    }

    function update(dt, camera, viewportHeight) {
        const scale = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
        soft.update(dt, scale);
        sparks.update(dt, scale);
    }

    function clear() {
        soft.clear();
        sparks.clear();
        sprayDebt = 0;
    }

    return { spray, smoke, spark, flame, update, clear };
}
