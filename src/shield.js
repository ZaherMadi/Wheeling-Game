// Shields (competitive): now and then a ramp carries one, in a bubble
// floating on the way of its jump. Taking the jump picks it up; it then takes
// one obstacle for the rider (the bubble around the bike bursts).
// Seen only: the server replay knows nothing of obstacles.
import * as THREE from 'three';

export const SHIELD = {
    // Chance that a ramp carries one, once `gapFrames` have gone by since
    // the last one appeared (and `afterBreakFrames` since one was used).
    chance: 0.35,
    gapFrames: 1200,
    afterBreakFrames: 600,
    // Where the bubble floats: past the lip, on the flight.
    ahead: 7,
    height: 2.9,
    // Size of the bubble on the road (1: a little over a metre across).
    size: 1.5,
    // Frames after the shield took an obstacle during which whatever else
    // is touched in the same instant is taken too.
    grace: 15
};

const BUBBLE_VERTEX = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}`;

// A soap bubble: clear in the middle, bright on the rim, a film of colours
// that drifts, one highlight.
const BUBBLE_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    float rim = pow(1.0 - abs(dot(n, normalize(vView))), 2.2);
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (rim * 1.3 + uTime * 0.08 + vec3(0.0, 0.33, 0.67)));
    vec3 color = mix(uColor, film, 0.35 * rim);
    float spec = pow(max(dot(n, normalize(vec3(-0.45, 0.7, 0.55))), 0.0), 48.0);
    float alpha = (0.06 + 0.85 * rim + spec * 0.8) * uOpacity;
    gl_FragColor = vec4(color + spec, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

function bubbleMaterial(color) {
    return new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uTime: { value: 0 } },
        vertexShader: BUBBLE_VERTEX,
        fragmentShader: BUBBLE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

// A heater shield: flat arched top, sides drawn in to a point.
function shieldShape(scale) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5 * scale, 0.55 * scale);
    shape.quadraticCurveTo(0, 0.68 * scale, 0.5 * scale, 0.55 * scale);
    shape.lineTo(0.5 * scale, 0.05 * scale);
    shape.quadraticCurveTo(0.48 * scale, -0.42 * scale, 0, -0.68 * scale);
    shape.quadraticCurveTo(-0.48 * scale, -0.42 * scale, -0.5 * scale, 0.05 * scale);
    shape.closePath();
    return shape;
}

function starShape(outer, inner) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
        const radius = i % 2 ? inner : outer;
        const angle = Math.PI / 2 + i * Math.PI / 4;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius - 0.02;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
}

// Extruded the same on both sides, so the shield reads from front and back.
function slab(shape, depth, bevel) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.userData.shared = true;
    return geometry;
}

export function createShields(scene) {
    const parts = {
        rim: slab(shieldShape(1), 0.1, 0.03),
        face: slab(shieldShape(0.8), 0.2, 0.02),
        star: slab(starShape(0.27, 0.1), 0.28, 0.01),
        sphere: new THREE.SphereGeometry(1, 28, 20),
        steel: new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.55, roughness: 0.28, emissive: 0x5b6470, emissiveIntensity: 0.35 }),
        blue: new THREE.MeshStandardMaterial({ color: 0x1f6bff, metalness: 0.35, roughness: 0.35, emissive: 0x0b3fd0, emissiveIntensity: 0.55 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.5, roughness: 0.3, emissive: 0xa86a00, emissiveIntensity: 0.5 }),
        bubble: bubbleMaterial(0x8fd8ff)
    };
    parts.sphere.userData.shared = true;

    function shieldModel() {
        const model = new THREE.Group();
        model.add(new THREE.Mesh(parts.rim, parts.steel), new THREE.Mesh(parts.face, parts.blue), new THREE.Mesh(parts.star, parts.gold));
        return model;
    }

    // On the road: the shield turning in its bubble.
    const pickups = [];
    function pickup() {
        const group = new THREE.Group();
        const model = shieldModel();
        const bubble = new THREE.Mesh(parts.sphere, parts.bubble);
        bubble.scale.setScalar(1.12);
        bubble.renderOrder = 3;
        group.add(model, bubble);
        group.scale.setScalar(SHIELD.size);
        group.userData = { model, bubble, taken: false, pop: 0, phase: Math.random() * 6 };
        pickups.push(group);
        return group;
    }

    // Around the bike while it is carried.
    const aura = new THREE.Mesh(parts.sphere, bubbleMaterial(0x7fd0ff));
    aura.renderOrder = 4;
    aura.visible = false;
    aura.frustumCulled = false;
    scene.add(aura);
    const auraState = { on: false, grow: 0, burst: 0 };
    const AURA_SIZE = new THREE.Vector3(1.55, 1.55, 2.35);

    return {
        pickup,
        // Picked up: the bubble bursts, the shield shrinks away.
        take(group) {
            group.userData.taken = true;
            group.userData.pop = 0.0001;
        },
        carry(on) {
            auraState.on = on;
            auraState.burst = 0;
            if (on) auraState.grow = 0;
            else aura.visible = false;
        },
        // The shield took a hit: the bubble around the bike bursts.
        burst() {
            auraState.on = false;
            auraState.burst = 0.0001;
        },
        update(dt, time, bike) {
            parts.bubble.uniforms.uTime.value = time;
            for (let i = pickups.length - 1; i >= 0; i--) {
                const group = pickups[i];
                // Gone with its ramp.
                if (!group.parent || !group.parent.parent) {
                    pickups.splice(i, 1);
                    continue;
                }
                const data = group.userData;
                data.model.rotation.y += dt * 2.4;
                if (data.pop > 0) {
                    data.pop += dt;
                    const t = Math.min(1, data.pop / 0.28);
                    data.bubble.scale.setScalar(1.12 + t * 1.1);
                    data.model.scale.setScalar(Math.max(0.001, 1 - t));
                    if (t >= 1) {
                        group.visible = false;
                        pickups.splice(i, 1);
                    }
                } else {
                    // Floating, the bubble breathing a little.
                    const bob = Math.sin(time * 2.2 + data.phase);
                    data.model.position.y = bob * 0.08;
                    data.bubble.scale.setScalar(1.12 + bob * 0.025);
                }
            }
            const material = aura.material;
            material.uniforms.uTime.value = time;
            if (auraState.on) {
                auraState.grow = Math.min(1, auraState.grow + dt / 0.3);
                const eased = 1 - (1 - auraState.grow) ** 3;
                aura.visible = true;
                aura.scale.copy(AURA_SIZE).multiplyScalar(0.3 + 0.7 * eased);
                material.uniforms.uOpacity.value = 0.75 * eased;
            } else if (auraState.burst > 0) {
                auraState.burst += dt;
                const t = Math.min(1, auraState.burst / 0.35);
                aura.visible = t < 1;
                aura.scale.copy(AURA_SIZE).multiplyScalar(1 + t * 0.9);
                material.uniforms.uOpacity.value = 0.9 * (1 - t);
                if (t >= 1) auraState.burst = 0;
            }
            if (aura.visible && bike) aura.position.set(bike.x, bike.y + 1.1, bike.z);
        }
    };
}
