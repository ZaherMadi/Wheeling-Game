// Sculpted 3D clothing geometry builders (torso, hood, zipper placket, snaps, cuffs,
// short-sleeve biceps, multi-baffle puffer sleeves, tailored pants) for boy & girl skeletons.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getGarmentMaterialSet } from './clothing-pbr.js';

const UP_REF = new THREE.Vector3(0, 1, 0);

function blendSeamNormals(geometry, segments, rows) {
    if (!geometry?.attributes?.normal) return geometry;
    const normal = geometry.attributes.normal;
    for (let j = 0; j < rows; j++) {
        const b = segments * rows + j;
        if (b >= normal.count) break;
        const x = normal.getX(j) + normal.getX(b);
        const y = normal.getY(j) + normal.getY(b);
        const z = normal.getZ(j) + normal.getZ(b);
        const len = Math.hypot(x, y, z) || 1;
        normal.setXYZ(j, x / len, y / len, z / len);
        normal.setXYZ(b, x / len, y / len, z / len);
    }
    return geometry;
}

function makeTransform(px, py, pz, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    return new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, pz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(sx, sy, sz)
    );
}

// Evaluate piecewise-linear radius profile at normalized height t in [0, 1].
function evalProfile(table, t) {
    if (t <= table[0][0]) return table[0][1];
    const last = table[table.length - 1];
    if (t >= last[0]) return last[1];
    for (let i = 1; i < table.length; i++) {
        const [t0, r0] = table[i - 1];
        const [t1, r1] = table[i];
        if (t <= t1) {
            const k = (t - t0) / Math.max(1e-5, t1 - t0);
            const sm = k * k * (3 - 2 * k);
            return r0 + (r1 - r0) * sm;
        }
    }
    return last[1];
}

// Compute bust displacement matching rider.js GIRL silhouette, softer on thick puffers.
function girlBustDisplacement(x, y, puffScale = 1) {
    const across = 0.074;
    const height = 0.35;
    const depth = 0.052 * puffScale;
    const lobe = (d) => Math.exp(-((d / 0.056) ** 2));
    const a = lobe(x - across);
    const b = lobe(x + across);
    const dy = y - height;
    return depth * (a + b - a * b) * Math.exp(-((dy / (dy < 0 ? 0.045 : 0.08)) ** 2));
}

// Build a sculpted 3D torso shell using LatheGeometry (phiStart=PI -> u=0.5 front, u=0/1 back)
// with uniform vertical steps so UV rows align 1:1 with canvas seam/pattern coordinates.
function createSculptedTorso({
    girl = false,
    archetype = 'tracksuit',
    rows = 36,
    segments = 40
}) {
    const isOversize = archetype === 'puffer-oversize';
    const isCheck = archetype === 'puffer-check';
    const isJersey = archetype === 'jersey';
    const isFleece = archetype === 'fleece';

    const baseTable = girl
        ? [
            [0.0, 0.175],
            [0.10, 0.184],
            [0.24, 0.160],
            [0.42, 0.138],
            [0.56, 0.155],
            [0.70, 0.165],
            [0.82, 0.158],
            [0.92, 0.125],
            [1.0, 0.088]
        ]
        : [
            [0.0, 0.154],
            [0.16, 0.164],
            [0.40, 0.180],
            [0.64, 0.190],
            [0.80, 0.180],
            [0.91, 0.145],
            [1.0, 0.095]
        ];

    const yMin = isCheck ? 0.065 : 0.025;
    const yMax = isJersey ? 0.56 : (isOversize || isCheck ? 0.575 : 0.57);
    const sx = (girl ? 1.15 : 1.22) * (isOversize ? 1.18 : isCheck ? 1.12 : isJersey ? 0.99 : 1.04);
    const sz = (girl ? 0.91 : 0.91) * (isOversize ? 1.22 : isCheck ? 1.15 : isJersey ? 0.99 : 1.04);

    const points = [];
    for (let j = 0; j <= rows; j++) {
        const t = j / rows;
        let r = evalProfile(baseTable, t);

        if (isOversize) {
            // 5 fluffy quilted compartments + boxy silhouette (valleys aligned to t=0.18,0.38,0.58,0.78)
            r += 0.022 * (1 - t * 0.25);
            const baffles = [0.18, 0.38, 0.58, 0.78];
            let valley = 0;
            for (const b of baffles) valley += Math.exp(-(((t - b) / 0.028) ** 2));
            const puff = Math.max(0, 1 - valley * 1.1);
            r += puff * 0.017 - valley * 0.011;
        } else if (isCheck) {
            // 6 sharp horizontal puffer compartments (valleys aligned to t=0.15,0.32,0.49,0.66,0.83)
            r += 0.014;
            const baffles = [0.15, 0.32, 0.49, 0.66, 0.83];
            let valley = 0;
            for (const b of baffles) valley += Math.exp(-(((t - b) / 0.024) ** 2));
            const puff = Math.max(0, 1 - valley * 1.15);
            r += puff * 0.016 - valley * 0.012;
        } else if (isFleece) {
            r += 0.008;
        }

        const y = yMin + t * (yMax - yMin);
        points.push(new THREE.Vector2(Math.max(0.02, r), y));
    }

    const geometry = new THREE.LatheGeometry(points, segments, Math.PI, Math.PI * 2);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const origX = pos.getX(i);
        const origY = pos.getY(i);
        const origZ = pos.getZ(i);
        let x = origX * sx;
        let z = origZ * sz;

        // Slight square-off & compression folds around the chest & waist
        const t = Math.max(0, Math.min(1, (origY - yMin) / Math.max(1e-4, yMax - yMin)));
        const angle = Math.atan2(origX, origZ);
        const fold = Math.sin(angle * 4 + t * 9.5) * 0.0022 * (isJersey ? 0.55 : 1.0);
        const rLen = Math.hypot(x, z) || 1;
        x += (x / rLen) * fold;
        z += (z / rLen) * fold;

        if (girl && z > 0) {
            const k = Math.min(1, Math.max(0, (z / Math.hypot(x, z) - 0.18) / 0.55));
            const puffScale = isOversize ? 0.45 : isCheck ? 0.55 : 1.0;
            z += girlBustDisplacement(x, origY, puffScale) * k * k * (3 - 2 * k);
        }

        pos.setXYZ(i, x, origY, z);
    }
    geometry.computeVertexNormals();
    blendSeamNormals(geometry, segments, points.length);
    return geometry;
}

// Build shoulder/chest volume mesh + stand-up collar + sculpted hood + 3D zipper pull & snaps.
function buildTorsoAttachmentGroup({
    archetype,
    girl,
    mats
}) {
    const group = new THREE.Group();
    const isOversize = archetype === 'puffer-oversize';
    const isCheck = archetype === 'puffer-check';
    const isJersey = archetype === 'jersey';
    const isFleece = archetype === 'fleece';
    const isPuffer = isOversize || isCheck;

    // 1. Main sculpted torso shell
    const torsoGeo = createSculptedTorso({ girl, archetype });
    const torsoMesh = new THREE.Mesh(torsoGeo, mats.torso.mat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    group.add(torsoMesh);

    // Pelvis / hip closure matching trousers so hip joints never expose gaps at any ride or walk angle
    const hipsCover = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mats.pants.mat);
    hipsCover.position.set(0, 0.032, girl ? -0.01 : 0);
    hipsCover.scale.set(girl ? 0.224 : 0.202, girl ? 0.162 : 0.15, girl ? 0.198 : 0.172);
    hipsCover.castShadow = true;
    group.add(hipsCover);

    // Bottom pelvic closure cap inside jacket so camera below never sees hollow underside
    const capRadius = girl ? 0.185 : 0.165;
    const bottomCap = new THREE.Mesh(
        new THREE.CircleGeometry(capRadius, 20).rotateX(Math.PI / 2),
        mats.cuffMat || mats.accentMat
    );
    bottomCap.position.y = isCheck ? 0.07 : 0.03;
    bottomCap.scale.set(girl ? 1.15 : 1.22, 1, 0.92);
    group.add(bottomCap);

    // 2. Sculpted quilted/rounded shoulder caps
    const shoulderX = (girl ? 0.18 : 0.205) * (isOversize ? 1.14 : isCheck ? 1.09 : 1.02);
    const shoulderY = isJersey ? 0.445 : 0.465;
    const capMat = isOversize || isCheck ? mats.torso.mat : mats.sleeveL.mat;
    for (const side of [-1, 1]) {
        const capGeo = new THREE.SphereGeometry(isPuffer ? 0.105 : 0.084, 16, 12);
        const cap = new THREE.Mesh(capGeo, side < 0 && mats.sleeveR ? mats.sleeveR.mat : capMat);
        cap.position.set(side * shoulderX, shoulderY, 0);
        cap.scale.set(isPuffer ? 1.08 : 0.96, isPuffer ? 0.96 : 0.9, isPuffer ? 1.06 : 0.95);
        cap.castShadow = true;
        group.add(cap);
    }

    // 3. Collar & Neck Roll (thick stand-up padded collar on puffers/tracksuits, crisp crew rib on jersey)
    if (isJersey) {
        const collar = new THREE.Mesh(
            new THREE.TorusGeometry(girl ? 0.095 : 0.105, 0.024, 10, 24),
            mats.accentMat
        );
        collar.rotation.x = Math.PI / 2 - 0.18;
        collar.position.set(0, 0.562, 0.004);
        collar.scale.set(1.06, 0.95, 1.0);
        group.add(collar);
    } else {
        // High padded stand-up collar wrapping the neck
        const collarPoints = [];
        const ch = isOversize ? 0.125 : isCheck ? 0.11 : 0.095;
        const cTopR = girl ? 0.105 : 0.112;
        const puffK = isOversize ? 0.028 : isCheck ? 0.022 : 0.012;
        for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const r = cTopR + Math.sin(t * Math.PI) * puffK;
            collarPoints.push(new THREE.Vector2(r, t * ch));
        }
        const collarGeo = new THREE.LatheGeometry(collarPoints, 28, Math.PI, Math.PI * 2);
        blendSeamNormals(collarGeo, 28, collarPoints.length);
        const collarMesh = new THREE.Mesh(collarGeo, mats.hood?.mat || mats.torso.mat);
        collarMesh.position.set(0, 0.54, 0.0);
        collarMesh.scale.set(isPuffer ? 1.15 : 1.04, 1, isPuffer ? 1.08 : 0.98);
        collarMesh.castShadow = true;
        group.add(collarMesh);

        // Structured hood resting behind shoulders (compact in -z for girl so her hair rests on top!)
        const hoodGroup = new THREE.Group();
        const hoodY = isOversize ? 0.595 : 0.585;
        const hoodZ = girl ? -0.105 : (isOversize ? -0.135 : -0.118);
        hoodGroup.position.set(0, hoodY, hoodZ);
        hoodGroup.rotation.x = isOversize ? -1.82 : -1.92;

        const hoodOuter = new THREE.Mesh(
            new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
            mats.hood?.mat || mats.torso.mat
        );
        const hScale = isOversize
            ? [girl ? 0.185 : 0.215, 0.145, girl ? 0.118 : 0.138]
            : isCheck
                ? [girl ? 0.172 : 0.195, 0.13, girl ? 0.11 : 0.125]
                : [girl ? 0.16 : 0.178, 0.115, 0.102];
        hoodOuter.scale.set(...hScale);
        hoodOuter.castShadow = true;
        hoodGroup.add(hoodOuter);

        // Dark matte inner hood lining visible along the fold/rim (signature detail of Check & Oversize puffers)
        const hoodInner = new THREE.Mesh(
            new THREE.SphereGeometry(0.92, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.54),
            mats.accentMat
        );
        hoodInner.scale.set(hScale[0] * 0.9, hScale[1] * 0.85, hScale[2] * 0.86);
        hoodInner.position.set(0, 0.008, 0.008);
        hoodGroup.add(hoodInner);

        // Hood rolled trim ring
        const hoodRim = new THREE.Mesh(
            new THREE.TorusGeometry(hScale[0] * 0.84, isPuffer ? 0.026 : 0.017, 8, 22),
            mats.hood?.mat || mats.torso.mat
        );
        hoodRim.rotation.x = Math.PI / 2;
        hoodRim.position.y = -0.006;
        hoodRim.scale.set(1, 0.72, 1);
        hoodGroup.add(hoodRim);
        group.add(hoodGroup);

        // Check puffer signature: two front shoulder snap-button flaps framing the collar
        if (isCheck) {
            const snapMat = mats.snapMat || mats.accentMat;
            for (const side of [-1, 1]) {
                const flap = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.082, 0.024), mats.hood.mat);
                flap.position.set(side * 0.118, 0.515, 0.095);
                flap.rotation.set(-0.35, side * 0.25, side * -0.18);
                flap.castShadow = true;
                group.add(flap);

                const snap = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.009, 14), snapMat);
                snap.rotation.x = Math.PI / 2;
                snap.position.set(side * 0.128, 0.498, 0.112);
                group.add(snap);
            }
        }
    }

    // 4. Physical 3D metallic zipper slider tab at upper chest / collar (track follows curved PBR torso UV)
    if (!isJersey && !isFleece) {
        const neckZ = (girl ? 0.112 : 0.126) * (isOversize ? 1.24 : isCheck ? 1.16 : 1.03);
        const pullMat = mats.snapMat || mats.accentMat;
        const slider = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.018, 0.012), pullMat);
        slider.position.set(0, 0.542, neckZ);
        group.add(slider);

        const pull = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.026, 0.008), pullMat);
        pull.position.set(0, 0.524, neckZ + 0.005);
        pull.rotation.x = -0.22;
        group.add(pull);
    }

    // 5. Hem band at bottom waist of jacket/jersey
    const hemY = isCheck ? 0.082 : 0.045;
    const hemR = girl ? 0.182 : 0.165;
    const hemGeo = new THREE.CylinderGeometry(
        hemR * (isOversize ? 1.04 : 1.0),
        hemR * (isOversize ? 0.98 : 0.98),
        0.048,
        28,
        1,
        true
    );
    const hemMat = isCheck || isOversize ? mats.torso.mat : (mats.cuffMat || mats.accentMat);
    const hemMesh = new THREE.Mesh(hemGeo, hemMat);
    hemMesh.position.y = hemY;
    hemMesh.scale.set(
        (girl ? 1.15 : 1.22) * (isOversize ? 1.16 : isCheck ? 1.11 : 1.02),
        1,
        0.92 * (isOversize ? 1.2 : isCheck ? 1.14 : 1.02)
    );
    group.add(hemMesh);

    return group;
}

// Build a LatheGeometry limb segment from t=0 (proximal at y=-half) to t=1 (distal at y=+half).
function makeLatheSegment(length, rows, segments, radiusFn) {
    const half = length / 2;
    const points = [];
    for (let j = 0; j <= rows; j++) {
        const t = j / rows;
        const y = -half + t * length;
        points.push(new THREE.Vector2(Math.max(0.008, radiusFn(t)), y));
    }
    const geo = new THREE.LatheGeometry(points, segments, 0, Math.PI * 2);
    blendSeamNormals(geo, segments, points.length);
    return geo;
}

// Cap open ends slightly rounded inside Lathe so joints never look open.
function buildLimbGeometry(archetype, kind, girl) {
    const isUpperArm = kind === 'upperArm';
    const isLowerArm = kind === 'lowerArm';
    const isUpperLeg = kind === 'upperLeg';
    const isLowerLeg = kind === 'lowerLeg';
    const length = isUpperArm || isLowerArm ? 0.34 : isUpperLeg ? 0.44 : 0.46;
    const gScale = girl ? 0.78 : 1.0;

    if (archetype === 'puffer-oversize' || archetype === 'puffer-check') {
        const extra = archetype === 'puffer-oversize' ? 1.0 : 0.85;
        if (isUpperArm) {
            return {
                geometry: makeLatheSegment(length, 24, 16, (t) => {
                    const base = (0.088 - t * 0.008) * (girl ? 0.86 : 1.0) * (1 + extra * 0.14);
                    // Three quilted pillow compartments along segment
                    const q = Math.abs(Math.sin(t * Math.PI * 3));
                    return t < 0.06 || t > 0.94 ? base * 0.74 : base + q * 0.015 * extra;
                }),
                multi: false
            };
        }
        if (isLowerArm) {
            // 3 quilted compartments (0..0.85) + narrow dark inner wrist cuff (0.85..1.0)
            const half = length / 2;
            const sleeveEndY = -half + 0.85 * length;
            const pSleeve = [];
            for (let j = 0; j <= 18; j++) {
                const lt = j / 18;
                const t = lt * 0.85;
                const base = (0.08 - t * 0.013) * (girl ? 0.84 : 1.0) * (1 + extra * 0.12);
                const q = Math.abs(Math.sin((t / 0.85) * Math.PI * 3));
                pSleeve.push(new THREE.Vector2(t < 0.05 ? base * 0.78 : base + q * 0.014 * extra, -half + t * length));
            }
            const gSleeve = new THREE.LatheGeometry(pSleeve, 16, 0, Math.PI * 2);
            blendSeamNormals(gSleeve, 16, pSleeve.length);

            const cuffR = (0.052) * (girl ? 0.86 : 1.0);
            const pCuff = [];
            for (let j = 0; j <= 6; j++) {
                const lt = j / 6;
                const y = sleeveEndY + lt * (length * 0.15);
                pCuff.push(new THREE.Vector2(lt > 0.9 ? cuffR * 0.6 : cuffR, y));
            }
            const gCuff = new THREE.LatheGeometry(pCuff, 14, 0, Math.PI * 2);
            blendSeamNormals(gCuff, 14, pCuff.length);
            const merged = mergeGeometries([gSleeve, gCuff], true);
            gSleeve.dispose();
            gCuff.dispose();
            return { geometry: merged, multi: 'cuff' };
        }
    }

    if (archetype === 'jersey' && (isUpperArm || isLowerArm)) {
        if (isUpperArm) {
            const half = length / 2;
            // Top 62% = jersey short sleeve with slight flare and cuff hem; bottom 38% = bare sculpted bicep skin
            const pSleeve = [];
            const rowsS = 14;
            for (let j = 0; j <= rowsS; j++) {
                const t = (j / rowsS) * 0.62;
                const r = ((0.082 - t * 0.008) * (girl ? 0.84 : 1.0)) + (t > 0.56 ? 0.005 : 0);
                pSleeve.push(new THREE.Vector2(t < 0.05 ? r * 0.72 : r, -half + t * length));
            }
            const gSleeve = new THREE.LatheGeometry(pSleeve, 16, 0, Math.PI * 2);
            blendSeamNormals(gSleeve, 16, pSleeve.length);

            const pSkin = [];
            const rowsK = 10;
            for (let j = 0; j <= rowsK; j++) {
                const u = j / rowsK;
                const t = 0.55 + u * 0.45;
                const r = girl
                    ? (0.054 - u * 0.009)
                    : (0.062 - u * 0.009);
                pSkin.push(new THREE.Vector2(t > 0.94 ? r * 0.7 : r, -half + t * length));
            }
            const gSkin = new THREE.LatheGeometry(pSkin, 14, 0, Math.PI * 2);
            blendSeamNormals(gSkin, 14, pSkin.length);
            const merged = mergeGeometries([gSleeve, gSkin], true);
            gSleeve.dispose();
            gSkin.dispose();
            return { geometry: merged, multi: 'skin' };
        }
        if (isLowerArm) {
            return {
                geometry: makeLatheSegment(length, 14, 14, (t) => {
                    const base = girl ? (0.048 - t * 0.015) : (0.057 - t * 0.015);
                    return t < 0.06 || t > 0.94 ? base * 0.72 : base + Math.sin(t * Math.PI) * 0.005;
                }),
                multi: 'allSkin'
            };
        }
    }

    // Tracksuit / Fleece sleeves
    if (isUpperArm) {
        return {
            geometry: makeLatheSegment(length, 16, 14, (t) => {
                const base = (0.076 - t * 0.008) * (girl ? 0.82 : 1.0);
                return t < 0.05 || t > 0.95 ? base * 0.72 : base + Math.sin(t * Math.PI * 2) * 0.0025;
            }),
            multi: false
        };
    }
    if (isLowerArm) {
        const half = length / 2;
        const pSleeve = [];
        for (let j = 0; j <= 14; j++) {
            const t = (j / 14) * 0.87;
            const base = (0.068 - t * 0.012) * (girl ? 0.82 : 1.0);
            pSleeve.push(new THREE.Vector2(t < 0.05 ? base * 0.74 : base, -half + t * length));
        }
        const gSleeve = new THREE.LatheGeometry(pSleeve, 14, 0, Math.PI * 2);
        blendSeamNormals(gSleeve, 14, pSleeve.length);
        const cuffR = 0.048 * (girl ? 0.82 : 1.0);
        const pCuff = [
            new THREE.Vector2(cuffR, -half + 0.86 * length),
            new THREE.Vector2(cuffR * 0.98, -half + 0.95 * length),
            new THREE.Vector2(cuffR * 0.65, half)
        ];
        const gCuff = new THREE.LatheGeometry(pCuff, 14, 0, Math.PI * 2);
        blendSeamNormals(gCuff, 14, pCuff.length);
        const merged = mergeGeometries([gSleeve, gCuff], true);
        gSleeve.dispose();
        gCuff.dispose();
        return { geometry: merged, multi: 'cuff' };
    }

    // Trousers: tailored athletic fit (slightly looser on streetwear puffers, tapered on tracksuits)
    const pantBulk = archetype === 'puffer-oversize' ? 1.12 : 1.0;
    if (isUpperLeg) {
        return {
            geometry: makeLatheSegment(length, 18, 16, (t) => {
                const base = girl
                    ? (0.107 - t * 0.036) * (0.98 + (pantBulk - 1) * 0.8)
                    : (0.096 - t * 0.014) * pantBulk;
                return t < 0.05 || t > 0.95 ? base * 0.72 : base + Math.sin(t * Math.PI * 2) * 0.002;
            }),
            multi: false
        };
    }
    if (isLowerLeg) {
        return {
            geometry: makeLatheSegment(length, 18, 16, (t) => {
                const base = girl
                    ? (0.068 - t * 0.025) * pantBulk
                    : (0.084 - t * 0.024) * pantBulk;
                const ankleRib = t > 0.88 ? -0.006 : 0;
                return Math.max(0.02, (t < 0.05 || t > 0.96 ? base * 0.68 : base + ankleRib));
            }),
            multi: false
        };
    }

    return {
        geometry: makeLatheSegment(length, 12, 12, () => 0.06 * gScale),
        multi: false
    };
}

const archetypesByGarment = {
    'puffer-grey-5hc': 'puffer-oversize',
    'puffer-check-5hc': 'puffer-check',
    'tracksuit-bvb-5hc': 'tracksuit',
    'tracksuit-volt-5hc': 'tracksuit',
    'tracksuit-royal-5hc': 'tracksuit',
    'jersey-bianconero-5hc': 'jersey',
    'fleece-noir-or': 'fleece',
    'fleece-glacier': 'fleece',
    'fleece-venom': 'fleece',
    'fleece-crimson': 'fleece'
};

const packageCache = new Map();

export function getGarmentPackage(garmentId) {
    if (!garmentId || !archetypesByGarment[garmentId]) return null;
    if (packageCache.has(garmentId)) return packageCache.get(garmentId);

    const archetype = archetypesByGarment[garmentId];
    const mats = getGarmentMaterialSet(garmentId);
    if (!mats) return null;

    const armMatRight = mats.sleeveR.mat;
    const armMatLeft = mats.sleeveL.mat;

    const resolveLimbMaterial = (kind, multi, isRightSide) => {
        const sMat = isRightSide ? armMatRight : armMatLeft;
        const cMat = isRightSide && mats.cuffMatR ? mats.cuffMatR : mats.cuffMat;
        if (multi === 'cuff') return [sMat, cMat];
        if (multi === 'skin') return [sMat, mats.skinMat];
        if (multi === 'allSkin') return mats.skinMat;
        if (kind === 'upperArm' || kind === 'lowerArm') return sMat;
        return mats.pants.mat;
    };

    const makeBodyVariant = (girl) => {
        const torsoGroup = buildTorsoAttachmentGroup({ archetype, girl, mats });
        const ua = buildLimbGeometry(archetype, 'upperArm', girl);
        const la = buildLimbGeometry(archetype, 'lowerArm', girl);
        const ul = buildLimbGeometry(archetype, 'upperLeg', girl);
        const ll = buildLimbGeometry(archetype, 'lowerLeg', girl);

        return {
            torsoGroup,
            limbs: {
                upperArmGeo: ua.geometry,
                lowerArmGeo: la.geometry,
                upperLegGeo: ul.geometry,
                lowerLegGeo: ll.geometry,
                upperArmMat: [resolveLimbMaterial('upperArm', ua.multi, true), resolveLimbMaterial('upperArm', ua.multi, false)],
                lowerArmMat: [resolveLimbMaterial('lowerArm', la.multi, true), resolveLimbMaterial('lowerArm', la.multi, false)],
                upperLegMat: resolveLimbMaterial('upperLeg', ul.multi, false),
                lowerLegMat: resolveLimbMaterial('lowerLeg', ll.multi, false)
            }
        };
    };

    const pkg = {
        id: garmentId,
        archetype,
        mats,
        boy: makeBodyVariant(false),
        girl: makeBodyVariant(true),
        // Preserve UP_REF unused check cleanly if ever queried
        up: UP_REF
    };

    packageCache.set(garmentId, pkg);
    return pkg;
}
