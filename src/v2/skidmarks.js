// Tyre marks on the road (free roam drift): dark strips laid behind the
// rear wheel as it slides. One instanced mesh, the oldest strips reused
// once the pool is full, so a long drift costs nothing more.
import * as THREE from 'three';

export function createSkidMarks(scene, { max = 700 } = {}) {
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0x0a0a0b, transparent: true, opacity: 0.62, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const mesh = new THREE.InstancedMesh(geometry, material, max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    const dummy = new THREE.Object3D();
    let next = 0;
    let filled = 0;
    let last = null;

    // A point of the mark (rear wheel on the road); width in metres.
    function add(x, z, width = 0.17) {
        if (!last) {
            last = { x, z };
            return;
        }
        const dx = x - last.x;
        const dz = z - last.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.08) return;
        // A jump (teleport, new street): start a new mark.
        if (length > 3) {
            last = { x, z };
            return;
        }
        dummy.position.set((x + last.x) / 2, 0.018, (z + last.z) / 2);
        dummy.rotation.set(0, Math.atan2(dx, dz), 0);
        // A touch longer than the gap: no seams between strips.
        dummy.scale.set(width, 1, length + 0.04);
        dummy.updateMatrix();
        mesh.setMatrixAt(next, dummy.matrix);
        next = (next + 1) % max;
        filled = Math.min(max, filled + 1);
        mesh.count = filled;
        mesh.instanceMatrix.needsUpdate = true;
        last = { x, z };
    }

    // The tyre grips again: the next mark starts apart.
    function lift() {
        last = null;
    }

    function clear() {
        next = 0;
        filled = 0;
        mesh.count = 0;
        last = null;
    }

    return { add, lift, clear, mesh };
}
