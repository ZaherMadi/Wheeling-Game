// City environment for the realistic version. A block is 100 m of avenue:
// road, pavements with kerbs and parking bays, side streets, trees, lamps,
// furniture, parked cars, and two walls of buildings with real facades.
// Blocks come in themed variants built once at startup; each is merged into
// one mesh per material (two levels of detail) and recycled from a pool, so
// nothing is allocated while riding.
import * as THREE from 'three';
import { Batch, Sink, facadeMatrix, sideMatrix, transform } from './geometry.js';
import { createFoliageTexture } from './citytextures.js';
import {
    createCurtainWallTextures, createDecalAtlas, createPavingTexture, createPrintAtlas, createShopAtlas,
    createSignAtlas, createWallTextures, createWindowAtlas
} from './cityatlas.js';
import { createVegetation } from './vegetation.js';
import { createBuildingKit } from './buildings.js';
import { buildCarGeometries, createCarMesh, createCarModels } from './cars.js';
import {
    FACADE_LINE, KERB, LAYBY_EDGE, ROAD_HALF, SHADOW_PER_METRE, createStreetKit
} from './street.js';
import {
    FACADE_STYLES, HORIZON_COLOR, SUN_DIRECTION, mulberry32,
    createBillboardTexture, createFacadeTextures, createGlowTexture, createRoadTextures,
    createSkyTexture, createSkylineTexture
} from './textures.js';

const CHUNK_LENGTH = 100;
const HALF = CHUNK_LENGTH / 2;
const SLOT = 12.5;
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const tmpColor = new THREE.Color();

// Sun light matching the baked shadows (offset per metre of height).
const SUN_LIGHT = new THREE.Vector3(-SHADOW_PER_METRE.x, 1, -SHADOW_PER_METRE.z).normalize();
const GOLD_LIGHT = new THREE.Vector3(0.8, 0.28, -0.52);

// --- Atmosphere ------------------------------------------------------------------
// Fog that warms up towards the sun (aerial perspective), and a wind clock.
const atmosphere = {
    uSunDir: { value: SUN_DIRECTION.clone() },
    uHazeTint: { value: new THREE.Vector3(1.22, 1.03, 0.8) },
    uBacklight: { value: new THREE.Vector3(0.9, 0.75, 0.5) },
    uTime: { value: 0 }
};
const ATMOSPHERE_FOG = `#ifdef USE_FOG
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    float sunAmount = pow( max( dot( normalize( vAtmoDir ), uSunDir ), 0.0 ), 5.0 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * mix( vec3( 1.0 ), uHazeTint, sunAmount ), fogFactor );
#endif`;
// Additive light fades to nothing in fog instead of towards the fog colour.
const ATMOSPHERE_FOG_ADDITIVE = `#ifdef USE_FOG
    gl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
#endif`;

function withAtmosphere(material, { additive = false, extra = null, key = '' } = {}) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, atmosphere);
        shader.vertexShader = 'varying vec3 vAtmoDir;\n' + shader.vertexShader.replace(
            '#include <fog_vertex>',
            '#include <fog_vertex>\n\tvAtmoDir = mvPosition.xyz * mat3( viewMatrix );'
        );
        shader.fragmentShader = 'varying vec3 vAtmoDir;\nuniform vec3 uSunDir;\nuniform vec3 uHazeTint;\n' +
            shader.fragmentShader.replace('#include <fog_fragment>', additive ? ATMOSPHERE_FOG_ADDITIVE : ATMOSPHERE_FOG);
        if (extra) extra(shader);
    };
    // Same callback source for every variant: tell the program cache apart.
    material.customProgramCacheKey = () => `atmosphere-${additive ? 'add' : 'mix'}-${key}`;
    return material;
}

// Block themes: building mix, planting, lamp style, whether a side street
// crosses the block.
const THEMES = [
    { name: 'classic', types: { classic: 6, brick: 2, lowrise: 1 }, planting: ['plane', 'cherry'], lamp: 'classic', crossing: true },
    { name: 'modern', types: { modern: 5, tower: 2, lowrise: 2 }, planting: ['linden', 'column'], lamp: 'modern', crossing: false },
    { name: 'mixed', types: { classic: 3, brick: 3, modern: 3 }, planting: ['cherry', 'linden'], lamp: 'classic', crossing: true },
    { name: 'business', types: { tower: 4, modern: 3, classic: 1 }, planting: ['plane', 'column'], lamp: 'modern', crossing: true },
    { name: 'brick', types: { brick: 5, lowrise: 2, classic: 2 }, planting: ['cherry', 'plane'], lamp: 'classic', crossing: false },
    { name: 'avenue', types: { classic: 3, modern: 2, tower: 1, brick: 2 }, planting: ['linden', 'cherry'], lamp: 'modern', crossing: true }
];

const KEYS = [
    'road', 'sidewalk', 'stone', 'plain', 'brick', 'concrete', 'window', 'curtain', 'props', 'emissive', 'glass',
    'shop', 'sign', 'print', 'printLit', 'car', 'foliage', 'decal', 'shade', 'glow', 'billboard', 'bg0', 'bg1', 'bg2'
];

export function createWorld({ scene, renderer, mobile }) {
    const anisotropy = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
    let random = mulberry32(510);
    const range = (min, max) => min + random() * (max - min);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const weighted = (weights) => {
        const entries = Object.entries(weights);
        let roll = random() * entries.reduce((sum, [, w]) => sum + w, 0);
        for (const [name, w] of entries) {
            roll -= w;
            if (roll <= 0) return name;
        }
        return entries[0][0];
    };

    // --- Sky, fog, lights -----------------------------------------------------
    const skyTexture = createSkyTexture(mobile);
    scene.background = skyTexture;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(skyTexture).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.7;
    const horizon = new THREE.Color(HORIZON_COLOR);
    scene.fog = new THREE.Fog(horizon.clone(), 55, 265);

    const hemisphere = new THREE.HemisphereLight(0xc4d8ff, 0x57483c, 1.15);
    scene.add(hemisphere);
    // Low evening sun: real-time shadows for the bike and obstacles only;
    // the scenery's long shadows are baked into each block.
    const sun = new THREE.DirectionalLight(0xffd2a0, 2.5);
    sun.castShadow = true;
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    // Golden light raking the left-hand facades (no shadows).
    const goldFill = new THREE.DirectionalLight(0xffc28a, 0.85);
    scene.add(goldFill);
    scene.add(goldFill.target);

    // --- Textures -------------------------------------------------------------
    const glowTexture = createGlowTexture();
    const road = createRoadTextures(mobile, anisotropy);
    road.map.repeat.set(1, CHUNK_LENGTH / 50);
    road.roughnessMap.repeat.set(1, CHUNK_LENGTH / 50);
    const walls = createWallTextures(mobile, anisotropy);
    const windowAtlas = createWindowAtlas(mobile);
    const curtainTextures = createCurtainWallTextures(mobile, anisotropy);
    const shopAtlas = createShopAtlas(mobile);
    const signAtlas = createSignAtlas(mobile);
    const printAtlas = createPrintAtlas(mobile, anisotropy);
    const decalAtlas = createDecalAtlas(mobile, anisotropy);
    const foliageTexture = createFoliageTexture(mobile, anisotropy);

    // --- Materials ------------------------------------------------------------
    const roadMaterial = new THREE.MeshStandardMaterial({
        map: road.map, roughnessMap: road.roughnessMap, roughness: 1, metalness: 0, envMapIntensity: 1.15
    });
    // Side streets and parking bays: the same texture, mapped explicitly.
    const roadPatchMap = road.map.clone();
    roadPatchMap.repeat.set(1, 1);
    const roadPatchRoughness = road.roughnessMap.clone();
    roadPatchRoughness.repeat.set(1, 1);
    // Matte finishes: Lambert is much cheaper per pixel on the largest surfaces.
    const wallMaterial = (map) => new THREE.MeshLambertMaterial({ map, vertexColors: true });
    const materials = {
        road: new THREE.MeshStandardMaterial({
            map: roadPatchMap, roughnessMap: roadPatchRoughness, roughness: 1, metalness: 0, envMapIntensity: 1.15, vertexColors: true
        }),
        sidewalk: new THREE.MeshLambertMaterial({ map: createPavingTexture(mobile, anisotropy), vertexColors: true }),
        stone: wallMaterial(walls.stone),
        plain: wallMaterial(walls.plain),
        brick: wallMaterial(walls.brick),
        concrete: wallMaterial(walls.concrete),
        window: new THREE.MeshStandardMaterial({
            map: windowAtlas.map, emissiveMap: windowAtlas.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.35,
            roughness: 0.05, metalness: 0, envMapIntensity: 1.7, vertexColors: true
        }),
        curtain: new THREE.MeshStandardMaterial({
            map: curtainTextures.map, emissiveMap: curtainTextures.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.3,
            roughness: 0.07, metalness: 0.55, envMapIntensity: 1.35, vertexColors: true
        }),
        props: new THREE.MeshLambertMaterial({ vertexColors: true }),
        emissive: new THREE.MeshBasicMaterial({ vertexColors: true }),
        glass: new THREE.MeshStandardMaterial({
            color: 0x9fb4c4, transparent: true, opacity: 0.3, roughness: 0.04, metalness: 0, envMapIntensity: 2,
            depthWrite: false, vertexColors: true
        }),
        shop: new THREE.MeshBasicMaterial({ map: shopAtlas.map, vertexColors: true }),
        sign: new THREE.MeshBasicMaterial({ map: signAtlas.map, vertexColors: true }),
        print: new THREE.MeshLambertMaterial({ map: printAtlas.map, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true }),
        printLit: new THREE.MeshBasicMaterial({ map: printAtlas.map, vertexColors: true }),
        car: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.35, envMapIntensity: 1.25, vertexColors: true }),
        foliage: new THREE.MeshLambertMaterial({ map: foliageTexture, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true }),
        decal: new THREE.MeshStandardMaterial({
            map: decalAtlas.map, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0, vertexColors: true,
            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
        }),
        shade: new THREE.MeshBasicMaterial({
            map: decalAtlas.map, transparent: true, depthWrite: false, vertexColors: true,
            polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
        }),
        glow: new THREE.MeshBasicMaterial({
            map: glowTexture, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        }),
        billboard: new THREE.MeshBasicMaterial({ vertexColors: true })
    };
    FACADE_STYLES.forEach((style, index) => {
        const textures = createFacadeTextures(style, 300 + index * 17, anisotropy);
        materials[`bg${index}`] = new THREE.MeshLambertMaterial({
            map: textures.map, emissiveMap: textures.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.85, vertexColors: true
        });
    });
    const RENDER_ORDER = { decal: 1, shade: 2, glass: 3, glow: 4 };

    // Foliage: leaf cards lit as soft volumes, swaying, backlit by the sun.
    const SWAY = `
    float swayHeight = smoothstep( 2.5, 9.0, position.y );
    transformed.x += ( sin( uTime * 1.5 + position.z * 0.55 + position.y * 0.9 ) * 0.09
        + sin( uTime * 3.1 + position.x * 1.7 ) * 0.03 ) * swayHeight;
    transformed.z += sin( uTime * 1.2 + position.x * 0.6 + position.y * 0.7 ) * 0.06 * swayHeight;`;
    withAtmosphere(materials.foliage, {
        key: 'foliage',
        extra(shader) {
            shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
                '#include <begin_vertex>', '#include <begin_vertex>' + SWAY
            );
            shader.fragmentShader = 'uniform vec3 uBacklight;\n' + shader.fragmentShader
                // Cards carry volume normals: never flip them on back faces.
                .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );')
                // Leaves between the eye and the sun light up (not the bark).
                .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    float leafMask = 1.0 - step( 0.75, vMapUv.x ) * step( vMapUv.y, 0.5 );
    float towardsSun = pow( max( dot( normalize( vAtmoDir ), uSunDir ), 0.0 ), 2.0 );
    reflectedLight.directDiffuse += diffuseColor.rgb * uBacklight * towardsSun * leafMask;`);
        }
    });
    // Baked shadows: the vertex colour's red channel is the strength.
    withAtmosphere(materials.shade, {
        key: 'shade',
        extra(shader) {
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    diffuseColor.a *= vColor.r;
    diffuseColor.rgb = vec3( 0.025, 0.035, 0.06 );`);
        }
    });
    withAtmosphere(materials.glow, { additive: true, key: 'glow' });
    for (const [name, material] of Object.entries(materials)) {
        if (!['foliage', 'shade', 'glow'].includes(name)) withAtmosphere(material, { key: name });
    }
    withAtmosphere(roadMaterial, { key: 'mainroad' });
    const sharedMaterials = [roadMaterial, ...Object.values(materials)];

    // Billboards: an atlas of four posters; the 51Wheling one is painted in
    // when its image has loaded.
    const billboardCanvas = document.createElement('canvas');
    billboardCanvas.width = 1024;
    billboardCanvas.height = 640;
    const billboardCtx = billboardCanvas.getContext('2d');
    [
        ['WHEELIE KING', '51 GAMES', ['#1b2a6b', '#e2622a']],
        ['ZONE 51', 'RIDE OR DIE', ['#3b1466', '#d43d6b']],
        ['510 CITY', 'BORN TO RIDE', ['#0d3b4f', '#e0a52a']]
    ].forEach(([title, subtitle, palette], i) => {
        const poster = createBillboardTexture(title, subtitle, palette);
        billboardCtx.drawImage(poster.image, ((i + 1) % 2) * 512, Math.floor((i + 1) / 2) * 320, 512, 320);
        poster.dispose();
    });
    billboardCtx.fillStyle = '#0b0b0d';
    billboardCtx.fillRect(0, 0, 512, 320);
    const billboardTexture = new THREE.CanvasTexture(billboardCanvas);
    billboardTexture.colorSpace = THREE.SRGBColorSpace;
    billboardTexture.anisotropy = anisotropy;
    materials.billboard.map = billboardTexture;
    const logo = new Image();
    logo.onload = () => {
        const scale = Math.min(512 / logo.width, 320 / logo.height);
        const w = logo.width * scale;
        const h = logo.height * scale;
        billboardCtx.drawImage(logo, (512 - w) / 2, (320 - h) / 2, w, h);
        billboardTexture.needsUpdate = true;
    };
    logo.src = `${import.meta.env.BASE_URL}billboard-51wheling.jpg`;
    const BILLBOARD_CELLS = [[0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1], [0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5]];

    // --- Kits -----------------------------------------------------------------
    const proxyRandom = () => random();
    const vegetation = createVegetation(proxyRandom);
    const cars = createCarModels();
    const atlases = {
        windows: windowAtlas, shops: shopAtlas, signs: signAtlas, prints: printAtlas.cells, decals: decalAtlas.cells
    };
    const buildings = createBuildingKit({ random: proxyRandom, atlases });
    const street = createStreetKit({ random: proxyRandom, atlases, vegetation, cars });

    // --- Block builder ---------------------------------------------------------
    // Everything below is written for the right side; the left side runs the
    // same code under a half-turn (sideMatrix), so local z is mirrored there.
    function buildSide(sink, side, theme, crossingZ, index) {
        street.setSide(side);
        const base = sideMatrix(side);
        sink.setBase(base);
        const zc = crossingZ === null ? null : crossingZ * side;
        const inCrossing = (z0, z1, margin = 0) => zc !== null && z1 > zc - 8 - margin && z0 < zc + 8 + margin;

        // Slots of 12.5 m along the kerb.
        const slots = [];
        let busPlaced = false;
        for (let k = 0; k < CHUNK_LENGTH / SLOT; k++) {
            const z0 = -HALF + k * SLOT;
            const z1 = z0 + SLOT;
            let type;
            if (inCrossing(z0, z1, 0.5)) type = 'crossing';
            else {
                type = weighted({ tree: 4.5, parking: 3, plain: 1.8, bus: busPlaced ? 0 : 0.9 });
                if (type === 'bus') busPlaced = true;
            }
            slots.push({ z0, z1, type });
        }
        // Kerb line: edge 10 (normal), LAYBY_EDGE (parking bay), null (side road).
        const segments = [];
        const pushSegment = (z0, z1, edge) => {
            if (z1 - z0 <= 0.001) return;
            const last = segments[segments.length - 1];
            if (last && last.edge === edge && Math.abs(last.z1 - z0) < 1e-6) last.z1 = z1;
            else segments.push({ z0, z1, edge });
        };
        for (const slot of slots) {
            if (slot.type === 'parking') {
                pushSegment(slot.z0, slot.z0 + 0.6, ROAD_HALF);
                pushSegment(slot.z0 + 0.6, slot.z1 - 0.6, LAYBY_EDGE);
                pushSegment(slot.z1 - 0.6, slot.z1, ROAD_HALF);
            } else if (slot.type === 'crossing') {
                const gap0 = Math.max(slot.z0, zc - 5);
                const gap1 = Math.min(slot.z1, zc + 5);
                if (gap1 <= gap0) pushSegment(slot.z0, slot.z1, ROAD_HALF);
                else {
                    pushSegment(slot.z0, gap0, ROAD_HALF);
                    pushSegment(gap0, gap1, null);
                    pushSegment(gap1, slot.z1, ROAD_HALF);
                }
            } else {
                pushSegment(slot.z0, slot.z1, ROAD_HALF);
            }
        }
        const edgeAt = (z) => {
            const segment = segments.find((s) => z >= s.z0 && z <= s.z1);
            return segment ? segment.edge : ROAD_HALF;
        };

        // Ground: kerbs, pavement, bays, side road.
        const back = 27;
        segments.forEach((segment, i) => {
            const { z0, z1, edge } = segment;
            if (edge === null) return;
            street.kerbZ(sink, edge, z0, z1);
            street.paving(sink, edge + 0.9, z0, back, z1);
            // Darker setts along the kerb.
            street.paving(sink, edge + 0.3, z0, edge + 0.9, z1, 0x9a9590);
            if (edge === LAYBY_EDGE) street.asphalt(sink, ROAD_HALF, z0, LAYBY_EDGE, z1);
            const next = segments[i + 1];
            if (next && next.edge !== null && next.edge !== edge) {
                const low = Math.min(edge, next.edge);
                const high = Math.max(edge, next.edge);
                // The kerb returns on the side of the wider pavement.
                street.kerbX(sink, z1, low, high + 0.3, edge < next.edge ? 1 : -1);
            }
        });
        if (zc !== null) {
            for (let x = ROAD_HALF; x < 48; x += 3.4) street.asphalt(sink, x, zc - 5, Math.min(48, x + 3.4), zc + 5);
            street.kerbX(sink, zc - 5, ROAD_HALF, 48, 1);
            street.kerbX(sink, zc + 5, ROAD_HALF, 48, -1);
            street.paving(sink, back, zc - 8, 48, zc - 5);
            street.paving(sink, back, zc + 5, 48, zc + 8);
            // Crossings: zebra over the avenue before the junction, over the
            // side street, stop line and turn arrows for this direction.
            for (let x = -9.4; x <= 9.0; x += 1.0) street.decal(sink, 'paint', x, zc + 8.6, x + 0.5, zc + 12.6);
            street.decal(sink, 'paint', 0.3, zc + 13.1, 9.6, zc + 13.5, 0xffffff, 0.012, true);
            for (const x of [2.5, 7.5]) street.decal(sink, 'arrow', x - 0.6, zc + 20, x + 0.6, zc + 25);
            for (let z = zc - 4.5; z <= zc + 4.0; z += 1.0) street.decal(sink, 'paint', 12.2, z, 15.6, z + 0.5, 0xffffff, 0.012, true);
            for (let x = 17; x < 46; x += 4) street.decal(sink, 'paint', x, zc - 0.07, x + 2.2, zc + 0.07, 0xffffff, 0.012, true);
            sink.hi.print.floor(ROAD_HALF + 0.3, zc + 8.6, ROAD_HALF + 0.9, zc + 12.6, KERB + 0.006, 0xffffff, atlases.prints.tactile);
            street.setEdge(ROAD_HALF + 0.3);
            street.trafficLight(sink, ROAD_HALF + 0.7, zc + 13.6, 1);
            street.trafficLight(sink, ROAD_HALF + 0.7, zc - 5.8, 1);
            street.poleSign(sink, ROAD_HALF + 0.6, zc + 16, ['crossing']);
            street.poleSign(sink, 16.5, zc - 5.8, ['oneWay'], 2.4);
            street.bollards(sink, ROAD_HALF + 0.65, zc + 6, 2, 1.2);
        }

        // Road surface details on this half.
        for (let z = -HALF + range(2, 8); z < HALF - 1; z += range(18, 30)) {
            if (inCrossing(z, z + 1) || edgeAt(z) !== ROAD_HALF) continue;
            street.decal(sink, 'grate', ROAD_HALF - 0.48, z, ROAD_HALF - 0.04, z + 0.9, 0xffffff, 0.012);
        }
        for (let i = 0; i < 2; i++) {
            const z = range(-HALF + 5, HALF - 5);
            const x = pick([2.5, 5.2, 7.5]);
            if (!inCrossing(z - 1, z + 1)) street.decal(sink, 'manhole', x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0xffffff, 0.011);
        }
        for (let i = 0; i < 2; i++) {
            const z = range(-HALF + 6, HALF - 6);
            const x = range(1, 8);
            const cell = pick(['patch', 'cracks', 'oil', 'cracks']);
            const size = cell === 'oil' ? 1.2 : range(2, 3.4);
            if (!inCrossing(z - 3, z + 3)) street.decal(sink, cell, x - size / 2, z - size / 2, x + size / 2, z + size / 2, 0xffffff, 0.01);
        }
        if ((index + (side > 0 ? 0 : 1)) % 2 === 0) {
            const z = range(-HALF + 10, HALF - 20);
            const x = range(2, 6);
            if (!inCrossing(z, z + 12)) street.decal(sink, 'skid', x, z, x + 1.4, z + 12, 0xffffff, 0.013);
        }

        // Furniture per slot.
        const planting = theme.planting;
        for (const slot of slots) {
            const mid = (slot.z0 + slot.z1) / 2;
            const edge = edgeAt(mid);
            street.setEdge((edge ?? ROAD_HALF) + 0.3);
            if (slot.type === 'tree') {
                const x = ROAD_HALF + 2.6;
                const z = mid + range(-2.5, 2.5);
                street.streetTree(sink, x, z, random() < 0.7 ? planting[0] : planting[1], (grown) => {
                    const crownMid = grown.trunkHeight + grown.crownHeight * 0.42;
                    street.castShade(sink, 'line', x, z, 0.35, 0.2, 0, grown.trunkHeight, 0.8);
                    street.castShade(sink, 'treeShadow', x, z, grown.radius * 0.85, grown.radius * 0.85,
                        crownMid - grown.crownHeight * 0.32, crownMid + grown.crownHeight * 0.3, 0.75);
                });
                if (random() < 0.4) street.bench(sink, ROAD_HALF + 4.6, mid + (z > mid ? -4 : 4));
            } else if (slot.type === 'parking') {
                const la = slot.z0 + 0.6;
                const lb = slot.z1 - 0.6;
                const bays = 2;
                const bay = (lb - la) / bays;
                street.setEdge(LAYBY_EDGE + 0.3);
                for (let b = 0; b < bays; b++) {
                    if (b > 0) street.decal(sink, 'paint', ROAD_HALF + 0.2, la + b * bay - 0.06, LAYBY_EDGE - 0.1, la + b * bay + 0.06, 0xffffff, 0.012, true);
                    if (random() < 0.82) street.parkedCar(sink, (ROAD_HALF + LAYBY_EDGE) / 2 + 0.05, la + (b + 0.5) * bay);
                    else if (random() < 0.5) street.decal(sink, 'oil', 10.6, la + (b + 0.4) * bay, 11.8, la + (b + 0.4) * bay + 1.2);
                }
                street.poleSign(sink, LAYBY_EDGE + 0.6, la + 0.6, ['parking']);
                if (random() < 0.5) street.bin(sink, LAYBY_EDGE + 0.8, mid + 2);
            } else if (slot.type === 'bus') {
                street.busShelter(sink, ROAD_HALF + 3.4, mid);
                street.decal(sink, 'bus', 7.7, mid - 6, 9.4, mid - 3.2);
                street.bin(sink, ROAD_HALF + 1.2, mid - 3.4);
            } else if (slot.type === 'plain') {
                const items = ['bench', 'bollards', 'mupi', 'column', 'rack', 'planter', 'hydrant'];
                const first = pick(items);
                const second = pick(items.filter((item) => item !== first));
                [first, second].forEach((item, n) => {
                    const z = mid + (n ? 3.5 : -3.5);
                    if (item === 'bench') street.bench(sink, ROAD_HALF + 4.6, z);
                    if (item === 'bollards') street.bollards(sink, ROAD_HALF + 0.65, z - 2, 4);
                    if (item === 'mupi') street.mupi(sink, ROAD_HALF + 2.4, z);
                    if (item === 'column') street.adColumn(sink, ROAD_HALF + 3.2, z);
                    if (item === 'rack') street.bikeRack(sink, ROAD_HALF + 2.4, z);
                    if (item === 'planter') street.planter(sink, ROAD_HALF + 4.6, z, range(2.4, 3.6));
                    if (item === 'hydrant') street.hydrant(sink, ROAD_HALF + 0.75, z);
                });
                street.bin(sink, ROAD_HALF + 1.2, mid);
            }
        }
        // Lamps every 25 m, set back behind parking bays.
        for (const z of [-37.5, -12.5, 12.5, 37.5]) {
            if (inCrossing(z - 1, z + 1, 1)) continue;
            const edge = edgeAt(z) ?? ROAD_HALF;
            street.setEdge(edge + 0.3);
            const x = edge + 0.9;
            street.lamp(sink, x, z, theme.lamp, true);
            street.castShade(sink, 'line', x, z, 0.3, 0.12, 0, theme.lamp === 'classic' ? 4.6 : 8, 0.55);
        }
        if (side > 0 && index % 3 === 0) {
            street.setEdge(ROAD_HALF + 0.3);
            street.poleSign(sink, ROAD_HALF + 0.6, 44, ['speed50']);
        }

        // Buildings ---------------------------------------------------------------
        const shadows = [];
        const terraces = [];
        let cursor = -HALF;
        while (cursor < HALF - 0.5) {
            if (zc !== null && cursor >= zc - 8 - 0.01 && cursor < zc + 8) {
                cursor = zc + 8;
                continue;
            }
            const limit = zc !== null && cursor < zc - 8 ? zc - 8 : HALF;
            const type = weighted(theme.types);
            let width = type === 'tower' ? range(18, 28) : range(12, 24);
            if (limit - (cursor + width) < 9) width = limit - cursor;
            const z0 = cursor;
            const z1 = cursor + width;
            const atStart = zc !== null && Math.abs(z0 - (zc + 8)) < 0.01;
            const atEnd = zc !== null && Math.abs(z1 - (zc - 8)) < 0.01;
            const corner = atStart || atEnd;
            const kind = type === 'tower' && (width < 16 || corner) ? 'modern' : type;
            const setback = kind === 'tower' ? range(1.5, 3.5) : (corner ? 0 : range(0, 1.2));
            const face = FACADE_LINE + setback;
            const depth = corner ? 48 - face - 0.5 : (kind === 'tower' ? range(20, 26) : range(14, 18));
            sink.setBase(facadeMatrix(side, face, z0, '-x'));
            const built = buildings.build(sink, kind, width, depth, { ends: [!atStart, !atEnd] });
            shadows.push({ z0, z1, height: built.height, face });
            for (const unit of built.units) {
                if (['cafe', 'bar', 'bakery'].includes(unit.kind) && unit.z1 - unit.z0 > 3 && random() < 0.75) {
                    terraces.push({ z0: z0 + unit.z0 + 0.3, z1: z0 + unit.z1 - 0.3, face });
                }
            }
            if (corner) {
                // Facade along the side street, and a street name plate.
                if (atEnd) sink.setBase(facadeMatrix(side, face, z1, '+z'));
                else sink.setBase(facadeMatrix(side, face + depth, z0, '-z'));
                buildings.build(sink, kind, depth, Math.min(width, 14), { ends: [false, false] });
                sink.setBase(base);
                const plateZ = atEnd ? z1 - 1.6 : z0 + 0.2;
                sink.hi.print.wallZ(plateZ, 3.3, plateZ + 1.4, 3.65, face - 0.04, -1, 0xffffff, atlases.prints.streetName);
            }
            cursor = z1;
        }
        if (zc !== null) {
            // Building closing the view down the side street.
            sink.setBase(facadeMatrix(side, 48, zc - 8, '-x'));
            buildings.build(sink, theme.name === 'business' ? 'modern' : 'classic', 16, 14, { ends: [false, false] });
        }
        sink.setBase(base);

        // Café terraces in front of cafés, bars and bakeries.
        for (const terrace of terraces) {
            if (inCrossing(terrace.z0, terrace.z1, 1)) continue;
            street.setEdge(ROAD_HALF + 0.3);
            street.cafeTerrace(sink, terrace.z0, terrace.z1, terrace.face);
        }

        // Long shadows of the buildings on the pavement (sun side only).
        if (side > 0) {
            const widthAt = new Float32Array(CHUNK_LENGTH + 1);
            for (const s of shadows) {
                const w = Math.min(s.face - ROAD_HALF - 0.3, s.height * -SHADOW_PER_METRE.x);
                const reach = s.height * SHADOW_PER_METRE.z;
                for (let z = Math.max(-HALF, Math.floor(s.z0)); z <= Math.min(HALF, s.z1 + reach); z++) {
                    widthAt[z + HALF] = Math.max(widthAt[z + HALF], w);
                }
            }
            const cell = atlases.decals.box;
            const cu = (cell[0] + cell[2]) / 2;
            const cv = (cell[1] + cell[3]) / 2;
            const solid = [cu - 0.01, cv - 0.01, cu + 0.01, cv + 0.01];
            let start = 0;
            for (let i = 1; i <= CHUNK_LENGTH + 1; i++) {
                const current = Math.round(widthAt[start] * 2) / 2;
                const value = i <= CHUNK_LENGTH ? Math.round(widthAt[i] * 2) / 2 : -1;
                if (value !== current) {
                    if (current > 0.2) {
                        const z0 = start - HALF;
                        const z1 = Math.min(HALF, i - HALF);
                        const edge = Math.max(...[z0, (z0 + z1) / 2, z1].map((z) => edgeAt(z) ?? ROAD_HALF)) + 0.3;
                        const x0 = Math.max(edge, FACADE_LINE - current);
                        sink.both.shade.floor(x0, z0, FACADE_LINE + 4, z1, KERB + 0.007, 0xb3b3b3, solid);
                    }
                    start = i;
                }
            }
        }

        // Distant towers behind the street walls (depth and skyline layers).
        for (let i = 0; i < 2; i++) {
            const style = Math.floor(random() * FACADE_STYLES.length);
            const s = FACADE_STYLES[style];
            const x0 = range(52, 85);
            const width = range(16, 30);
            const z0 = range(-HALF, HALF - width);
            const height = range(45, 95);
            const tint = tmpColor.setHSL(range(0.52, 0.66), range(0.05, 0.25), range(0.72, 0.95)).getHex();
            const u0 = Math.floor(random() * s.cols) / s.cols;
            const v0 = Math.floor(random() * s.rows) / s.rows;
            const uv = [u0, v0, u0 + Math.round(width / s.cellWidth) / s.cols, v0 + Math.round(height / s.cellHeight) / s.rows];
            const sideUv = [0, uv[1], width / s.cellWidth / s.cols, uv[3]];
            const batch = sink.both[`bg${style}`];
            batch.wallZ(z0, 0, z0 + width, height, x0, -1, tint, uv);
            batch.wallX(x0, 0, x0 + width, height, z0 + width, 1, tint, sideUv);
            batch.wallX(x0, 0, x0 + width, height, z0, -1, tint, sideUv);
        }

        // One billboard per block on a tall right-hand facade.
        if (side > 0) {
            const tall = shadows.filter((s) => s.height > 22 && s.z1 - s.z0 > 14 && !inCrossing(s.z0, s.z1));
            if (tall.length) {
                const host = pick(tall);
                const centre = (host.z0 + host.z1) / 2;
                const x = host.face - 0.5;
                sink.both.props.block(x, 8.8, centre - 5.3, host.face, 15.4, centre + 5.3, 0x16181d);
                sink.both.billboard.wallZ(centre - 5, 9.0, centre + 5, 15.2, x - 0.01, -1, 0xffffff, BILLBOARD_CELLS[index % 4]);
                sink.both.glow.floor(x - 7, centre - 7, x, centre + 7, KERB + 0.04, 0xbfd4ff, [0.1, 0.1, 0.9, 0.9]);
            }
        }
    }

    function buildVariant(index) {
        random = mulberry32(510 + index * 7919);
        const theme = THEMES[index % THEMES.length];
        const sink = new Sink(KEYS);
        const crossingZ = theme.crossing ? Math.round(range(-22, 18)) : null;
        street.parked.length = 0;
        for (const side of [1, -1]) buildSide(sink, side, theme, crossingZ, index);
        const parked = street.parked.slice();
        const { hi, lo } = sink.build();
        const toSpecs = (geometries) => Object.entries(geometries)
            .filter(([, geometry]) => geometry)
            .map(([key, geometry]) => ({ key, geometry, material: materials[key], renderOrder: RENDER_ORDER[key] || 0 }));
        return { hi: toSpecs(hi), lo: toSpecs(lo), free: [], theme: theme.name, crossingZ, parked };
    }

    const variants = [];
    const variantCount = mobile ? 4 : 6;
    for (let i = 0; i < variantCount; i++) variants.push(buildVariant(i));
    random = mulberry32(Date.now() >>> 0);

    // --- Pool -------------------------------------------------------------------
    const roadGeometry = new THREE.PlaneGeometry(ROAD_HALF * 2, CHUNK_LENGTH).rotateX(-Math.PI / 2);
    roadGeometry.userData.shared = true;
    const active = new Set();

    function staticMesh(geometry, material, renderOrder) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = renderOrder;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        return mesh;
    }

    // Parked cars are instances, one pair of meshes per model (painted body,
    // the rest), so free roam can take one away and give it back.
    const carGeometries = Object.fromEntries(Object.entries(cars).map(([name, model]) => [name, buildCarGeometries(model)]));
    const placement = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const paintColor = new THREE.Color();

    function parkedMatrix(entry) {
        turn.setFromAxisAngle(UP_AXIS, entry.yaw);
        return placement.compose(new THREE.Vector3(entry.x, 0, entry.z), turn, new THREE.Vector3(1, 1, 1));
    }

    function instanceParkedCars(variant, group) {
        const entries = [];
        const byModel = {};
        for (const car of variant.parked) (byModel[car.model] ||= []).push(car);
        for (const [model, list] of Object.entries(byModel)) {
            const body = new THREE.InstancedMesh(carGeometries[model].body, materials.car, list.length);
            const rest = new THREE.InstancedMesh(carGeometries[model].rest, materials.car, list.length);
            list.forEach((car, index) => {
                const matrix = parkedMatrix(car);
                body.setMatrixAt(index, matrix);
                rest.setMatrixAt(index, matrix);
                body.setColorAt(index, paintColor.set(car.paint));
                entries.push({ ...car, body, rest, index, taken: false });
            });
            for (const mesh of [body, rest]) {
                mesh.matrixAutoUpdate = false;
                mesh.computeBoundingSphere();
                group.add(mesh);
            }
        }
        return entries;
    }

    function restoreParkedCars(chunk) {
        for (const entry of chunk.userData.parked) {
            if (!entry.taken) continue;
            entry.taken = false;
            const matrix = parkedMatrix(entry);
            entry.body.setMatrixAt(entry.index, matrix);
            entry.rest.setMatrixAt(entry.index, matrix);
            entry.body.instanceMatrix.needsUpdate = true;
            entry.rest.instanceMatrix.needsUpdate = true;
        }
    }

    function instantiate(variant) {
        const chunk = new THREE.Group();
        const roadMesh = staticMesh(roadGeometry, roadMaterial, 0);
        roadMesh.receiveShadow = true;
        chunk.add(roadMesh);
        const hi = new THREE.Group();
        const lo = new THREE.Group();
        for (const spec of variant.hi) hi.add(staticMesh(spec.geometry, spec.material, spec.renderOrder));
        for (const spec of variant.lo) lo.add(staticMesh(spec.geometry, spec.material, spec.renderOrder));
        lo.visible = false;
        chunk.userData.parked = instanceParkedCars(variant, hi);
        chunk.add(hi, lo);
        chunk.userData.variant = variant;
        chunk.userData.lod = { hi, lo };
        return chunk;
    }

    let lastVariant = -1;
    function acquireChunk(z) {
        let index = Math.floor(random() * variants.length);
        if (index === lastVariant) index = (index + 1) % variants.length;
        lastVariant = index;
        const variant = variants[index];
        const pooled = variant.free.pop();
        const chunk = pooled || instantiate(variant);
        if (pooled) restoreParkedCars(chunk);
        chunk.position.set(0, 0, z);
        active.add(chunk);
        return chunk;
    }

    function releaseChunk(chunk) {
        active.delete(chunk);
        chunk.userData.variant.free.push(chunk);
    }

    // Free roam ------------------------------------------------------------------
    // World z of the side streets currently on screen.
    function crossings() {
        const out = [];
        for (const chunk of active) {
            if (chunk.userData.variant.crossingZ !== null) out.push(chunk.position.z + chunk.userData.variant.crossingZ);
        }
        return out;
    }

    // Nearest parked car within `radius` of (x, z), still in place.
    function parkedNear(x, z, radius) {
        let best = null;
        let bestDistance = radius;
        for (const chunk of active) {
            for (const entry of chunk.userData.parked) {
                if (entry.taken) continue;
                const distance = Math.hypot(entry.x - x, chunk.position.z + entry.z - z);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = { entry, chunk, x: entry.x, z: chunk.position.z + entry.z, yaw: entry.yaw, model: entry.model, paint: entry.paint };
                }
            }
        }
        return best;
    }

    function takeParked(found) {
        const { entry } = found;
        entry.taken = true;
        entry.body.setMatrixAt(entry.index, hidden);
        entry.rest.setMatrixAt(entry.index, hidden);
        entry.body.instanceMatrix.needsUpdate = true;
        entry.rest.instanceMatrix.needsUpdate = true;
    }

    // A car that moves: painted with its own colour, same look as parked ones.
    function createCar(model, paint) {
        const body = withAtmosphere(new THREE.MeshStandardMaterial({
            color: paint, roughness: 0.3, metalness: 0.35, envMapIntensity: 1.25, vertexColors: true
        }), { key: 'carbody' });
        const car = createCarMesh(carGeometries[model], body, materials.car);
        car.userData.model = model;
        car.userData.length = cars[model].length;
        return car;
    }

    // Deterministic block sequence for debugging (?seed=123).
    function reseed(seed) {
        random = mulberry32(seed >>> 0);
        lastVariant = -1;
    }

    // --- Distant skyline ------------------------------------------------------
    const skyline = new THREE.Mesh(
        new THREE.PlaneGeometry(1150, 170),
        new THREE.MeshBasicMaterial({ map: createSkylineTexture(), transparent: true, depthWrite: false, fog: false })
    );
    skyline.renderOrder = -1;
    skyline.frustumCulled = false;
    scene.add(skyline);

    // --- Obstacles ----------------------------------------------------------------
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
    const cone = new THREE.CylinderGeometry(0.18, 1, 1, 10);
    const blob = new THREE.IcosahedronGeometry(1, 1);
    const disc = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
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
                for (const sy of [-0.44, 0.44]) batch.add(box, transform(0, sy, 0, 1, 0.12, 1), 0x8a6a3e);
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
        const mesh = new THREE.Mesh(obstacleGeometries[kind], materials.props);
        mesh.castShadow = true;
        return mesh;
    }

    // --- Per-frame -----------------------------------------------------------------
    let currentDusk = -1;
    let lastDusk = 0;
    let lodDistance = mobile ? 45 : 70;

    // Ambiences: every lighting value of a mood in one place. The day cycle
    // blends the chosen ambience towards night; new moods are new entries.
    const AMBIENCES = {
        golden: {
            sun: 0xffd2a0, sunIntensity: 2.5, fill: 0xffc28a, fillIntensity: 0.85,
            sky: 0xc4d8ff, ground: 0x57483c, hemisphere: 1.15, fog: HORIZON_COLOR, fogNear: 55, fogFar: 265,
            background: 1, environment: 0.7, windows: 0.35, offices: 0.3, towers: 0.85, lamps: 0.4,
            shops: 0.82, posters: 0.8, shadows: 1, skyline: 1, haze: [1.22, 1.03, 0.8]
        },
        day: {
            sun: 0xfff3e2, sunIntensity: 3, fill: 0xfff0dc, fillIntensity: 0.3,
            sky: 0xcfe2ff, ground: 0x6a5c4c, hemisphere: 1.35, fog: 0xd3e0ee, fogNear: 70, fogFar: 300,
            background: 1.12, environment: 0.85, windows: 0.12, offices: 0.1, towers: 0.4, lamps: 0.12,
            shops: 0.72, posters: 0.75, shadows: 0.9, skyline: 1.1, haze: [1.08, 1.04, 0.96]
        },
        overcast: {
            sun: 0xdfe4ea, sunIntensity: 0.55, fill: 0xdde3ea, fillIntensity: 0.1,
            sky: 0xd0d8e2, ground: 0x5a5e66, hemisphere: 1.9, fog: 0xb4bcc6, fogNear: 35, fogFar: 210,
            background: 0.72, environment: 0.9, windows: 0.45, offices: 0.4, towers: 0.9, lamps: 0.35,
            shops: 0.9, posters: 0.9, shadows: 0.25, skyline: 0.75, haze: [1, 1, 1]
        },
        night: {
            sun: 0x8aa0ff, sunIntensity: 0.2, fill: 0x6070a0, fillIntensity: 0,
            sky: 0xc4d8ff, ground: 0x57483c, hemisphere: 0.35, fog: 0x1d2539, fogNear: 55, fogFar: 265,
            background: 0.18, environment: 0.1, windows: 1.85, offices: 1.6, towers: 1.75, lamps: 1.3,
            shops: 1, posters: 1, shadows: 0.15, skyline: 0.4, haze: [1.1, 1, 1.2]
        }
    };
    let ambience = AMBIENCES.golden;
    const mixTarget = new THREE.Color();
    const mix = (a, b, t) => a + (b - a) * t;
    const mixHex = (out, a, b, t) => out.set(a).lerp(mixTarget.set(b), t);

    // dusk: 0 = the ambience itself, 1 = night.
    function setDusk(dusk) {
        lastDusk = dusk;
        if (Math.abs(dusk - currentDusk) < 0.004) return;
        currentDusk = dusk;
        const a = ambience;
        const b = AMBIENCES.night;
        const t = dusk;
        scene.backgroundIntensity = mix(a.background, b.background, t);
        scene.environmentIntensity = mix(a.environment, b.environment, t);
        mixHex(scene.fog.color, a.fog, b.fog, t);
        scene.fog.near = mix(a.fogNear, b.fogNear, t) * (highQuality ? 1 : 0.82);
        scene.fog.far = mix(a.fogFar, b.fogFar, t);
        mixHex(hemisphere.color, a.sky, b.sky, t);
        mixHex(hemisphere.groundColor, a.ground, b.ground, t);
        hemisphere.intensity = mix(a.hemisphere, b.hemisphere, t);
        mixHex(sun.color, a.sun, b.sun, t);
        sun.intensity = mix(a.sunIntensity, b.sunIntensity, t);
        mixHex(goldFill.color, a.fill, b.fill, t);
        goldFill.intensity = mix(a.fillIntensity, b.fillIntensity, t);
        materials.glow.color.setScalar(mix(a.lamps, b.lamps, t));
        materials.window.emissiveIntensity = mix(a.windows, b.windows, t);
        materials.curtain.emissiveIntensity = mix(a.offices, b.offices, t);
        materials.shop.color.setScalar(mix(a.shops, b.shops, t));
        materials.printLit.color.setScalar(mix(a.posters, b.posters, t));
        materials.shade.opacity = mix(a.shadows, b.shadows, t);
        for (let i = 0; i < FACADE_STYLES.length; i++) materials[`bg${i}`].emissiveIntensity = mix(a.towers, b.towers, t);
        skyline.material.color.setScalar(mix(a.skyline, b.skyline, t));
        atmosphere.uHazeTint.value.set(...a.haze.map((value, i) => mix(value, b.haze[i], t)));
    }

    function setAmbience(name) {
        if (!AMBIENCES[name]) return false;
        ambience = AMBIENCES[name];
        currentDusk = -1;
        setDusk(lastDusk);
        return true;
    }
    let highQuality = true;
    setDusk(0);

    function update(camera, focus) {
        atmosphere.uTime.value = performance.now() / 1000;
        sun.target.position.set(focus.x, 0, focus.z - 3);
        sun.position.copy(sun.target.position).addScaledVector(SUN_LIGHT, 50);
        goldFill.target.position.set(focus.x, 0, focus.z);
        goldFill.position.copy(goldFill.target.position).add(GOLD_LIGHT);
        skyline.position.set(camera.position.x * 0.85, 60, camera.position.z - 640);
        // Detailed blocks near the camera, light versions further away.
        for (const chunk of active) {
            const near = Math.max(0, Math.abs(chunk.position.z - camera.position.z) - HALF) < lodDistance;
            const { hi, lo } = chunk.userData.lod;
            if (hi.visible !== near) {
                hi.visible = near;
                lo.visible = !near;
            }
        }
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
        highQuality = high;
        currentDusk = -1;
        setDusk(lastDusk);
        lodDistance = high ? (mobile ? 50 : 75) : (mobile ? 30 : 50);
    }

    return {
        acquireChunk, releaseChunk, createObstacle, update, setDusk, setAmbience, setQuality, reseed, sharedMaterials, sun,
        crossings, parkedNear, takeParked, createCar, carModels: Object.keys(cars),
        ambiences: Object.keys(AMBIENCES),
        stats: () => variants.map((variant) => ({
            theme: variant.theme,
            hi: variant.hi.reduce((sum, spec) => sum + spec.geometry.attributes.position.count / 3, 0),
            lo: variant.lo.reduce((sum, spec) => sum + spec.geometry.attributes.position.count / 3, 0),
            draws: variant.hi.length
        }))
    };
}
