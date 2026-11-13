// Geometry batching for the realistic version. Every block of the street is
// assembled from thousands of small parts; they are written straight into flat
// arrays and uploaded as one vertex-coloured mesh per material (one draw call).
import * as THREE from 'three';

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const euler = new THREE.Euler();
const normalMatrix = new THREE.Matrix3();
const tmpColor = new THREE.Color();
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();
const faceNormal = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

// Returns a shared matrix: use it immediately, do not keep it.
export function transform(px, py, pz, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    position.set(px, py, pz);
    quaternion.setFromEuler(euler.set(rx, ry, rz));
    scale.set(sx, sy, sz);
    return matrix.compose(position, quaternion, scale);
}

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Flat, non-indexed copy of a primitive, computed once per geometry.
const flatCache = new WeakMap();
function flatten(geometry) {
    let entry = flatCache.get(geometry);
    if (entry) return entry;
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const positions = Float32Array.from(source.attributes.position.array);
    const normals = Float32Array.from(source.attributes.normal.array);
    const uvs = source.attributes.uv ? Float32Array.from(source.attributes.uv.array) : null;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < positions.length; i += 3) {
        minY = Math.min(minY, positions[i]);
        maxY = Math.max(maxY, positions[i]);
    }
    if (source !== geometry) source.dispose();
    entry = { positions, normals, uvs, count: positions.length / 3, minY, maxY };
    flatCache.set(geometry, entry);
    return entry;
}

export class Batch {
    constructor() {
        this.position = [];
        this.normal = [];
        this.uv = [];
        this.color = [];
        this.base = null;
    }

    // Rigid transform (rotation + translation) applied to everything added
    // afterwards. Lets a module be written once in a local frame and placed
    // on either side of the street.
    setBase(base) {
        this.base = base ? base.elements.slice() : null;
        return this;
    }

    vertex(x, y, z, nx, ny, nz, u, v, r, g, b) {
        const e = this.base;
        if (e) {
            this.position.push(
                e[0] * x + e[4] * y + e[8] * z + e[12],
                e[1] * x + e[5] * y + e[9] * z + e[13],
                e[2] * x + e[6] * y + e[10] * z + e[14]
            );
            this.normal.push(
                e[0] * nx + e[4] * ny + e[8] * nz,
                e[1] * nx + e[5] * ny + e[9] * nz,
                e[2] * nx + e[6] * ny + e[10] * nz
            );
        } else {
            this.position.push(x, y, z);
            this.normal.push(nx, ny, nz);
        }
        this.uv.push(u, v);
        this.color.push(r, g, b);
    }

    // shade(y01) -> brightness multiplier along the part's height.
    // uvRect remaps the primitive's 0..1 UVs into an atlas cell.
    add(geometry, mat, color, shade, uvRect) {
        const source = flatten(geometry);
        const e = mat.elements;
        const n = normalMatrix.getNormalMatrix(mat).elements;
        tmpColor.set(color);
        const { r, g, b } = tmpColor;
        const { positions, normals, uvs, minY, maxY } = source;
        const spanY = maxY - minY || 1;
        for (let i = 0; i < source.count; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];
            const nx = normals[i * 3];
            const ny = normals[i * 3 + 1];
            const nz = normals[i * 3 + 2];
            let tx = n[0] * nx + n[3] * ny + n[6] * nz;
            let ty = n[1] * nx + n[4] * ny + n[7] * nz;
            let tz = n[2] * nx + n[5] * ny + n[8] * nz;
            const length = Math.hypot(tx, ty, tz) || 1;
            tx /= length; ty /= length; tz /= length;
            const k = shade ? shade((y - minY) / spanY) : 1;
            let u = uvs ? uvs[i * 2] : 0;
            let v = uvs ? uvs[i * 2 + 1] : 0;
            if (uvRect) {
                u = uvRect[0] + u * (uvRect[2] - uvRect[0]);
                v = uvRect[1] + v * (uvRect[3] - uvRect[1]);
            }
            this.vertex(
                e[0] * x + e[4] * y + e[8] * z + e[12],
                e[1] * x + e[5] * y + e[9] * z + e[13],
                e[2] * x + e[6] * y + e[10] * z + e[14],
                tx, ty, tz, u, v, r * k, g * k, b * k
            );
        }
        return this;
    }

    // Free-form quad a-b-c-d, counter-clockwise seen from the front.
    // uv = [u0, v0, u1, v1]: a gets (u0, v0), c gets (u1, v1).
    quad(a, b, c, d, color, uv) {
        edgeA.subVectors(b, a);
        edgeB.subVectors(d, a);
        faceNormal.crossVectors(edgeA, edgeB).normalize();
        tmpColor.set(color);
        const { r, g, b: blue } = tmpColor;
        const u0 = uv ? uv[0] : 0;
        const v0 = uv ? uv[1] : 0;
        const u1 = uv ? uv[2] : 1;
        const v1 = uv ? uv[3] : 1;
        const { x: nx, y: ny, z: nz } = faceNormal;
        this.vertex(a.x, a.y, a.z, nx, ny, nz, u0, v0, r, g, blue);
        this.vertex(b.x, b.y, b.z, nx, ny, nz, u1, v0, r, g, blue);
        this.vertex(c.x, c.y, c.z, nx, ny, nz, u1, v1, r, g, blue);
        this.vertex(a.x, a.y, a.z, nx, ny, nz, u0, v0, r, g, blue);
        this.vertex(c.x, c.y, c.z, nx, ny, nz, u1, v1, r, g, blue);
        this.vertex(d.x, d.y, d.z, nx, ny, nz, u0, v1, r, g, blue);
        return this;
    }

    // Axis-aligned rectangles, the bulk of a street. All take the two corner
    // coordinates on the plane and an optional [u0, v0, u1, v1].
    // Horizontal, facing up.
    floor(x0, z0, x1, z1, y, color, uv) {
        return this.quad(v3(x0, y, z1), v3(x1, y, z1), v3(x1, y, z0), v3(x0, y, z0), color, uv);
    }

    // Vertical, in the XY plane at depth z. facing = +1 looks towards +z.
    wallX(x0, y0, x1, y1, z, facing, color, uv) {
        return facing > 0
            ? this.quad(v3(x0, y0, z), v3(x1, y0, z), v3(x1, y1, z), v3(x0, y1, z), color, uv)
            : this.quad(v3(x1, y0, z), v3(x0, y0, z), v3(x0, y1, z), v3(x1, y1, z), color, uv);
    }

    // Vertical, in the ZY plane at x. facing = +1 looks towards +x.
    wallZ(z0, y0, z1, y1, x, facing, color, uv) {
        return facing > 0
            ? this.quad(v3(x, y0, z1), v3(x, y0, z0), v3(x, y1, z0), v3(x, y1, z1), color, uv)
            : this.quad(v3(x, y0, z0), v3(x, y0, z1), v3(x, y1, z1), v3(x, y1, z0), color, uv);
    }

    // Horizontal, facing down (soffits, undersides).
    ceil(x0, z0, x1, z1, y, color, uv) {
        return this.quad(v3(x0, y, z0), v3(x1, y, z0), v3(x1, y, z1), v3(x0, y, z1), color, uv);
    }

    // Axis-aligned box with planar UVs in metres / scale, so tiling wall
    // textures stay continuous. faces: subset of 'xXyYzZ' (lower case = the
    // face looking towards minus that axis).
    block(x0, y0, z0, x1, y1, z1, color, scale = 1, faces = 'xXyYzZ') {
        const s = scale;
        if (faces.includes('x')) this.wallZ(z0, y0, z1, y1, x0, -1, color, [z0 / s, y0 / s, z1 / s, y1 / s]);
        if (faces.includes('X')) this.wallZ(z0, y0, z1, y1, x1, 1, color, [-z1 / s, y0 / s, -z0 / s, y1 / s]);
        if (faces.includes('z')) this.wallX(x0, y0, x1, y1, z0, -1, color, [-x1 / s, y0 / s, -x0 / s, y1 / s]);
        if (faces.includes('Z')) this.wallX(x0, y0, x1, y1, z1, 1, color, [x0 / s, y0 / s, x1 / s, y1 / s]);
        if (faces.includes('Y')) this.floor(x0, z0, x1, z1, y1, color, [x0 / s, -z1 / s, x1 / s, -z0 / s]);
        if (faces.includes('y')) this.ceil(x0, z0, x1, z1, y0, color, [x0 / s, z0 / s, x1 / s, z1 / s]);
        return this;
    }

    // Tapered tube through `points` (trunks, branches, bent poles).
    // radii: one per point. uvRect: atlas cell wrapped around the tube.
    tube(points, radii, color, sides = 6, uvRect = null, shades = null) {
        tmpColor.set(color);
        const { r, g, b } = tmpColor;
        const rings = [];
        const direction = new THREE.Vector3();
        const side = new THREE.Vector3();
        const up = new THREE.Vector3();
        const last = points.length - 1;
        for (let i = 0; i <= last; i++) {
            direction.subVectors(points[Math.min(last, i + 1)], points[Math.max(0, i - 1)]).normalize();
            side.crossVectors(direction, Math.abs(direction.y) > 0.92 ? X_AXIS : UP).normalize();
            up.crossVectors(direction, side);
            const ring = [];
            for (let j = 0; j <= sides; j++) {
                const angle = (j / sides) * Math.PI * 2;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const nx = side.x * cos + up.x * sin;
                const ny = side.y * cos + up.y * sin;
                const nz = side.z * cos + up.z * sin;
                ring.push([
                    points[i].x + nx * radii[i], points[i].y + ny * radii[i], points[i].z + nz * radii[i], nx, ny, nz
                ]);
            }
            rings.push(ring);
        }
        const u0 = uvRect ? uvRect[0] : 0;
        const u1 = uvRect ? uvRect[2] : 1;
        const v0 = uvRect ? uvRect[1] : 0;
        const v1 = uvRect ? uvRect[3] : 1;
        const put = (ringIndex, j) => {
            const p = rings[ringIndex][j];
            const k = shades ? shades[ringIndex] : 1;
            // Mirror V on every other ring so the texture never jumps.
            this.vertex(p[0], p[1], p[2], p[3], p[4], p[5],
                u0 + (u1 - u0) * (j / sides), ringIndex % 2 ? v1 : v0, r * k, g * k, b * k);
        };
        for (let i = 0; i < last; i++) {
            for (let j = 0; j < sides; j++) {
                put(i, j); put(i, j + 1); put(i + 1, j + 1);
                put(i, j); put(i + 1, j + 1); put(i + 1, j);
            }
        }
        return this;
    }

    get empty() {
        return this.position.length === 0;
    }

    get triangles() {
        return this.position.length / 9;
    }

    build() {
        if (this.empty) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
        geometry.computeBoundingSphere();
        // Pooled and reused for the whole session: never disposed with a block.
        geometry.userData.shared = true;
        this.position = [];
        this.normal = [];
        this.uv = [];
        this.color = [];
        return geometry;
    }
}

// Writes the same parts into several batches (detailed + distant versions).
const FORWARDED = ['add', 'quad', 'floor', 'ceil', 'wallX', 'wallZ', 'block', 'tube', 'vertex', 'setBase'];
export class Fanout {
    constructor(batches) {
        this.batches = batches;
    }
}
for (const name of FORWARDED) {
    Fanout.prototype[name] = function forward(...args) {
        for (const batch of this.batches) batch[name](...args);
        return this;
    };
}

// One batch per material key, in two levels of detail.
//   sink.hi[key]   detailed version only (small parts)
//   sink.lo[key]   distant version only (stand-ins)
//   sink.both[key] silhouettes shared by both
export class Sink {
    constructor(keys) {
        this.keys = keys;
        this.hi = {};
        this.lo = {};
        this.both = {};
        for (const key of keys) {
            this.hi[key] = new Batch();
            this.lo[key] = new Batch();
            this.both[key] = new Fanout([this.hi[key], this.lo[key]]);
        }
    }

    setBase(matrix) {
        for (const key of this.keys) {
            this.hi[key].setBase(matrix);
            this.lo[key].setBase(matrix);
        }
        return this;
    }

    // { key: geometry|null } for each level.
    build() {
        const hi = {};
        const lo = {};
        for (const key of this.keys) {
            hi[key] = this.hi[key].build();
            lo[key] = this.lo[key].build();
        }
        return { hi, lo };
    }
}

// The right side of the street is authored in world coordinates; the left
// side is the same authoring turned half a turn about the street centre
// (a rotation, not a mirror, so signs still read correctly).
const HALF_TURN = new THREE.Matrix4().makeRotationY(Math.PI);
const IDENTITY = new THREE.Matrix4();
export function sideMatrix(side) {
    return side > 0 ? IDENTITY : HALF_TURN;
}

// Facades are authored in a canonical frame: facade plane x = 0 looking
// towards -x, running along +z from 0 to its width, body towards +x.
// normal: the direction the facade looks in the street frame.
export function facadeMatrix(side, originX, originZ, normal = '-x') {
    const yaw = { '-x': 0, '+z': Math.PI / 2, '+x': Math.PI, '-z': -Math.PI / 2 }[normal];
    const local = new THREE.Matrix4().makeRotationY(yaw).setPosition(originX, 0, originZ);
    return new THREE.Matrix4().multiplyMatrices(sideMatrix(side), local);
}

// Shared primitives.
export const PRIMS = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    cylinder6: new THREE.CylinderGeometry(1, 1, 1, 6),
    taper: new THREE.CylinderGeometry(0.72, 1, 1, 8),
    cone: new THREE.CylinderGeometry(0.18, 1, 1, 10),
    spike: new THREE.CylinderGeometry(0, 1, 1, 8),
    disc: new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
    floor: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    facing: new THREE.PlaneGeometry(1, 1),
    blob: new THREE.IcosahedronGeometry(1, 1)
};
