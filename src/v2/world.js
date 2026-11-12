// City environment for the realistic version: painted sky, wet road, street
// walls, trees, lamps. Each 100 m block is merged into a handful of meshes and
// recycled from a pool, so nothing is allocated while riding.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    FACADE_STYLES, HORIZON_COLOR, SUN_DIRECTION, mulberry32,
    createBillboardTexture, createFacadeTextures, createGlowTexture, createRoadTextures,
    createShopfrontTexture, createSidewalkTexture, createSkyTexture, createSkylineTexture
} from './textures.js';

const CHUNK_LENGTH = 100;
const ROAD_HALF = 10;
const SIDEWALK_WIDTH = 10;
const CURB_HEIGHT = 0.15;

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const euler = new THREE.Euler();
const tmpColor = new THREE.Color();

function transform(px, py, pz, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    position.set(px, py, pz);
    quaternion.setFromEuler(euler.set(rx, ry, rz));
    scale.set(sx, sy, sz);
    return matrix.compose(position, quaternion, scale);
}

// Collects transformed primitives and merges them into one vertex-coloured
// geometry (one draw call).
class Batch {
    constructor() {
        this.parts = [];
    }

    // shade(y01) -> brightness multiplier, lets blobs fake top lighting.
    add(geometry, mat, color, shade) {
        const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        for (const name of Object.keys(part.attributes)) {
            if (name !== 'position' && name !== 'normal' && name !== 'uv') part.deleteAttribute(name);
        }
        let minY = Infinity;
        let maxY = -Infinity;
        if (shade) {
            const local = part.attributes.position;
            for (let i = 0; i < local.count; i++) {
                minY = Math.min(minY, local.getY(i));
                maxY = Math.max(maxY, local.getY(i));
            }
        }
        const count = part.attributes.position.count;
        const colors = new Float32Array(count * 3);
        tmpColor.set(color);
        for (let i = 0; i < count; i++) {
            const k = shade ? shade((part.attributes.position.getY(i) - minY) / (maxY - minY || 1)) : 1;
            colors[i * 3] = tmpColor.r * k;
            colors[i * 3 + 1] = tmpColor.g * k;
            colors[i * 3 + 2] = tmpColor.b * k;
        }
        part.applyMatrix4(mat);
        part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.parts.push(part);
        return this;
    }

    // Free-form quad a-b-c-d (counter-clockwise seen from the front).
    quad(a, b, c, d, color, uv = [0, 0, 1, 1]) {
        const geometry = new THREE.BufferGeometry();
        const [u0, v0, u1, v1] = uv;
        const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
        const vertices = [a, b, c, a, c, d];
        const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]];
        const positions = new Float32Array(18);
        const normals = new Float32Array(18);
        const uvArray = new Float32Array(12);
        const colors = new Float32Array(18);
        tmpColor.set(color);
        vertices.forEach((vertex, i) => {
            positions.set([vertex.x, vertex.y, vertex.z], i * 3);
            normals.set([normal.x, normal.y, normal.z], i * 3);
            uvArray.set(uvs[i], i * 2);
            colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.parts.push(geometry);
        return this;
    }

    get empty() {
        return this.parts.length === 0;
    }

    build() {
        if (this.empty) return null;
        const merged = mergeGeometries(this.parts, false);
        this.parts.forEach((part) => part.dispose());
        this.parts = [];
        merged.userData.shared = true;
        return merged;
    }
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function createWorld({ scene, renderer, mobile }) {
    const anisotropy = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
    const random = mulberry32(510);
    const range = (min, max) => min + random() * (max - min);
    const pick = (list) => list[Math.floor(random() * list.length)];

    // --- Primitives -------------------------------------------------------
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
    const taper = new THREE.CylinderGeometry(0.72, 1, 1, 7);
    const cone = new THREE.CylinderGeometry(0.18, 1, 1, 10);
    const blob = new THREE.IcosahedronGeometry(1, 1);
    const floor = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const facing = new THREE.PlaneGeometry(1, 1);
    const disc = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);

    // --- Sky, fog, lights -------------------------------------------------
    const skyTexture = createSkyTexture(mobile);
    scene.background = skyTexture;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(skyTexture).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.7;
    const horizon = new THREE.Color(HORIZON_COLOR);
    scene.fog = new THREE.Fog(horizon.clone(), 55, 265);

    const hemisphere = new THREE.HemisphereLight(0xc4d8ff, 0x57483c, 1.25);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffd7ab, 2.6);
    // The painted sun sits low on the horizon; light from a little higher so
    // shadows stay readable instead of stretching across the whole street.
    const lightDirection = new THREE.Vector3(SUN_DIRECTION.x, 0.62, SUN_DIRECTION.z).normalize();
    sun.castShadow = true;
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);

    // --- Materials --------------------------------------------------------
    const glowTexture = createGlowTexture();
    const road = createRoadTextures(mobile, anisotropy);
    road.map.repeat.set(1, CHUNK_LENGTH / 50);
    road.roughnessMap.repeat.set(1, CHUNK_LENGTH / 50);
    const roadMaterial = new THREE.MeshStandardMaterial({
        map: road.map, roughnessMap: road.roughnessMap, roughness: 1, metalness: 0, envMapIntensity: 1.15
    });
    const sidewalkMaterial = new THREE.MeshLambertMaterial({ map: createSidewalkTexture(anisotropy), vertexColors: true });
    const facadeMaterials = FACADE_STYLES.map((style, index) => {
        const textures = createFacadeTextures(style, 300 + index * 17, anisotropy);
        return new THREE.MeshStandardMaterial({
            map: textures.map,
            emissiveMap: textures.emissiveMap,
            emissive: 0xffffff,
            emissiveIntensity: 0.85,
            roughness: style.roughness,
            metalness: 0,
            envMapIntensity: style.envMapIntensity,
            vertexColors: true
        });
    });
    const shopMaterial = new THREE.MeshBasicMaterial({ map: createShopfrontTexture(anisotropy), vertexColors: true });
    const propsMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const emissiveMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const glowMaterial = new THREE.MeshBasicMaterial({
        map: glowTexture, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    // Additive light must fade to nothing in fog, not towards the fog colour.
    glowMaterial.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <fog_fragment>',
            '#ifdef USE_FOG\n gl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );\n#endif'
        );
    };
    const blobShadowMaterial = new THREE.MeshBasicMaterial({
        map: glowTexture, color: 0x05070c, transparent: true, opacity: 0.55, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const billboardMaterials = [
        ['WHEELIE KING', '51 GAMES', ['#1b2a6b', '#e2622a']],
        ['ZONE 51', 'RIDE OR DIE', ['#3b1466', '#d43d6b']],
        ['510 CITY', 'BORN TO RIDE', ['#0d3b4f', '#e0a52a']]
    ].map(([title, subtitle, palette]) =>
        new THREE.MeshBasicMaterial({ map: createBillboardTexture(title, subtitle, palette) }));
    const sharedMaterials = [
        roadMaterial, sidewalkMaterial, ...facadeMaterials, shopMaterial, propsMaterial,
        emissiveMaterial, glowMaterial, blobShadowMaterial, ...billboardMaterials
    ];

    // --- Geometry shared by every block ----------------------------------
    const roadGeometry = new THREE.PlaneGeometry(ROAD_HALF * 2, CHUNK_LENGTH).rotateX(-Math.PI / 2);
    roadGeometry.userData.shared = true;

    const half = CHUNK_LENGTH / 2;
    const sidewalkBatch = new Batch();
    for (const side of [-1, 1]) {
        const inner = side * ROAD_HALF;
        const curbBack = side * (ROAD_HALF + 0.3);
        const outer = side * (ROAD_HALF + SIDEWALK_WIDTH + 3);
        const alongRepeat = CHUNK_LENGTH / 2.5;
        const flip = side < 0;
        const ordered = (a, b, c, d, color, uv) => flip
            ? sidewalkBatch.quad(b, a, d, c, color, uv)
            : sidewalkBatch.quad(a, b, c, d, color, uv);
        // Pavement
        ordered(v3(curbBack, CURB_HEIGHT, half), v3(outer, CURB_HEIGHT, half), v3(outer, CURB_HEIGHT, -half),
            v3(curbBack, CURB_HEIGHT, -half), 0xffffff, [0, 0, (SIDEWALK_WIDTH + 2.7) / 2.5, alongRepeat]);
        // Curb top and face
        ordered(v3(inner, CURB_HEIGHT, half), v3(curbBack, CURB_HEIGHT, half), v3(curbBack, CURB_HEIGHT, -half),
            v3(inner, CURB_HEIGHT, -half), 0xb9bcc4, [0.02, 0, 0.1, alongRepeat * 2]);
        ordered(v3(inner, 0, half), v3(inner, CURB_HEIGHT, half), v3(inner, CURB_HEIGHT, -half),
            v3(inner, 0, -half), 0x8a8d96, [0.02, 0, 0.07, alongRepeat * 2]);
    }
    const sidewalkGeometry = sidewalkBatch.build();

    // --- Block variants ---------------------------------------------------
    const WARM = 0xffb565;

    function addTree(props, shadows, x, z) {
        const pink = random() < 0.3;
        const trunkHeight = range(2.8, 3.6);
        props.add(taper, transform(x, CURB_HEIGHT + trunkHeight / 2, z, 0.2, trunkHeight, 0.2), 0x3b2c22);
        props.add(box, transform(x, CURB_HEIGHT + 0.05, z, 1.5, 0.1, 1.5), 0x2a241f);
        const palette = pink ? [0xe58fb8, 0xf3a9cb, 0xd674a5] : [0x4d9a2f, 0x6fb23a, 0x8cc63f, 0x3f862d];
        const crown = CURB_HEIGHT + trunkHeight + 0.9;
        const blobs = 4 + Math.floor(random() * 2);
        for (let i = 0; i < blobs; i++) {
            const radius = range(1.15, 1.75);
            const angle = (i / blobs) * Math.PI * 2 + random();
            const spread = i === 0 ? 0 : range(0.6, 1.25);
            props.add(
                blob,
                transform(x + Math.cos(angle) * spread, crown + range(-0.3, 1.1), z + Math.sin(angle) * spread,
                    radius, radius * range(0.8, 0.95), radius, random(), random() * 3, 0),
                pick(palette),
                (y) => 0.5 + y * 0.75
            );
        }
        shadows.add(floor, transform(x, CURB_HEIGHT + 0.02, z, 4.8, 1, 4.8), 0xffffff);
    }

    function addStreetlight(props, emissive, glows, side, z) {
        const x = side * (ROAD_HALF + 0.9);
        const headX = side * (ROAD_HALF - 0.9);
        props.add(cylinder, transform(x, CURB_HEIGHT + 3.8, z, 0.09, 7.6, 0.09), 0x1d2026);
        props.add(cylinder, transform(x, CURB_HEIGHT + 0.25, z, 0.16, 0.5, 0.16), 0x1d2026);
        props.add(box, transform((x + headX) / 2, 7.7, z, 2, 0.08, 0.1), 0x1d2026);
        props.add(box, transform(headX, 7.66, z, 0.8, 0.14, 0.34), 0x22252b);
        emissive.add(box, transform(headX, 7.58, z, 0.62, 0.04, 0.24), 0xfff0cf);
        glows.add(facing, transform(headX, 7.5, z + 0.05, 3.4, 3.4, 1), WARM, () => 0.95);
        glows.add(floor, transform(headX, 0.03, z, 11, 1, 11), WARM, () => 0.34);
        // Smeared reflection on the wet tarmac
        glows.add(floor, transform(headX, 0.035, z + 5, 2.4, 1, 30), WARM, () => 0.42);
    }

    function addBench(props, side, z) {
        const x = side * 14.2;
        const wood = 0x7a4a2a;
        for (let i = 0; i < 3; i++) props.add(box, transform(x - side * (i * 0.16 - 0.16), CURB_HEIGHT + 0.5, z, 0.13, 0.05, 1.9), wood);
        for (let i = 0; i < 2; i++) props.add(box, transform(x + side * 0.3, CURB_HEIGHT + 0.72 + i * 0.17, z, 0.05, 0.13, 1.9), wood);
        for (const dz of [-0.8, 0.8]) {
            props.add(box, transform(x, CURB_HEIGHT + 0.25, z + dz, 0.5, 0.5, 0.06), 0x1c1e22);
            props.add(box, transform(x + side * 0.3, CURB_HEIGHT + 0.7, z + dz, 0.06, 0.5, 0.06), 0x1c1e22);
        }
    }

    function addPlanter(props, side, z, length) {
        const x = side * 18.4;
        props.add(box, transform(x, CURB_HEIGHT + 0.32, z, 1, 0.64, length), 0x6d7078);
        const bushes = Math.max(2, Math.round(length / 0.9));
        for (let i = 0; i < bushes; i++) {
            const dz = (i / (bushes - 1) - 0.5) * (length - 0.7);
            props.add(blob, transform(x, CURB_HEIGHT + 0.78, z + dz, 0.55, range(0.4, 0.55), 0.6, 0, random() * 3, 0),
                pick([0x4a8f2c, 0x5fa434, 0x7ab53a]), (y) => 0.55 + y * 0.7);
        }
    }

    function addBusShelter(props, emissive, glows, side, z) {
        const x = side * 12.9;
        const frame = 0x23262c;
        props.add(box, transform(x, CURB_HEIGHT + 2.55, z, 1.7, 0.1, 4.2), frame);
        for (const dz of [-2, 2]) props.add(box, transform(x + side * 0.75, CURB_HEIGHT + 1.27, z + dz, 0.08, 2.55, 0.08), frame);
        props.add(box, transform(x + side * 0.78, CURB_HEIGHT + 1.35, z, 0.04, 1.9, 3.9), 0x93a7b8);
        props.add(box, transform(x + side * 0.4, CURB_HEIGHT + 0.5, z - 0.4, 0.4, 0.06, 2.2), 0x4b4f57);
        // Backlit advert panel facing oncoming riders
        props.add(box, transform(x, CURB_HEIGHT + 1.3, z + 2.05, 1.5, 2.3, 0.14), frame);
        emissive.add(facing, transform(x, CURB_HEIGHT + 1.35, z + 2.13, 1.3, 2, 1), 0xe9eef5);
        emissive.add(facing, transform(x, CURB_HEIGHT + 1.45, z + 2.14, 0.6, 0.6, 1, 0, 0, Math.PI / 4), 0x30343c);
        emissive.add(facing, transform(x, CURB_HEIGHT + 1.45, z + 2.15, 0.36, 0.36, 1, 0, 0, Math.PI / 4), 0xe9eef5);
        glows.add(facing, transform(x, CURB_HEIGHT + 1.35, z + 2.2, 4.5, 5, 1), 0xcfe0ff, () => 0.35);
        glows.add(floor, transform(x, CURB_HEIGHT + 0.03, z + 3.4, 4, 1, 5), 0xcfe0ff, () => 0.3);
    }

    function buildVariant(index) {
        const facades = FACADE_STYLES.map(() => new Batch());
        const shops = new Batch();
        const props = new Batch();
        const emissive = new Batch();
        const glows = new Batch();
        const shadows = new Batch();
        let billboard = null;

        for (const side of [-1, 1]) {
            // Street wall
            let cursor = -half;
            while (cursor < half) {
                let length = range(15, 27);
                if (half - (cursor + length) < 12) length = half - cursor;
                const styleIndex = random() < 0.5 ? 0 : (random() < 0.5 ? 1 : 2);
                const style = FACADE_STYLES[styleIndex];
                const height = styleIndex === 0 ? range(28, 66) : range(14, 32);
                const setback = range(0, 2.4);
                const face = side * (ROAD_HALF + SIDEWALK_WIDTH + setback);
                const back = face + side * 16;
                const z0 = cursor + length;
                const z1 = cursor;
                const tint = tmpColor.setHSL(range(0.52, 0.66), styleIndex === 0 ? range(0.05, 0.3) : range(0, 0.12),
                    range(0.72, 1)).getHex();
                const uOffset = Math.floor(random() * style.cols);
                const vOffset = Math.floor(random() * style.rows);
                const uSpan = Math.max(1, Math.round(length / style.cellWidth)) / style.cols;
                const vSpan = Math.max(1, Math.round(height / style.cellHeight)) / style.rows;
                const uv = [uOffset / style.cols, vOffset / style.rows, uOffset / style.cols + uSpan, vOffset / style.rows + vSpan];
                const batch = facades[styleIndex];
                // Street face, then the face looking back at the rider.
                if (side < 0) {
                    batch.quad(v3(face, 0, z0), v3(face, 0, z1), v3(face, height, z1), v3(face, height, z0), tint, uv);
                    batch.quad(v3(back, 0, z0), v3(face, 0, z0), v3(face, height, z0), v3(back, height, z0), tint,
                        [0, uv[1], 16 / style.cellWidth / style.cols, uv[3]]);
                } else {
                    batch.quad(v3(face, 0, z1), v3(face, 0, z0), v3(face, height, z0), v3(face, height, z1), tint, uv);
                    batch.quad(v3(face, 0, z0), v3(back, 0, z0), v3(back, height, z0), v3(face, height, z0), tint,
                        [0, uv[1], 16 / style.cellWidth / style.cols, uv[3]]);
                }
                // Lit ground floor
                const shopFace = face - side * 0.06;
                const shopU = Math.floor(random() * 6) / 6;
                const shopUv = [shopU, 0, shopU + Math.max(1, Math.round(length / 4)) / 6, 1];
                const shopTint = tmpColor.setScalar(range(0.8, 1)).getHex();
                if (side < 0) {
                    shops.quad(v3(shopFace, CURB_HEIGHT, z0), v3(shopFace, CURB_HEIGHT, z1), v3(shopFace, 4.75, z1),
                        v3(shopFace, 4.75, z0), shopTint, shopUv);
                } else {
                    shops.quad(v3(shopFace, CURB_HEIGHT, z1), v3(shopFace, CURB_HEIGHT, z0), v3(shopFace, 4.75, z0),
                        v3(shopFace, 4.75, z1), shopTint, shopUv);
                }
                // Warm light spilling on the pavement
                glows.add(floor, transform(face - side * 3.2, CURB_HEIGHT + 0.03, cursor + length / 2, 9, 1, length * 1.15),
                    WARM, () => 0.2);
                // Parapet
                props.add(box, transform(face + side * 0.3, height + 0.3, cursor + length / 2, 0.8, 0.6, length), 0x30343c);

                if (!billboard && side > 0 && index % 2 === 0 && height > 24 && length > 16) {
                    const centre = cursor + length / 2;
                    const billboardBatch = new Batch();
                    billboardBatch.quad(v3(face - 0.45, 9, centre - 5), v3(face - 0.45, 9, centre + 5),
                        v3(face - 0.45, 15.2, centre + 5), v3(face - 0.45, 15.2, centre - 5), 0xffffff);
                    billboard = { geometry: billboardBatch.build(), material: billboardMaterials[(index / 2) % billboardMaterials.length] };
                    props.add(box, transform(face - 0.25, 12.1, centre, 0.3, 6.7, 10.5), 0x16181d);
                    glows.add(floor, transform(face - 6, CURB_HEIGHT + 0.04, centre, 12, 1, 14), 0xbfd4ff, () => 0.16);
                }
                cursor += length;
            }

            // Trees
            for (let z = -half + range(4, 9); z < half - 3; z += range(15, 21)) addTree(props, shadows, side * 12.4, z);
            // Lamps
            for (const z of [-37.5, -12.5, 12.5, 37.5]) addStreetlight(props, emissive, glows, side, z + side * 6);
            // Street furniture
            for (let z = -half + range(6, 20); z < half - 6; z += range(22, 38)) {
                const roll = random();
                if (roll < 0.4) addBench(props, side, z);
                else if (roll < 0.75) addPlanter(props, side, z, range(2.4, 4.2));
                else {
                    props.add(cylinder, transform(side * 11.7, CURB_HEIGHT + 0.5, z, 0.3, 1, 0.3), 0x2b3a34);
                    props.add(cylinder, transform(side * 11.7, CURB_HEIGHT + 1.03, z, 0.33, 0.07, 0.33), 0x16181b);
                }
            }
            // Bollards
            const bollardStart = range(-half + 5, half - 20);
            for (let i = 0; i < 4; i++) {
                const z = bollardStart + i * 3;
                props.add(cylinder, transform(side * 10.75, CURB_HEIGHT + 0.45, z, 0.08, 0.9, 0.08), 0x1a1c20);
                props.add(cylinder, transform(side * 10.75, CURB_HEIGHT + 0.78, z, 0.085, 0.08, 0.085), 0xd8dadf);
            }
        }
        if (index % 3 === 0) addBusShelter(props, emissive, glows, -1, range(-30, 30));

        const meshes = [];
        facades.forEach((batch, styleIndex) => {
            const geometry = batch.build();
            if (geometry) meshes.push({ geometry, material: facadeMaterials[styleIndex] });
        });
        meshes.push({ geometry: shops.build(), material: shopMaterial });
        meshes.push({ geometry: props.build(), material: propsMaterial });
        meshes.push({ geometry: emissive.build(), material: emissiveMaterial });
        meshes.push({ geometry: shadows.build(), material: blobShadowMaterial, renderOrder: 1 });
        meshes.push({ geometry: glows.build(), material: glowMaterial, renderOrder: 2 });
        if (billboard) meshes.push(billboard);
        return { meshes, free: [] };
    }

    const variants = [];
    const variantCount = mobile ? 4 : 6;
    for (let i = 0; i < variantCount; i++) variants.push(buildVariant(i));

    function instantiate(variant) {
        const chunk = new THREE.Group();
        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
        roadMesh.receiveShadow = true;
        chunk.add(roadMesh);
        const sidewalkMesh = new THREE.Mesh(sidewalkGeometry, sidewalkMaterial);
        sidewalkMesh.receiveShadow = true;
        chunk.add(sidewalkMesh);
        for (const { geometry, material, renderOrder } of variant.meshes) {
            const mesh = new THREE.Mesh(geometry, material);
            if (renderOrder) mesh.renderOrder = renderOrder;
            chunk.add(mesh);
        }
        chunk.userData.variant = variant;
        return chunk;
    }

    let lastVariant = -1;
    function acquireChunk(z) {
        let index = Math.floor(Math.random() * variants.length);
        if (index === lastVariant) index = (index + 1) % variants.length;
        lastVariant = index;
        const variant = variants[index];
        const chunk = variant.free.pop() || instantiate(variant);
        chunk.position.set(0, 0, z);
        return chunk;
    }

    function releaseChunk(chunk) {
        chunk.userData.variant.free.push(chunk);
    }

    // --- Distant skyline --------------------------------------------------
    const skyline = new THREE.Mesh(
        new THREE.PlaneGeometry(1150, 170),
        new THREE.MeshBasicMaterial({ map: createSkylineTexture(), transparent: true, depthWrite: false, fog: false })
    );
    skyline.renderOrder = -1;
    skyline.frustumCulled = false;
    scene.add(skyline);

    // --- Obstacles --------------------------------------------------------
    const obstacleGeometries = (() => {
        const build = (fill) => {
            const batch = new Batch();
            fill(batch);
            return batch.build();
        };
        const stripes = (batch, y) => {
            for (let i = 0; i < 4; i++) {
                batch.add(box, transform(-0.82 + i * 0.55, y, 0, 0.28, 0.24, 0.13), i % 2 ? 0xf2f2f2 : 0xd92b20);
            }
        };
        const coneShape = (batch, x, z) => {
            batch.add(box, transform(x, 0.03, z, 0.56, 0.06, 0.56), 0x1b1b1d);
            batch.add(cone, transform(x, 0.44, z, 0.2, 0.78, 0.2), 0xff5a14);
            batch.add(cylinder, transform(x, 0.47, z, 0.125, 0.14, 0.125), 0xf4f4f4);
        };
        const barrier = (batch) => {
            batch.add(box, transform(0, 0.62, 0, 2.2, 0.5, 0.1), 0xe9e9e9);
            stripes(batch, 0.62);
            for (const dx of [-0.95, 0.95]) {
                batch.add(box, transform(dx, 0.4, 0, 0.07, 0.8, 0.07), 0x8f9399);
                batch.add(box, transform(dx, 0.04, 0, 0.12, 0.08, 0.6), 0x2a2c30);
            }
        };
        return {
            construction: build((batch) => {
                barrier(batch);
                batch.add(disc, transform(0, 0.02, 2, 1.5, 1, 1.5), 0x050506);
                batch.add(disc, transform(0, 0.025, 2, 1.25, 1, 1.25), 0x000000);
                coneShape(batch, -1.2, 3.2);
                coneShape(batch, 1.2, 3.2);
            }),
            sign: build((batch) => {
                batch.add(cylinder, transform(0, 1, 0, 0.045, 2, 0.045), 0x8f9399);
                batch.add(box, transform(0, 0.04, 0, 0.5, 0.08, 0.5), 0x2a2c30);
                const triangle = new THREE.CylinderGeometry(0.62, 0.62, 0.05, 3).rotateX(Math.PI / 2).rotateZ(Math.PI);
                batch.add(triangle, transform(0, 2, 0), 0xd92b20);
                batch.add(triangle, transform(0, 2, 0.02, 0.74, 0.74, 1), 0xffd21f);
                batch.add(box, transform(0, 2.06, 0.06, 0.07, 0.3, 0.02), 0x111111);
                batch.add(box, transform(0, 1.82, 0.06, 0.08, 0.08, 0.02), 0x111111);
            }),
            barrier: build((batch) => barrier(batch)),
            crate: build((batch) => {
                batch.add(box, transform(0, 0, 0, 0.94, 0.94, 0.94), 0xb08a55);
                for (const sy of [-0.44, 0.44]) {
                    batch.add(box, transform(0, sy, 0, 1, 0.12, 1), 0x8a6a3e);
                }
                for (const sx of [-0.44, 0.44]) {
                    for (const sz of [-0.44, 0.44]) batch.add(box, transform(sx, 0, sz, 0.12, 1, 0.12), 0x8a6a3e);
                }
            }),
            bag: build((batch) => {
                batch.add(blob, transform(0, -0.08, 0, 0.5, 0.42, 0.5), 0x17181a, (y) => 0.7 + y * 0.9);
                batch.add(blob, transform(0.05, 0.36, 0, 0.14, 0.16, 0.14), 0x1d1e21);
            }),
            cone: build((batch) => {
                batch.add(box, transform(0, -0.47, 0, 0.56, 0.06, 0.56), 0x1b1b1d);
                batch.add(cone, transform(0, 0, 0, 0.2, 0.94, 0.2), 0xff5a14);
                batch.add(cylinder, transform(0, 0.05, 0, 0.115, 0.16, 0.115), 0xf4f4f4);
            })
        };
    })();

    function createObstacle(kind) {
        const mesh = new THREE.Mesh(obstacleGeometries[kind], propsMaterial);
        mesh.castShadow = true;
        return mesh;
    }

    // --- Per-frame --------------------------------------------------------
    const fogBase = horizon.clone();
    const night = new THREE.Color(0x0b1226);
    let currentDusk = -1;

    // dusk: 0 = golden hour, 1 = night.
    function setDusk(dusk) {
        if (Math.abs(dusk - currentDusk) < 0.004) return;
        currentDusk = dusk;
        scene.backgroundIntensity = 1 - dusk * 0.82;
        scene.environmentIntensity = 0.7 - dusk * 0.6;
        scene.fog.color.copy(fogBase).lerp(night, dusk * 0.9);
        hemisphere.intensity = 1.25 - dusk * 0.85;
        sun.intensity = 2.6 * (1 - dusk * 0.9);
        const lamp = 0.4 + dusk * 0.9;
        glowMaterial.color.setScalar(lamp);
        facadeMaterials.forEach((material) => { material.emissiveIntensity = 0.85 + dusk * 0.9; });
        skyline.material.color.setScalar(1 - dusk * 0.6);
    }
    setDusk(0);

    function update(camera, focus) {
        sun.target.position.set(focus.x, 0, focus.z - 4);
        sun.position.copy(sun.target.position).addScaledVector(lightDirection, 60);
        skyline.position.set(camera.position.x * 0.85, 60, camera.position.z - 640);
    }

    function setQuality(high) {
        const size = high ? (mobile ? 1024 : 2048) : 512;
        if (sun.shadow.mapSize.x !== size) {
            sun.shadow.mapSize.set(size, size);
            if (sun.shadow.map) {
                sun.shadow.map.dispose();
                sun.shadow.map = null;
            }
        }
        sun.castShadow = high || !mobile;
        scene.fog.near = high ? 55 : 45;
    }

    return { acquireChunk, releaseChunk, createObstacle, update, setDusk, setQuality, sharedMaterials, sun };
}
