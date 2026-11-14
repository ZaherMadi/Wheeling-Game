// Free roam secret: a hang glider (yellow and black, 5HC colours). The
// sail is a delta of two triangles over a keel; the control bar hangs
// under it, the rider holds it. Origin: where the rider's hands are.
import * as THREE from 'three';

export function createHangGlider() {
    const group = new THREE.Group();
    const sail = new THREE.BufferGeometry();
    // nose, left tip, keel end, right tip (metres, +z forward)
    const nose = [0, 1.75, 1.9];
    const left = [-5.1, 1.45, -1.25];
    const tail = [0, 1.85, -1.55];
    const right = [5.1, 1.45, -1.25];
    sail.setAttribute('position', new THREE.Float32BufferAttribute([...nose, ...left, ...tail, ...nose, ...tail, ...right], 3));
    const yellow = new THREE.Color(0xf6c416);
    const dark = new THREE.Color(0x15161a);
    sail.setAttribute('color', new THREE.Float32BufferAttribute([
        ...yellow.toArray(), ...yellow.toArray(), ...dark.toArray(),
        ...dark.toArray(), ...dark.toArray(), ...yellow.toArray()
    ], 3));
    sail.computeVertexNormals();
    const sailMesh = new THREE.Mesh(sail, new THREE.MeshStandardMaterial({
        vertexColors: true, side: THREE.DoubleSide, roughness: 0.7
    }));
    sailMesh.castShadow = true;
    group.add(sailMesh);

    const tube = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 });
    const bar = (from, to, radius = 0.025) => {
        const a = new THREE.Vector3(...from);
        const b = new THREE.Vector3(...to);
        const length = a.distanceTo(b);
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6), tube);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        mesh.castShadow = true;
        group.add(mesh);
    };
    bar(nose, tail, 0.035);
    bar(left, right, 0.03);
    // Control bar (A-frame) and the hang strap.
    bar([0, 1.8, 0.2], [-0.75, 0.05, 0.25]);
    bar([0, 1.8, 0.2], [0.75, 0.05, 0.25]);
    bar([-0.75, 0.05, 0.25], [0.75, 0.05, 0.25], 0.022);
    bar([0, 1.8, -0.05], [0, 0.35, -0.25], 0.012);
    return group;
}
