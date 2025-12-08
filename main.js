import * as THREE from 'three';

const CONFIG = {
    laneWidth: 10,
    maxSpeed: 6.0,
    minSpeed: 0.0,
    baseAcceleration: 0.004,
    deceleration: 0.005,
    brakeForce: 0.03,
    lateralAccel: 0.04,
    lateralFriction: 0.92,
    maxLateralSpeed: 0.56,
    wheelieLift: 0.008,
    wheelieLiftFast: 0.012,
    gravity: 0.0015,
    balancePoint: 1.2,
    maxAngle: 1.6,
    sweetSpotWidth: 0.2,
    scoreMultiplier: 10,
    dayNightCycleDuration: 600,
    freeModeSpeed: 0.15,
    freeModeMaxSpeed: 3.0,
    freeModeAcceleration: 0.015,
    freeModeDeceleration: 0.01,
    freeModeBrakeForce: 0.04
};

let state = {
    isPlaying: false,
    isPaused: false,
    score: 0,
    highScore: parseInt(localStorage.getItem('wheelie_high_score')) || 0,
    speed: 0,
    distance: 0,
    gameTime: 0,
    bike: {
        angle: 0,
        angularVelocity: 0,
        lateralVelocity: 0,
        maxWheelieTimer: 0, // Timer for max wheelie in free mode
    },
    wheeliePercentage: 0, // Pourcentage d'inclinaison du wheeling (0-100%)
    wheelieTime: 0, // Temps passé en wheeling à plus de 50%
    angleMultiplier: 1.0, // Multiplicateur basé sur l'angle (x1 à x2)
    timeMultiplier: 1.0, // Multiplicateur progressif basé sur le temps (x2 à x5)
    currentMultiplier: 1.0, // Multiplicateur total (angle × temps)
    keys: {
        left: false,
        right: false,
        up: false,
        down: false,
        space: false,
    },
    obstacles: [],
    animatedObjects: [],
    graffitiList: [],
    trafficLightState: 0,
    trafficTimer: 0,
    trafficLights: [],
    clouds: [],
    birds: [],
    skidding: false,
    skidTimer: 0,
    smokeParticles: [],
    freeMode: {
        speed: 0,
        roadCurve: 0,
        roadCurveTimer: 0,
        speedLines: []
    }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'highp'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const container = document.getElementById('game-container');
if (container) {
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
}

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
scene.add(dirLight);

// Materials
const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
const matLine = new THREE.MeshBasicMaterial({ color: 0xffffff });
const matSidewalk = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8 });
const matBuilding = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
const matBuilding2 = new THREE.MeshStandardMaterial({ color: 0xA9A9A9 });
const matBuilding3 = new THREE.MeshStandardMaterial({ color: 0xD2691E });
const matWindow = new THREE.MeshStandardMaterial({ color: 0x87CEEB, roughness: 0.2, metalness: 0.8 });
const matWindowLit = new THREE.MeshBasicMaterial({ color: 0xFFFFE0 });
const matTrashBag = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
const matBox = new THREE.MeshStandardMaterial({ color: 0xC19A6B });
const matTire = new THREE.MeshStandardMaterial({ color: 0x111111 });
const matPole = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 });
const matLightHousing = new THREE.MeshStandardMaterial({ color: 0x222222 });
const matBalcony = new THREE.MeshStandardMaterial({ color: 0x555555 });
const matSkin = new THREE.MeshStandardMaterial({ color: 0xF4C2A0 });
const matJersey = new THREE.MeshStandardMaterial({ color: 0xFFD700 });
const matPants = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
const matShoes = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
const matBillboardFrame = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 });
const matHazardLight = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
const matConstructionStripe = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
const matHole = new THREE.MeshBasicMaterial({ color: 0x000000 });

let bikeGroup, bikePivot;
let groundChunks = [];

const smokeParticlePool = {
    geometry: new THREE.SphereGeometry(0.25, 8, 8),
    material: new THREE.MeshBasicMaterial({
        color: 0xaaaaaa,
        transparent: true
    })
};

function createTextTexture(text, bgColor, textColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 256);
    ctx.font = 'bold 60px Arial';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 128);
    return new THREE.CanvasTexture(canvas);
}

function createSpeedLimitTexture(limit) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, 2 * Math.PI);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.lineWidth = 25;
    ctx.strokeStyle = 'red';
    ctx.stroke();
    ctx.font = 'bold 100px Arial';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(limit, 128, 135);
    return new THREE.CanvasTexture(canvas);
}

function createJerseyTexture(isFront) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = 'bold 120px Arial';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('51', 128, 128);
    return new THREE.CanvasTexture(canvas);
}

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function createBike() {
    bikeGroup = new THREE.Group();
    bikePivot = new THREE.Group();
    bikeGroup.add(bikePivot);

    const loader = new GLTFLoader();
    loader.load('wheelie_rider_51.gltf', (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
            // Find wheels for animation
            if (child.name === 'BackWheel') {
                bikeGroup.userData.backWheel = child;
            }
            if (child.name === 'FrontWheel') {
                bikeGroup.userData.frontWheel = child;
            }
        });

        // Scale and position adjustments
        model.scale.set(1.5, 1.5, 1.5);
        model.position.y = 0.5; // Raised higher (10cm more)
        model.rotation.y = 0; // Will be set per mode in resetGame
        model.rotation.x = 0.55; // 90 degree forward tilt (π/2 radians)

        bikePivot.add(model);

    }, undefined, (error) => {
        console.error('An error happened loading the bike model:', error);
    });

    return bikeGroup;
}

function createCloud() {
    const cloud = new THREE.Group();
    const size = 1 + Math.random() * 4;
    for (let i = 0; i < 5; i++) {
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(size + Math.random() * size, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
        );
        sphere.position.set((Math.random() - 0.5) * size * 3, (Math.random() - 0.5) * size, (Math.random() - 0.5) * size * 2);
        cloud.add(sphere);
    }
    cloud.position.set((Math.random() - 0.5) * 200, 40 + Math.random() * 30, -100 - Math.random() * 100);
    cloud.userData.speed = 0.01 + Math.random() * 0.02;
    return cloud;
}

function createBird() {
    const bird = new THREE.Group();
    const bodyGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0x333333 }));
    bird.add(body);
    const wingGeo = new THREE.BoxGeometry(1.5, 0.05, 0.4);
    const wing = new THREE.Mesh(wingGeo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
    wing.position.set(0, 0, 0);
    bird.add(wing);
    bird.userData.wing = wing;
    bird.userData.wingAngle = 0;
    bird.userData.speed = 0.1 + Math.random() * 0.1;
    bird.position.set((Math.random() - 0.5) * 100, 15 + Math.random() * 10, -50 - Math.random() * 50);
    return bird;
}

function createGlassTower(width, height, depth) {
    const group = new THREE.Group();
    group.userData.height = height;
    const geo = new THREE.BoxGeometry(width, height, depth);
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        metalness: 0.1,
        roughness: 0.2,
        transparent: true,
        opacity: 0.7
    });
    const mesh = new THREE.Mesh(geo, glassMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const frameGeo = new THREE.BoxGeometry(width + 0.2, height, depth + 0.2);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.3 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    group.add(frame);
    const lightCount = Math.floor(height / 3);
    const lightGeo = new THREE.BoxGeometry(1, 1, 1);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    for (let i = 0; i < lightCount; i++) {
        if (Math.random() > 0.3) {
            const lightMesh = new THREE.Mesh(lightGeo, lightMat);
            lightMesh.position.set(
                (Math.random() - 0.5) * (width - 2),
                (Math.random() - 0.5) * (height - 2),
                (Math.random() - 0.5) * (depth - 2)
            );
            group.add(lightMesh);
        }
    }
    return group;
}

function createDetailedBuilding(width, height, depth, colorMat) {
    const building = new THREE.Group();
    building.userData.height = height;
    const mainGeo = new THREE.BoxGeometry(width, height, depth);
    const mainMesh = new THREE.Mesh(mainGeo, colorMat);
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    building.add(mainMesh);
    const roofGeo = new THREE.BoxGeometry(width + 0.5, 0.5, depth + 0.5);
    const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    roofMesh.position.y = height / 2 + 0.25;
    building.add(roofMesh);
    const windowGeo = new THREE.PlaneGeometry(1.2, 1.8);
    const rows = Math.floor(height / 3);
    const cols = Math.floor(width / 2.5);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const isLit = Math.random() > 0.7;
            const winMesh = new THREE.Mesh(windowGeo, isLit ? matWindowLit : matWindow);
            winMesh.position.set(
                (c - (cols - 1) / 2) * 2.5,
                (r - (rows - 1) / 2) * 3,
                depth / 2 + 0.05
            );
            building.add(winMesh);
            if (Math.random() > 0.8) {
                const balconyGeo = new THREE.BoxGeometry(1.4, 0.1, 0.5);
                const balcony = new THREE.Mesh(balconyGeo, matBalcony);
                balcony.position.set(winMesh.position.x, winMesh.position.y - 1.0, depth / 2 + 0.25);
                building.add(balcony);
            }
        }
    }
    return building;
}

function createSidewalkBillboard(text) {
    const group = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.15, 2.5, 0.15);
    const leg1 = new THREE.Mesh(legGeo, matBillboardFrame);
    leg1.position.set(-2.0, 1.25, 0);
    group.add(leg1);
    const leg2 = new THREE.Mesh(legGeo, matBillboardFrame);
    leg2.position.set(2.0, 1.25, 0);
    group.add(leg2);
    const frameGeo = new THREE.BoxGeometry(4.5, 3, 0.3);
    const frame = new THREE.Mesh(frameGeo, matBillboardFrame);
    frame.position.set(0, 2.8, 0);
    group.add(frame);
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const tex = createTextTexture(text, '#ffffff', randomColor);
    const faceGeo = new THREE.PlaneGeometry(4.2, 2.7);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 2.8, 0.16);
    group.add(face);
    const backFace = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ color: 0x555555 }));
    backFace.position.set(0, 2.8, -0.16);
    backFace.rotation.y = Math.PI;
    group.add(backFace);
    return group;
}

function createOverheadSign(text) {
    const group = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.3, 0.3, 8);
    const poleLeft = new THREE.Mesh(poleGeo, matPole);
    poleLeft.position.set(-12, 4, 0);
    group.add(poleLeft);
    const poleRight = new THREE.Mesh(poleGeo, matPole);
    poleRight.position.set(12, 4, 0);
    group.add(poleRight);
    const beamGeo = new THREE.BoxGeometry(26, 0.5, 0.5);
    const beam = new THREE.Mesh(beamGeo, matPole);
    beam.position.set(0, 7, 0);
    group.add(beam);
    const boardW = 14;
    const boardH = 4;
    const boardGeo = new THREE.BoxGeometry(boardW, boardH, 0.2);
    const board = new THREE.Mesh(boardGeo, new THREE.MeshStandardMaterial({ color: 0x003399 }));
    board.position.set(0, 7.5, 0.3);
    group.add(board);
    const tex = createTextTexture(text, '#003399', '#ffffff');
    const faceGeo = new THREE.PlaneGeometry(boardW - 0.5, boardH - 0.5);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 7.5, 0.41);
    group.add(face);
    return group;
}

function createSpeedLimitSign(limit) {
    const group = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 4);
    const pole = new THREE.Mesh(poleGeo, matPole);
    pole.position.set(0, 2, 0);
    group.add(pole);
    const signGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 32);
    signGeo.rotateX(Math.PI / 2);
    const tex = createSpeedLimitTexture(limit);
    const signMat = new THREE.MeshBasicMaterial({ map: tex });
    const sign = new THREE.Mesh(signGeo, [new THREE.MeshBasicMaterial({ color: 0xcccccc }), new THREE.MeshBasicMaterial({ color: 0xcccccc }), signMat]);
    sign.position.set(0, 3.5, 0.1);
    group.add(sign);
    return group;
}

function createHazardCar() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(4, 1.2, 2);
    const color = Math.random() * 0xffffff;
    const bodyMat = new THREE.MeshStandardMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    group.add(body);
    const cabinGeo = new THREE.BoxGeometry(2.5, 0.8, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(-0.2, 1.6, 0);
    group.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const w1 = new THREE.Mesh(wheelGeo, wheelMat); w1.rotation.x = Math.PI / 2; w1.position.set(-1.2, 0.4, 1); group.add(w1);
    const w2 = new THREE.Mesh(wheelGeo, wheelMat); w2.rotation.x = Math.PI / 2; w2.position.set(1.2, 0.4, 1); group.add(w2);
    const w3 = new THREE.Mesh(wheelGeo, wheelMat); w3.rotation.x = Math.PI / 2; w3.position.set(-1.2, 0.4, -1); group.add(w3);
    const w4 = new THREE.Mesh(wheelGeo, wheelMat); w4.rotation.x = Math.PI / 2; w4.position.set(1.2, 0.4, -1); group.add(w4);
    const lightGeo = new THREE.SphereGeometry(0.15);
    const l1 = new THREE.Mesh(lightGeo, matHazardLight); l1.position.set(-1.9, 0.8, 0.8); group.add(l1);
    const l2 = new THREE.Mesh(lightGeo, matHazardLight); l2.position.set(-1.9, 0.8, -0.8); group.add(l2);
    const l3 = new THREE.Mesh(lightGeo, matHazardLight); l3.position.set(1.9, 0.8, 0.8); group.add(l3);
    const l4 = new THREE.Mesh(lightGeo, matHazardLight); l4.position.set(1.9, 0.8, -0.8); group.add(l4);
    group.userData.lights = [l1, l2, l3, l4];
    state.animatedObjects.push(group);
    return group;
}

function createConstructionZone() {
    const group = new THREE.Group();
    const barrierGeo = new THREE.BoxGeometry(3, 1, 0.2);
    const barrier = new THREE.Mesh(barrierGeo, matConstructionStripe);
    barrier.position.set(0, 0.5, 0);
    group.add(barrier);
    const holeGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.1, 16);
    const hole = new THREE.Mesh(holeGeo, matHole);
    hole.position.set(0, 0.05, 2);
    group.add(hole);
    return group;
}

function createBench() {
    const group = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.1, 0.5, 0.4);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const l1 = new THREE.Mesh(legGeo, legMat); l1.position.set(-0.8, 0.25, 0); group.add(l1);
    const l2 = new THREE.Mesh(legGeo, legMat); l2.position.set(0.8, 0.25, 0); group.add(l2);
    const slatGeo = new THREE.BoxGeometry(1.8, 0.05, 0.1);
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    for (let i = 0; i < 3; i++) {
        const seat = new THREE.Mesh(slatGeo, slatMat);
        seat.position.set(0, 0.5, -0.15 + i * 0.15);
        group.add(seat);
    }
    for (let i = 0; i < 2; i++) {
        const back = new THREE.Mesh(slatGeo, slatMat);
        back.position.set(0, 0.8 + i * 0.15, -0.2);
        back.rotation.x = 0.2;
        group.add(back);
    }
    return group;
}

function createDetailedTrashCan() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x006400, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    group.add(body);
    const lidGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16);
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = 0.85;
    group.add(lid);
    return group;
}

function createTriangleSign() {
    const group = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2);
    const pole = new THREE.Mesh(poleGeo, matPole);
    pole.position.y = 1;
    group.add(pole);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.6);
    shape.lineTo(0.5, -0.3);
    shape.lineTo(-0.5, -0.3);
    shape.lineTo(0, 0.6);
    const geom = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide });
    const triangle = new THREE.Mesh(geom, mat);
    triangle.position.y = 2;
    group.add(triangle);
    const markGeo = new THREE.PlaneGeometry(0.1, 0.4);
    const markMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const mark = new THREE.Mesh(markGeo, markMat);
    mark.position.set(0, 2.1, 0.01);
    group.add(mark);
    const dotGeo = new THREE.PlaneGeometry(0.1, 0.1);
    const dot = new THREE.Mesh(dotGeo, markMat);
    dot.position.set(0, 1.8, 0.01);
    group.add(dot);
    return group;
}

function createBarrier() {
    const group = new THREE.Group();
    const footGeo = new THREE.BoxGeometry(0.4, 0.1, 0.4);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const f1 = new THREE.Mesh(footGeo, footMat); f1.position.set(-1, 0.05, 0); group.add(f1);
    const f2 = new THREE.Mesh(footGeo, footMat); f2.position.set(1, 0.05, 0); group.add(f2);
    const panelGeo = new THREE.BoxGeometry(2.2, 0.8, 0.1);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 0.5, 0);
    group.add(panel);
    const stripeGeo = new THREE.PlaneGeometry(0.3, 0.8);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(stripeGeo, stripeMat);
        s.position.set(-0.6 + i * 0.6, 0.5, 0.06);
        s.rotation.z = -0.5;
        group.add(s);
    }
    return group;
}

function createGroundChunk(zPos) {
    const chunk = new THREE.Group();
    chunk.position.z = zPos;
    const roadGeo = new THREE.PlaneGeometry(20, 100);
    roadGeo.rotateX(-Math.PI / 2);
    const road = new THREE.Mesh(roadGeo, matAsphalt);
    road.receiveShadow = true;
    chunk.add(road);
    const lineGeo = new THREE.PlaneGeometry(0.2, 100);
    lineGeo.rotateX(-Math.PI / 2);
    const line = new THREE.Mesh(lineGeo, matLine);
    line.position.y = 0.02;
    chunk.add(line);
    const swGeo = new THREE.PlaneGeometry(10, 100);
    swGeo.rotateX(-Math.PI / 2);
    const lSw = new THREE.Mesh(swGeo, matSidewalk);
    lSw.position.set(-15, 0.05, 0);
    lSw.receiveShadow = true;
    chunk.add(lSw);
    const rSw = new THREE.Mesh(swGeo, matSidewalk);
    rSw.position.set(15, 0.05, 0);
    rSw.receiveShadow = true;
    chunk.add(rSw);
    const curbGeo = new THREE.BoxGeometry(0.5, 0.15, 100);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const curbLeft = new THREE.Mesh(curbGeo, curbMat);
    curbLeft.position.set(-10.25, 0.075, 0);
    chunk.add(curbLeft);
    const curbRight = new THREE.Mesh(curbGeo, curbMat);
    curbRight.position.set(10.25, 0.075, 0);
    chunk.add(curbRight);
    for (let i = 0; i < 6; i++) {
        const isTower = Math.random() > 0.7;
        let bLeft, bRight;
        if (isTower) {
            const height = 30 + Math.random() * 30;
            const width = 8 + Math.random() * 5;
            const depth = 8 + Math.random() * 5;
            bLeft = createGlassTower(width, height, depth);
            bRight = createGlassTower(width, height, depth);
        } else {
            const height = 10 + Math.random() * 20;
            const width = 5 + Math.random() * 5;
            const depth = 5 + Math.random() * 5;
            const mat = [matBuilding, matBuilding2, matBuilding3][Math.floor(Math.random() * 3)];
            bLeft = createDetailedBuilding(width, height, depth, mat);
            bRight = createDetailedBuilding(width, height, depth, mat);
        }
        bLeft.position.set(-25 - Math.random() * 10, bLeft.userData.height / 2, (Math.random() - 0.5) * 90);
        chunk.add(bLeft);
        bRight.position.set(25 + Math.random() * 10, bRight.userData.height / 2, (Math.random() - 0.5) * 90);
        chunk.add(bRight);
    }
    if (Math.random() > 0.7) {
        const bench = createBench();
        bench.position.set(-13, 0, (Math.random() - 0.5) * 80);
        bench.rotation.y = Math.PI / 2;
        chunk.add(bench);
    }
    if (Math.random() > 0.7) {
        const trash = createDetailedTrashCan();
        trash.position.set(14, 0, (Math.random() - 0.5) * 80);
        chunk.add(trash);
    }
    if (Math.random() > 0.9 && state.graffitiList.length > 0) {
        const text = state.graffitiList[Math.floor(Math.random() * state.graffitiList.length)];
        const sign = createOverheadSign(text);
        sign.position.set(0, 0, 0);
        chunk.add(sign);
    }
    if (Math.random() > 0.8) {
        const limit = Math.random() > 0.5 ? "90" : "110";
        const sign = createSpeedLimitSign(limit);
        sign.position.set(12, 0, (Math.random() - 0.5) * 40);
        sign.rotation.y = -Math.PI / 2;
        chunk.add(sign);
    }
    if (Math.random() > 0.85) {
        const car = createHazardCar();
        car.position.set(13, 0, (Math.random() - 0.5) * 60);
        car.rotation.y = Math.PI;
        chunk.add(car);
    }
    if (state.graffitiList && state.graffitiList.length > 0) {
        if (Math.random() > 0.6) {
            const text = state.graffitiList[Math.floor(Math.random() * state.graffitiList.length)];
            const bb = createSidewalkBillboard(text);
            bb.position.set(-13, 0, (Math.random() - 0.5) * 80);
            bb.rotation.y = Math.PI / 2;
            chunk.add(bb);
        }
        if (Math.random() > 0.6) {
            const text = state.graffitiList[Math.floor(Math.random() * state.graffitiList.length)];
            const bb = createSidewalkBillboard(text);
            bb.position.set(13, 0, (Math.random() - 0.5) * 80);
            bb.rotation.y = -Math.PI / 2;
            chunk.add(bb);
        }
    }
    for (let i = 0; i < 3; i++) {
        const z = (Math.random() - 0.5) * 80;
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 6);
        const pole = new THREE.Mesh(poleGeo, matPole);
        pole.position.set(-10.5, 3, z);
        chunk.add(pole);
        const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 2);
        const arm = new THREE.Mesh(armGeo, matPole);
        arm.position.set(-9.5, 5.8, z);
        arm.rotation.z = -Math.PI / 2;
        chunk.add(arm);
        const housingGeo = new THREE.BoxGeometry(0.4, 0.2, 0.3);
        const housing = new THREE.Mesh(housingGeo, matLightHousing);
        housing.position.set(-8.5, 5.7, z);
        chunk.add(housing);
        const spot = new THREE.SpotLight(0xffaa00, 0.5);
        spot.position.set(-8.5, 5.6, z);
        spot.target.position.set(-8.5, 0, z);
        spot.angle = Math.PI / 4;
        spot.penumbra = 0.5;
        chunk.add(spot);
        chunk.add(spot.target);
    }
    return chunk;
}

function spawnObstacle(zPos) {
    const type = Math.random();
    let obs;
    if (type < 0.15) {
        obs = createConstructionZone();
        obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
    } else if (type < 0.3) {
        obs = createTriangleSign();
        obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
        obs.rotation.y = (Math.random() - 0.5) * 0.5;
    } else if (type < 0.45) {
        obs = createBarrier();
        obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
        obs.rotation.y = (Math.random() - 0.5) * 0.5;
    } else if (type < 0.6) {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        obs = new THREE.Mesh(geo, matBox);
        obs.position.set((Math.random() - 0.5) * 16, 0.5, zPos);
    } else if (type < 0.8) {
        const geo = new THREE.SphereGeometry(0.5, 16, 16);
        obs = new THREE.Mesh(geo, matTrashBag);
        obs.position.set((Math.random() - 0.5) * 16, 0.5, zPos);
    } else {
        const geo = new THREE.CylinderGeometry(0.2, 0.2, 1);
        obs = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff4400 }));
        obs.position.set((Math.random() - 0.5) * 16, 0.5, zPos);
    }
    obs.castShadow = true;
    scene.add(obs);
    state.obstacles.push({ mesh: obs, active: true });
}

function createCheckpoint() {
    const group = new THREE.Group();
    const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    pole1.position.set(-5, 2, 0);
    group.add(pole1);
    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    pole2.position.set(5, 2, 0);
    group.add(pole2);
    const signTex = createTextTexture('DRIVE SAFE', '#00ff00', '#000000');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 4, 0);
    sign.rotation.y = Math.PI;
    group.add(sign);
    group.position.set(0, 0, 10);
    scene.add(group);
}

function createSparkParticle() {
    // Create tiny yellow spark particle - mini explosion effect
    const geo = new THREE.SphereGeometry(0.05, 4, 4); // Very small
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffff00, // Yellow
        transparent: true,
        opacity: 1
    });
    const spark = new THREE.Mesh(geo, mat);

    // Position FIXED in space (not relative to bike) - within wheel width
    const currentX = bikeGroup.position.x;
    const currentZ = bikeGroup.position.z;
    spark.position.set(
        currentX + (Math.random() - 0.5) * 0.3, // Wheel width only (~30cm)
        0.1, // Just above ground
        currentZ + (Math.random() - 0.5) * 0.3
    );

    scene.add(spark);

    // Remove spark quickly (mini explosion effect)
    setTimeout(() => {
        scene.remove(spark);
        spark.geometry.dispose();
        spark.material.dispose();
    }, 150); // 0.15 seconds - disappears faster
}


async function loadGraffiti() {
    try {
        const res = await fetch('graffiti.json');
        if (res.ok) {
            const data = await res.json();
            state.graffitiList = data;
        }
    } catch (e) {
        console.error("Could not load graffiti.json", e);
    }
}

function init() {
    const bike = createBike();
    scene.add(bike);
    for (let i = 0; i < 10; i++) {
        const chunk = createGroundChunk(-i * 100);
        scene.add(chunk);
        groundChunks.push(chunk);
    }
    for (let i = 0; i < 10; i++) {
        const cloud = createCloud();
        scene.add(cloud);
        state.clouds.push(cloud);
    }
    for (let i = 0; i < 5; i++) {
        const bird = createBird();
        scene.add(bird);
        state.birds.push(bird);
    }
    loadGraffiti();
    createCheckpoint();
    state.highScore = parseInt(localStorage.getItem('wheelie_high_score')) || 0;
    const highScoreEl = document.getElementById('high-score-display');
    if (highScoreEl) {
        highScoreEl.innerText = `MEILLEUR: ${state.highScore}`;
        highScoreEl.style.display = 'block';
    }
    GAME_SETTINGS.controlMode = 'analog';
    document.querySelectorAll('.setting-btn').forEach(b => b.classList.remove('active'));
    const analogBtn = document.getElementById('control-analog');
    if (analogBtn) analogBtn.classList.add('active');
    applyGraphicsQuality();
    animate();
}

function resetGame() {
    state.score = 0;
    state.speed = 0;
    state.distance = 0;
    state.gameTime = 0;
    state.bike.angle = 0;
    state.bike.angularVelocity = 0;
    state.bike.lateralVelocity = 0;
    state.isPaused = false;
    state.skidding = false;
    state.skidTimer = 0;
    state.wheeliePercentage = 0;
    state.wheelieTime = 0;
    state.angleMultiplier = 1.0;
    state.timeMultiplier = 1.0;
    state.currentMultiplier = 1.0;
    state.smokeParticles.forEach(p => {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
    });
    state.smokeParticles = [];
    
    // Nettoyer les lignes de vitesse du mode libre
    if (state.freeMode.speedLines) {
        state.freeMode.speedLines.forEach(line => {
            scene.remove(line.mesh);
            line.mesh.geometry.dispose();
            line.mesh.material.dispose();
        });
    }
    state.freeMode = {
        speed: 0,
        roadCurve: 0,
        roadCurveTimer: 0,
        speedLines: []
    };
    
    bikeGroup.position.set(0, 0, 0);
    // Apply mode-specific rotation
    if (GAME_SETTINGS.gameMode === 'free') {
        bikeGroup.rotation.set(0, 0, 0); // 0° for free mode
    } else {
        bikeGroup.rotation.set(0, Math.PI, 0); // 180° for linear mode (inverted)
    }
    bikePivot.rotation.x = 0;
    state.obstacles.forEach(obs => scene.remove(obs.mesh));
    state.obstacles = [];
    state.animatedObjects = [];
    groundChunks.forEach(chunk => scene.remove(chunk));
    groundChunks = [];
    for (let i = 0; i < 5; i++) {
        const chunk = createGroundChunk(-i * 100);
        scene.add(chunk);
        groundChunks.push(chunk);
    }
    const highScoreEl = document.getElementById('high-score-display');
    if (highScoreEl) {
        highScoreEl.innerText = `MEILLEUR: ${state.highScore}`;
    }
}

function startGame() {
    mobileControlsInitialized = false;
    resetGame();
    state.isPlaying = true;
    state.speed = CONFIG.minSpeed;

    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const countdownEl = document.getElementById('countdown-display');

    if (startScreen) startScreen.classList.remove('active');
    if (gameOverScreen) gameOverScreen.classList.remove('active');

    setupMobileControls();

    // Auto-fullscreen on mobile devices
    if (isMobile() && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log('Auto-fullscreen failed:', err);
        });
    }

    if (GAME_SETTINGS.autoRace) {
        autoRaceActive = false;
        state.isPaused = true;
        if (countdownEl) {
            countdownEl.style.display = 'block';
            let count = 3;
            countdownEl.innerText = count;
            const timer = setInterval(() => {
                count--;
                if (count > 0) {
                    countdownEl.innerText = count;
                } else if (count === 0) {
                    countdownEl.innerText = "GO!";
                } else {
                    clearInterval(timer);
                    countdownEl.style.display = 'none';
                    state.isPaused = false;
                    autoRaceActive = true;
                }
            }, 1000);
        }
    }
}

function togglePause() {
    if (!state.isPlaying) return;
    state.isPlaying = false;
    state.isPaused = false;
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.classList.add('active');
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = 'none';
}

function checkCollisions() {
    if (!state.isPlaying) return;
    const bikeBox = new THREE.Box3().setFromObject(bikeGroup);
    bikeBox.expandByScalar(-0.2);
    for (let i = 0; i < state.obstacles.length; i++) {
        const obs = state.obstacles[i];
        if (!obs.active) continue;
        const obsBox = new THREE.Box3().setFromObject(obs.mesh);
        if (bikeBox.intersectsBox(obsBox)) {
            if (state.skidding) {
                gameOver();
            } else {
                startSkid();
            }
            obs.active = false;
        }
    }
}

function startSkid() {
    state.skidding = true;
    state.skidTimer = 1.5;
    bikeGroup.rotation.z = Math.PI / 8;
    // Reduced from 20 to 10 for better performance
    for (let i = 0; i < 10; i++) {
        createSmokeParticle();
    }
}

function createSmokeParticle() {
    // Limit max smoke particles for performance
    if (state.smokeParticles.length >= 30) {
        const oldest = state.smokeParticles.shift();
        scene.remove(oldest.mesh);
        oldest.mesh.material.dispose();
    }

    // Reuse pooled geometry and clone material for individual opacity
    const mat = smokeParticlePool.material.clone();
    mat.opacity = 0.6;
    const mesh = new THREE.Mesh(smokeParticlePool.geometry, mat);

    const pos = bikeGroup.position.clone();
    pos.y += 0.5;
    pos.z += 0.5;
    pos.x += (Math.random() - 0.5) * 0.5;
    mesh.position.copy(pos);

    // Random scale for variety
    const scale = 0.8 + Math.random() * 0.4;
    mesh.scale.set(scale, scale, scale);

    scene.add(mesh);
    state.smokeParticles.push({
        mesh: mesh,
        life: 1.0 + Math.random() * 0.5,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.1 + Math.random() * 0.1, 0.1)
    });
}

function updateSmoke(dt) {
    for (let i = state.smokeParticles.length - 1; i >= 0; i--) {
        const p = state.smokeParticles[i];
        p.life -= dt;
        p.mesh.position.add(p.velocity);
        p.mesh.material.opacity = p.life * 0.6;
        p.mesh.scale.multiplyScalar(1.02);
        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            state.smokeParticles.splice(i, 1);
        }
    }
}

// Fonction pour créer des lignes de vitesse (speed lines)
function createSpeedLine() {
    if (state.freeMode.speedLines.length >= 20) {
        const oldest = state.freeMode.speedLines.shift();
        scene.remove(oldest.mesh);
        oldest.mesh.geometry.dispose();
        oldest.mesh.material.dispose();
    }

    const geometry = new THREE.PlaneGeometry(0.2, 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);

    const pos = bikeGroup.position.clone();
    pos.x += (Math.random() - 0.5) * 8;
    pos.y += Math.random() * 2;
    pos.z += (Math.random() - 0.5) * 5 + 3;
    mesh.position.copy(pos);
    mesh.rotation.y = Math.PI / 2;

    scene.add(mesh);
    state.freeMode.speedLines.push({
        mesh: mesh,
        life: 0.3,
        velocity: new THREE.Vector3(0, 0, 3)
    });
}

function updateSpeedLines(dt) {
    for (let i = state.freeMode.speedLines.length - 1; i >= 0; i--) {
        const line = state.freeMode.speedLines[i];
        line.life -= dt;
        line.mesh.position.add(line.velocity);
        line.mesh.material.opacity = line.life * 2.5;
        if (line.life <= 0) {
            scene.remove(line.mesh);
            line.mesh.geometry.dispose();
            line.mesh.material.dispose();
            state.freeMode.speedLines.splice(i, 1);
        }
    }
}

async function gameOver() {
    state.isPlaying = false;
    state.skidding = false;
    const currentScore = Math.floor(state.score);
    
    // Récupérer le nickname
    const nickname = localStorage.getItem('wheelie_nickname');
    
    // Récupérer le high score depuis l'API si on a un nickname, sinon depuis localStorage
    let highScore = state.highScore;
    if (nickname) {
        const stats = await getPlayerStats(nickname);
        if (stats && stats.best_score) {
            highScore = stats.best_score;
            state.highScore = highScore;
            localStorage.setItem('wheelie_high_score', highScore);
        }
    }
    
    // Mettre à jour le high score si le score actuel est meilleur
    if (currentScore > highScore) {
        highScore = currentScore;
        state.highScore = highScore;
        localStorage.setItem('wheelie_high_score', highScore);
    }
    
    const finalScore = document.getElementById('final-score');
    const gameOverScreen = document.getElementById('game-over-screen');
    const bestScore = document.getElementById('best-score-gameover');
    if (finalScore) finalScore.innerText = currentScore;
    if (bestScore) bestScore.innerText = highScore;
    if (gameOverScreen) gameOverScreen.classList.add('active');
    
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = 'none';
    
    // Afficher la popup de pseudo tant qu'on n'a pas de pseudo
    if (!nickname) {
        // Afficher la popup de pseudo après un court délai
        setTimeout(() => {
            showNicknamePopup(currentScore);
        }, 1000);
    } else {
        // Mettre à jour le score dans le leaderboard
        updateLeaderboard(nickname, currentScore);
        // Envoyer le score à l'API
        await sendScoreToAPI(nickname, currentScore);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (state.isPlaying && !state.isPaused && bikeGroup) {
        const dt = 1 / 60;
        state.gameTime += dt;
        const dayProgress = (state.gameTime % CONFIG.dayNightCycleDuration) / CONFIG.dayNightCycleDuration;
        const skyColor = new THREE.Color();
        skyColor.lerpColors(new THREE.Color(0x87CEEB), new THREE.Color(0x0a0a2e), dayProgress);
        scene.background = skyColor;
        scene.fog.color = skyColor;

        if (bikeGroup.userData.frontWheel && bikeGroup.userData.backWheel) {
            const rotationSpeed = state.speed * 2.0;
            bikeGroup.userData.frontWheel.rotation.x -= rotationSpeed;
            bikeGroup.userData.backWheel.rotation.x -= rotationSpeed;
        }

        if (Math.floor(state.gameTime * 2) % 2 === 0) {
            state.animatedObjects.forEach(obj => {
                if (obj.userData.lights) obj.userData.lights.forEach(l => l.visible = true);
            });
        } else {
            state.animatedObjects.forEach(obj => {
                if (obj.userData.lights) obj.userData.lights.forEach(l => l.visible = false);
            });
        }

        state.clouds.forEach(cloud => {
            cloud.position.x += cloud.userData.speed;
            if (cloud.position.x > 150) cloud.position.x = -150;
        });

        state.birds.forEach(bird => {
            bird.position.x += bird.userData.speed;
            if (bird.position.x > 100) bird.position.x = -100;
            bird.userData.wingAngle += 0.15;
            bird.userData.wing.rotation.z = Math.sin(bird.userData.wingAngle) * 0.3;
        });

        updateSmoke(dt);

        if (state.skidding) {
            state.skidTimer -= dt;
            if (state.skidTimer <= 0) {
                state.skidding = false;
                bikeGroup.rotation.z = 0;
            } else {
                // Reduced continuous smoke: every 3rd frame instead of 50% chance
                if (Math.floor(state.gameTime * 60) % 3 === 0) {
                    createSmokeParticle();
                }
                bikeGroup.rotation.z = (Math.PI / 8) + Math.sin(Date.now() * 0.02) * 0.1;
                state.speed *= 0.98;
                bikeGroup.position.z -= state.speed;
            }
        } else if (GAME_SETTINGS.gameMode === 'free') {
            let moveX = 0;
            let moveZ = 0;
            if (GAME_SETTINGS.controlMode === 'analog' && analogData.active) {
                moveX = analogData.x * CONFIG.freeModeSpeed * 3;
                moveZ = analogData.y * CONFIG.freeModeSpeed * 3;
            } else {
                if (state.keys.left) moveX -= CONFIG.freeModeSpeed * 3;
                if (state.keys.right) moveX += CONFIG.freeModeSpeed * 3;
                if (state.keys.up) moveZ -= CONFIG.freeModeSpeed * 3;
                if (state.keys.down) moveZ += CONFIG.freeModeSpeed * 3;
            }
            bikeGroup.position.x += moveX;
            bikeGroup.position.z += moveZ;
            if (Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01) {
                const targetRotation = Math.atan2(moveX, moveZ);
                bikeGroup.rotation.y = targetRotation;
            }
            const speed = Math.sqrt(moveX * moveX + moveZ * moveZ);
            if (bikeGroup.userData.frontWheel) bikeGroup.userData.frontWheel.rotation.x -= speed * 2;
            if (bikeGroup.userData.backWheel) bikeGroup.userData.backWheel.rotation.x -= speed * 2;
            if (bikeGroup.position.x > 9) bikeGroup.position.x = 9;
            if (bikeGroup.position.x < -9) bikeGroup.position.x = -9;

            // Wheelie mechanics in free mode
            let lift = 0;
            if (state.keys.space) {
                lift = CONFIG.wheelieLift;
                if (state.bike.angle > CONFIG.balancePoint - CONFIG.sweetSpotWidth &&
                    state.bike.angle < CONFIG.balancePoint + CONFIG.sweetSpotWidth) {
                    lift *= 0.5;
                }
            }
            state.bike.angularVelocity += lift;
            state.bike.angularVelocity -= CONFIG.gravity;
            state.bike.angularVelocity *= 0.98;
            state.bike.angle += state.bike.angularVelocity;
            if (state.bike.angle < 0) {
                state.bike.angle = 0;
                state.bike.angularVelocity = 0;
            }
            if (state.bike.angle > CONFIG.maxAngle) {
                state.bike.angle = CONFIG.maxAngle;
                state.bike.angularVelocity = 0;
            }
            bikePivot.rotation.x = -state.bike.angle;

            // Inverted lateral lean in free mode (opposite of linear mode)
            const lateralLean = -moveX * 0.5; // Negative to inverse the lean direction
            bikeGroup.rotation.z = lateralLean;

            // Special wheelie effects in free mode
            const wheelieProgress = state.bike.angle / CONFIG.maxAngle; // 0 to 1

            // Yellow sparks at the very end of wheelie (90%+)
            if (wheelieProgress > 0.9 && Math.random() > 0.6) {
                createSparkParticle();
            }

            // Progressive levitation from 50% to 100% wheelie
            if (wheelieProgress > 0.5) {
                const levitationProgress = (wheelieProgress - 0.5) / 0.5; // 0 to 1 from 50% to 100%
                bikeGroup.position.y = 0.5 * levitationProgress; // Gradually rises to 0.5m
            } else {
                bikeGroup.position.y = 0; // Normal height
            }

            // Progressive wheelie failure mechanics
            if (wheelieProgress >= 0.99) {
                state.bike.maxWheelieTimer += dt;

                // Shake left-right after 1 second
                if (state.bike.maxWheelieTimer >= 1.0 && state.bike.maxWheelieTimer < 3.0) {
                    const shakeIntensity = 0.15;
                    bikeGroup.rotation.z = Math.sin(state.gameTime * 10) * shakeIntensity;
                }

                // Fall backward after 3 seconds
                if (state.bike.maxWheelieTimer >= 3.0) {
                    const fallProgress = Math.min((state.bike.maxWheelieTimer - 3.0) / 0.5, 1); // 0.5s fall animation
                    bikePivot.rotation.x = -state.bike.angle - (fallProgress * 1.5); // Rotate backward

                    // Game over when fall is complete
                    if (fallProgress >= 1.0) {
                        gameOver();
                    }
                }
            } else {
                state.bike.maxWheelieTimer = 0; // Reset timer
                bikeGroup.rotation.z = lateralLean; // Restore normal lean
            }

            state.distance += Math.abs(moveZ) + Math.abs(moveX);
        } else {
            let isAccelerating = state.keys.up;
            let isBraking = state.keys.down;
            if (GAME_SETTINGS.controlMode === 'analog' && analogData.active) {
                let sensitivity = 1.0;
                const kmh = state.speed * 50;
                if (kmh < 200) sensitivity = 0.5;
                state.bike.lateralVelocity = analogData.x * CONFIG.maxLateralSpeed * sensitivity;
                if (GAME_SETTINGS.autoRace) {
                    if (autoRaceActive) isAccelerating = true;
                    if (analogData.y > 0.2) state.keys.space = true;
                    else state.keys.space = false;
                    if (state.keys.down) isBraking = true;
                } else {
                    if (analogData.y < -0.1) isAccelerating = true;
                    if (analogData.y > 0.5) isBraking = true;
                }
            } else {
                if (state.keys.left) state.bike.lateralVelocity -= CONFIG.lateralAccel;
                if (state.keys.right) state.bike.lateralVelocity += CONFIG.lateralAccel;
            }
            state.bike.lateralVelocity *= CONFIG.lateralFriction;
            if (state.bike.lateralVelocity > CONFIG.maxLateralSpeed) state.bike.lateralVelocity = CONFIG.maxLateralSpeed;
            if (state.bike.lateralVelocity < -CONFIG.maxLateralSpeed) state.bike.lateralVelocity = -CONFIG.maxLateralSpeed;
            bikeGroup.position.x += state.bike.lateralVelocity;
            if (bikeGroup.position.x > 9) {
                bikeGroup.position.x = 9;
                state.bike.lateralVelocity = 0;
            }
            if (bikeGroup.position.x < -9) {
                bikeGroup.position.x = -9;
                state.bike.lateralVelocity = 0;
            }

            // Realistic Speed-Based Lean Physics
            const kmh = state.speed * 50;
            let leanFactor = 0.5;

            if (state.bike.angle > 0.2) {
                // WHEELIE: Inverse sway for balancing effect
                leanFactor = -1.5; // Negative = inverse direction (prevents sinking)
            } else if (kmh < 70) {
                // LOW SPEED (<70 km/h): Inverse lean (road tilts opposite to wheel)
                leanFactor = -0.8; // Negative = inverse direction
            } else {
                // HIGH SPEED (>=70 km/h): Normal lean (bike tilts toward turn)
                leanFactor = 1.2; // Positive = normal direction, amplified for realism
            }

            bikeGroup.rotation.z = state.bike.lateralVelocity * leanFactor;

            let lift = 0;
            if (state.keys.space && isAccelerating) {
                if (kmh > 110) lift = CONFIG.wheelieLiftFast;
                else if (kmh > 0) lift = CONFIG.wheelieLift;
                else lift = CONFIG.wheelieLift * 0.5;
                if (state.bike.angle > CONFIG.balancePoint - CONFIG.sweetSpotWidth &&
                    state.bike.angle < CONFIG.balancePoint + CONFIG.sweetSpotWidth) {
                    lift *= 0.5;
                }
            }
            if (isBraking) {
                lift -= CONFIG.wheelieLift * 2;

                // Système de freinage réaliste : moins efficace à haute vitesse
                const kmh = state.speed * 50;
                let brakeEfficiency = 1.0;

                if (kmh > 100) {
                    // À partir de 100 km/h, l'efficacité diminue progressivement
                    // À 100 km/h: 100%, à 150 km/h: 50%, à 200 km/h: 30%
                    brakeEfficiency = Math.max(0.3, 1.0 - ((kmh - 100) / 200));
                }

                const brakePower = CONFIG.brakeForce * brakeEfficiency;
                state.speed = Math.max(0, state.speed - brakePower);
            }
            state.bike.angularVelocity += lift;
            state.bike.angularVelocity -= CONFIG.gravity;
            state.bike.angularVelocity *= 0.98;
            state.bike.angle += state.bike.angularVelocity;
            if (state.bike.angle < 0) {
                state.bike.angle = 0;
                state.bike.angularVelocity = 0;
            }
            if (state.bike.angle > CONFIG.maxAngle) {
                gameOver();
            }
            bikePivot.rotation.x = -state.bike.angle;
            if (isAccelerating) {
                let accel = CONFIG.baseAcceleration;
                if (kmh > 130) accel *= 0.15;
                else if (kmh > 120) accel *= 0.3;
                else if (kmh > 100) accel *= 0.5;
                else if (kmh > 80) accel *= 0.7;
                else if (kmh > 60) accel *= 0.85;
                if (GAME_SETTINGS.controlMode === 'analog' && analogData.active && analogData.y < -0.1) {
                    accel *= Math.min(1, Math.abs(analogData.y) * 1.5);
                }
                if (state.speed < CONFIG.maxSpeed) state.speed += accel;
            } else if (!isBraking) {
                if (state.speed > CONFIG.minSpeed) state.speed -= CONFIG.deceleration;
            }
            bikeGroup.position.z -= state.speed;
            state.distance += state.speed;
            state.distance += state.speed;

            // Nouveau système de score basé sur le temps
            // Base : 1 point par seconde (60 points par minute)
            // Utiliser la variable kmh déjà déclarée plus haut
            
            // Seulement donner des points si la vitesse dépasse 20 km/h (en mouvement)
            if (kmh > 20) {
                let scoreIncrement = dt; // dt est en secondes, donc 1 point/seconde de base

                // Calculer le pourcentage d'inclinaison (0% à 100%)
                const wheeliePercentage = Math.max(0, Math.min(100, (state.bike.angle / CONFIG.maxAngle) * 100));
                state.wheeliePercentage = wheeliePercentage;

                // Multiplicateur BLEU basé sur l'angle instantané : de x1 à x2
                // 0% = x1, 50% = x1.5, 100% = x2
                const angleMultiplier = 1.0 + (wheeliePercentage / 100.0);
                state.angleMultiplier = angleMultiplier;

                // Multiplicateur PROGRESSIF basé sur le temps en wheeling haut
                const wheelieThreshold = CONFIG.maxAngle * 0.5; // 50% de la hauteur
                const isInHighWheelie = state.bike.angle > wheelieThreshold;

                if (isInHighWheelie) {
                    // Augmenter le temps de wheeling
                    state.wheelieTime += dt;

                    // Multiplicateur progressif : de x2 à x5 sur 30 secondes
                    state.timeMultiplier = Math.min(2.0 + (state.wheelieTime / 30.0) * 3.0, 5.0);
                } else {
                    // Réinitialiser le temps de wheeling
                    state.wheelieTime = 0;
                    state.timeMultiplier = 1.0;
                }

                // MULTIPLICATION des deux multiplicateurs
                // Exemple: 75% d'angle (x1.75) × x3 de temps = x5.25 total
                const combinedWheelieMultiplier = angleMultiplier * state.timeMultiplier;
                state.currentMultiplier = combinedWheelieMultiplier;

                // Multiplicateur de vitesse (bonus additionnel)
                let speedMultiplier = 1.0;
                if (kmh >= 150) {
                    speedMultiplier = 1.3;
                } else {
                    speedMultiplier = 1.0 + ((kmh - 20) / 130) * 0.3;
                }

                // Application du multiplicateur de difficulté
                let difficultyMult = 1.0;
                if (GAME_SETTINGS.difficulty === 'medium') difficultyMult = 1.2;
                if (GAME_SETTINGS.difficulty === 'hard') difficultyMult = 1.4;

                // Multiplicateur total : (angle × temps) × vitesse × difficulté
                const totalMultiplier = combinedWheelieMultiplier * speedMultiplier * difficultyMult;

                scoreIncrement *= totalMultiplier;
                state.score += scoreIncrement;
            } else {
                // Si vitesse trop faible, réinitialiser
                state.wheeliePercentage = 0;
                state.wheelieTime = 0;
                state.angleMultiplier = 1.0;
                state.timeMultiplier = 1.0;
                state.currentMultiplier = 1.0;
            }
        }

        const lastChunk = groundChunks[groundChunks.length - 1];
        if (bikeGroup.position.z < lastChunk.position.z + 200) {
            const newZ = lastChunk.position.z - 100;
            const chunk = createGroundChunk(newZ);
            scene.add(chunk);
            groundChunks.push(chunk);
            if (groundChunks.length > 12) {
                const old = groundChunks.shift();
                scene.remove(old);
            }
            // Only spawn obstacles in linear mode
            if (GAME_SETTINGS.gameMode === 'linear') {
                for (let i = 0; i < 4; i++) {
                    // Difficulty-based spawning
                    let spawnChance = 0.3; // Easy default
                    if (GAME_SETTINGS.difficulty === 'medium') spawnChance = 0.6;
                    if (GAME_SETTINGS.difficulty === 'hard') spawnChance = 0.9;

                    if (Math.random() < spawnChance) {
                        spawnObstacle(newZ + Math.random() * 100);
                    }
                }
            }
        }
        
        // Only check collisions in linear mode
        if (GAME_SETTINGS.gameMode === 'linear') {
            checkCollisions();
        }

        // Performance: Clean up old obstacles periodically
        obstacleCleanupCounter++;
        if (obstacleCleanupCounter > 300) {  // Every ~5 seconds at 60fps
            state.obstacles = state.obstacles.filter(obs => {
                if (!obs.active && obs.mesh.position.z > bikeGroup.position.z + 100) {
                    scene.remove(obs.mesh);
                    if (obs.mesh.geometry) obs.mesh.geometry.dispose();
                    if (obs.mesh.material) {
                        if (Array.isArray(obs.mesh.material)) {
                            obs.mesh.material.forEach(m => m.dispose());
                        } else {
                            obs.mesh.material.dispose();
                        }
                    }
                    return false;
                }
                return true;
            });
            obstacleCleanupCounter = 0;
        }
    }
    updateCamera();
    updateUI();
    updateMultiplierDisplay();
    renderer.render(scene, camera);
}

function updateCamera() {
    if (!bikeGroup) return;

    // Adjust FOV for portrait vs landscape
    const isPortrait = window.innerHeight > window.innerWidth;
    const targetBaseFOV = isPortrait ? 75 : 60;  // Wider FOV for portrait

    if (GAME_SETTINGS.gameMode === 'free') {
        const kmh = state.freeMode.speed * 50;
        
        // FOV dynamique basé sur la vitesse
        let fovBoost = state.freeMode.speed * 10;
        if (state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.3)) {
            fovBoost += 8; // Boost supplémentaire lors de l'accélération
        }
        const targetFOV = targetBaseFOV + fovBoost;
        camera.fov += (targetFOV - camera.fov) * 0.08;
        camera.updateProjectionMatrix();

        // Distance de caméra dynamique
        let distanceOffset = 12; // Distance de base
        let heightOffset = 6; // Hauteur de base
        
        // À l'accélération : la moto "décolle" de la caméra
        if (state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.3)) {
            if (kmh > 100) {
                distanceOffset = 18; // S'éloigne rapidement
                heightOffset = 8;
            } else {
                distanceOffset = 15;
                heightOffset = 7;
            }
        } else if (state.keys.down || (GAME_SETTINGS.controlMode === 'analog' && analogData.y > 0.3)) {
            // Au freinage : caméra se rapproche
            distanceOffset = 8;
            heightOffset = 5;
        } else if (kmh > 50) {
            // Vitesse normale : distance intermédiaire
            distanceOffset = 12 + (kmh - 50) / 50; // Augmente progressivement
            heightOffset = 6;
        }

        // Track time at high speed for gradual return
        if (!state.highSpeedTimer) state.highSpeedTimer = 0;
        if (kmh > 100 && !(state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.3))) {
            state.highSpeedTimer += 1 / 60;
        } else {
            state.highSpeedTimer = 0;
        }

        // Après 2 secondes à haute vitesse sans accélérer, revenir progressivement
        if (state.highSpeedTimer > 2) {
            const returnFactor = Math.min((state.highSpeedTimer - 2) / 2, 1);
            distanceOffset = distanceOffset - (returnFactor * 4);
        }

        const targetX = bikeGroup.position.x;
        const targetZ = bikeGroup.position.z + distanceOffset;
        const targetY = heightOffset;
        
        camera.position.x += (targetX - camera.position.x) * 0.12;
        camera.position.z += (targetZ - camera.position.z) * 0.12;
        camera.position.y += (targetY - camera.position.y) * 0.12;
        camera.lookAt(bikeGroup.position.x, 1, bikeGroup.position.z - 8);
    } else {
        // Dynamic FOV based on speed (Visual Acceleration)
        // Base increase + extra kick when accelerating
        let fovBoost = state.speed * 15;
        if (state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.1)) {
            fovBoost += 5; // Extra FOV kick when gas is pressed
        }

        const targetFOV = targetBaseFOV + fovBoost;
        camera.fov += (targetFOV - camera.fov) * 0.05; // Smoother transition
        camera.updateProjectionMatrix();

        // Dynamic Shake & Zoom
        const kmh = state.speed * 50;
        let shakeIntensity = 0;

        if (kmh > 150) {
            // Moderate shake starting at 150km/h
            shakeIntensity = (kmh - 150) * 0.002;
        }

        if (kmh > 200) {
            // Intense shake at 200km/h+
            shakeIntensity += (kmh - 200) * 0.005;
        }

        // Cap shake to avoid being unplayable
        shakeIntensity = Math.min(shakeIntensity, 0.8);

        const shakeX = (Math.random() - 0.5) * shakeIntensity;
        const shakeY = (Math.random() - 0.5) * shakeIntensity * 0.5;

        // Camera distance logic - comfortable distance
        let distanceOffset = 8; // Base comfortable distance

        // Éloignement progressif dès 25 km/h (au lieu de 50)
        if (kmh > 25) {
            // Distance augmente progressivement de 25 à 150 km/h
            const speedExcess = (kmh - 25) / 125; // 0 to 1 as speed goes from 25 to 150
            distanceOffset = 8 + (speedExcess * 2); // Max distance: 10 (au lieu de 12)
        }

        // Effet d'accélération: la moto s'éloigne un peu
        const isAccelerating = state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.1);
        if (isAccelerating && kmh > 25) {
            distanceOffset += 1.5; // Petit éloignement à l'accélération
        }

        // Track time at medium speed for auto-return
        if (!state.highSpeedTimer) state.highSpeedTimer = 0;
        if (kmh > 60 && !isAccelerating) {
            state.highSpeedTimer += 1 / 60; // Increment in seconds
        } else {
            state.highSpeedTimer = 0;
        }

        // Après 1.5 secondes sans accélérer, ramener la caméra progressivement
        if (state.highSpeedTimer > 1.5) {
            const returnFactor = Math.min((state.highSpeedTimer - 1.5) / 1.5, 1); // 0 to 1 over 1.5 seconds
            distanceOffset = distanceOffset - (returnFactor * 2.5); // Rapproche de 2.5 unités
            distanceOffset = Math.max(distanceOffset, 7.5); // Minimum distance
        }

        const targetZ = bikeGroup.position.z + distanceOffset;
        const targetY = 4.5;

        // Rattrapage plus rapide (0.15 au lieu de 0.1)
        camera.position.x += (bikeGroup.position.x - camera.position.x) * 0.1 + shakeX;
        camera.position.z += (targetZ - camera.position.z) * 0.15;
        camera.position.y += (targetY - camera.position.y) * 0.1 + shakeY;

        // Look slightly ahead of the bike
        camera.lookAt(bikeGroup.position.x, 2, bikeGroup.position.z - 20);
    }
}

function updateUI() {
    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.innerText = Math.floor(state.score);
    const speedText = document.getElementById('speed-text');
    const speedNeedle = document.getElementById('gauge-needle');
    if (speedText && speedNeedle) {
        const kmh = Math.max(0, Math.floor(state.speed * 50));
        speedText.innerText = `${kmh}`;
        const maxKmh = 200;
        const pct = Math.min(1, kmh / maxKmh);
        // 270 degree range: Starts at 135deg (bottom left) to 405deg (bottom right)
        // Or -225 to +45
        // Let's calibrate: 0 speed = 135deg. Max speed = 405deg.
        const deg = 135 + (pct * 270);
        speedNeedle.style.transform = `rotate(${deg}deg)`;
    }
}

function updateMultiplierDisplay() {
    const multiplierEl = document.getElementById('multiplier-display');
    if (!multiplierEl) return;

    // Afficher le pourcentage d'inclinaison et les multiplicateurs
    if (state.wheeliePercentage > 0 || state.timeMultiplier > 1.0) {
        const percentage = Math.floor(state.wheeliePercentage);
        const angleMultText = `x${state.angleMultiplier.toFixed(2)}`;
        const timeMultText = state.timeMultiplier > 1.0 ? ` • x${state.timeMultiplier.toFixed(1)}` : '';
        const totalMultText = `x${state.currentMultiplier.toFixed(2)}`;

        // Afficher: pourcentage • multiplicateur d'angle • multiplicateur de temps (si actif) = total
        if (state.timeMultiplier > 1.0) {
            multiplierEl.textContent = `${percentage}% • ${angleMultText} • ${timeMultText} = ${totalMultText}`;
        } else {
            multiplierEl.textContent = `${percentage}% • ${totalMultText}`;
        }

        multiplierEl.style.opacity = '1';
    } else {
        multiplierEl.style.opacity = '0';
    }
}

function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

const GAME_SETTINGS = {
    controlMode: 'analog',
    gameMode: 'linear',
    difficulty: 'hard', // easy, medium, hard
    autoRace: false,
    graphicsQuality: 'high'  // 'high' or 'low'
};

// Apply graphics quality settings
function applyGraphicsQuality() {
    if (GAME_SETTINGS.graphicsQuality === 'high') {
        // High quality settings
        scene.fog = new THREE.Fog(0x87CEEB, 70, 400);  // Extended visibility
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));  // Retina support
        dirLight.shadow.mapSize.width = 4096;  // 4K shadows
        dirLight.shadow.mapSize.height = 4096;
    } else {
        // Low quality settings (original)
        scene.fog = new THREE.Fog(0x87CEEB, 50, 300);
        renderer.setPixelRatio(1);  // Standard resolution
        dirLight.shadow.mapSize.width = 2048;  // 2K shadows
        dirLight.shadow.mapSize.height = 2048;
    }
}

let mobileControlsInitialized = false;
let analogData = { x: 0, y: 0, active: false };
let autoRaceCountdown = 0;
let autoRaceActive = false;
let obstacleCleanupCounter = 0;  // Performance: periodic obstacle cleanup

function setupMobileControls() {
    const mobileControls = document.getElementById('mobile-controls');
    const arrowControls = document.getElementById('arrow-controls');
    const analogControls = document.getElementById('analog-controls');
    if (!mobileControls) return;
    
    // Mettre à jour l'emoji du bouton gaz selon le mode de jeu
    const gasEmoji = document.getElementById('gas-emoji');
    if (gasEmoji) {
        gasEmoji.innerText = GAME_SETTINGS.gameMode === 'free' ? '⚡' : '💨';
    }
    
    if (GAME_SETTINGS.controlMode === 'arrows') {
        mobileControls.style.display = 'block';
        arrowControls.style.display = 'block';
        analogControls.style.display = 'none';
        if (!mobileControlsInitialized) setupArrowControls();
    } else if (GAME_SETTINGS.controlMode === 'analog') {
        mobileControls.style.display = 'block';
        arrowControls.style.display = 'none';
        analogControls.style.display = 'block';
        if (!mobileControlsInitialized) setupAnalogControls();
        const brakeBtn = document.getElementById('analog-brake');
        const gasBtn = document.getElementById('analog-gas');
        const wheelieBtn = document.getElementById('analog-wheelie');
        if (GAME_SETTINGS.autoRace) {
            if (gasBtn) gasBtn.style.display = 'none';
            if (wheelieBtn) wheelieBtn.style.display = 'none';
            if (brakeBtn) {
                brakeBtn.style.display = 'block';
                brakeBtn.style.right = '30px';
                brakeBtn.style.bottom = '50px';
            }
        } else {
            if (gasBtn) gasBtn.style.display = 'block';
            if (wheelieBtn) wheelieBtn.style.display = 'block';
            if (brakeBtn) {
                brakeBtn.style.display = 'block';
                brakeBtn.style.right = '90px';
            }
        }
    } else {
        mobileControls.style.display = 'none';
    }
    mobileControlsInitialized = true;
}

function setupArrowControls() {
    const buttons = {
        'btn-left': 'left',
        'btn-right': 'right',
        'btn-up': 'up',
        'btn-down': 'down',
        'btn-wheelie': 'space'
    };
    Object.entries(buttons).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); state.keys[key] = true; }, { passive: false });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); state.keys[key] = false; }, { passive: false });
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); state.keys[key] = true; });
        btn.addEventListener('mouseup', (e) => { e.preventDefault(); state.keys[key] = false; });
        btn.addEventListener('mouseleave', () => { state.keys[key] = false; });
    });
}

function setupAnalogControls() {
    const analogBase = document.getElementById('analog-stick-base');
    const analogKnob = document.getElementById('analog-stick-knob');
    if (analogBase && analogKnob) {
        const handleAnalog = (e) => {
            e.preventDefault();
            const rect = analogBase.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const touch = e.touches ? e.touches[0] : e;
            const x = touch.clientX - rect.left - centerX;
            const y = touch.clientY - rect.top - centerY;
            const distance = Math.sqrt(x * x + y * y);
            const maxDistance = 40;
            if (distance > maxDistance) {
                const angle = Math.atan2(y, x);
                analogData.x = Math.cos(angle);
                analogData.y = Math.sin(angle);
                analogKnob.style.transform = `translate(${Math.cos(angle) * maxDistance}px, ${Math.sin(angle) * maxDistance}px)`;
            } else {
                analogData.x = x / maxDistance;
                analogData.y = y / maxDistance;
                analogKnob.style.transform = `translate(${x}px, ${y}px)`;
            }
            analogData.active = true;
        };
        const resetAnalog = () => {
            analogData.x = 0;
            analogData.y = 0;
            analogData.active = false;
            analogKnob.style.transform = 'translate(0, 0)';
        };
        analogBase.addEventListener('touchstart', handleAnalog);
        analogBase.addEventListener('touchmove', handleAnalog);
        analogBase.addEventListener('touchend', resetAnalog);
        let isDragging = false;
        analogBase.addEventListener('mousedown', (e) => { isDragging = true; handleAnalog(e); });
        window.addEventListener('mousemove', (e) => { if (isDragging) handleAnalog(e); });
        window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; resetAnalog(); } });
    }
    const buttons = {
        'analog-gas': 'up',
        'analog-brake': 'down',
        'analog-wheelie': 'space'
    };
    Object.entries(buttons).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); state.keys[key] = true; }, { passive: false });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); state.keys[key] = false; }, { passive: false });
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); state.keys[key] = true; });
        btn.addEventListener('mouseup', (e) => { e.preventDefault(); state.keys[key] = false; });
        btn.addEventListener('mouseleave', () => { state.keys[key] = false; });
    });
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Force camera update for orientation change
    if (bikeGroup) {
        updateCamera();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyQ') state.keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') state.keys.right = true;
    if (e.code === 'ArrowUp' || e.code === 'KeyZ') state.keys.up = true;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') state.keys.down = true;

    // Space ONLY for wheelie (no restart functionality)
    if (e.code === 'Space') {
        e.preventDefault();
        state.keys.space = true;
    }

    // R key for restart/start game
    if (e.code === 'KeyR') {
        if (document.getElementById('start-screen').classList.contains('active') ||
            document.getElementById('game-over-screen').classList.contains('active')) {
            startGame();
        }
    }

    // Escape for pause
    if (e.code === 'Escape') {
        e.preventDefault();
        togglePause();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyQ') state.keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') state.keys.right = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyZ') state.keys.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') state.keys.down = false;
    if (e.code === 'Space') state.keys.space = false;
});

// Settings Menu Navigation
const settingsMainMenu = document.getElementById('settings-main-menu');
const submenus = document.querySelectorAll('.settings-submenu');

function showSubmenu(id) {
    if (settingsMainMenu) settingsMainMenu.style.display = 'none';
    submenus.forEach(sm => sm.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'flex';
    // Hide main back button when in submenu
    if (backBtn) backBtn.style.display = 'none';
}

function showSettingsMain() {
    if (settingsMainMenu) settingsMainMenu.style.display = 'flex';
    submenus.forEach(sm => sm.style.display = 'none');
    if (backBtn) backBtn.style.display = 'block';
}

// Category Buttons
document.getElementById('btn-cat-controls')?.addEventListener('click', () => showSubmenu('submenu-controls'));
document.getElementById('btn-cat-gamemode')?.addEventListener('click', () => showSubmenu('submenu-gamemode'));
document.getElementById('btn-cat-options')?.addEventListener('click', () => showSubmenu('submenu-options'));
document.getElementById('btn-cat-graphics')?.addEventListener('click', () => showSubmenu('submenu-graphics'));

// Back to Main Buttons
document.querySelectorAll('.back-to-main-btn').forEach(btn => {
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Back to main clicked');
            showSettingsMain();
        });
    }
});

// Reset to main menu when opening settings
const settingsBtn = document.getElementById('settings-btn');
const settingsScreen = document.getElementById('settings-screen');
const backBtn = document.getElementById('back-btn');

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        console.log('Settings button clicked');
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.classList.remove('active');
        if (settingsScreen) {
            settingsScreen.classList.add('active');
            showSettingsMain();
        }
    });
}

if (backBtn) {
    backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Back button clicked');
        if (settingsScreen) settingsScreen.classList.remove('active');
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.classList.add('active');
    });
} else {
    console.error('back-btn element not found!');
}

document.getElementById('control-arrows').addEventListener('click', () => {
    GAME_SETTINGS.controlMode = 'arrows';
    document.getElementById('control-arrows').classList.add('active');
    document.getElementById('control-analog').classList.remove('active');
});

document.getElementById('control-analog').addEventListener('click', () => {
    GAME_SETTINGS.controlMode = 'analog';
    document.getElementById('control-analog').classList.add('active');
    document.getElementById('control-arrows').classList.remove('active');
});

document.getElementById('mode-linear').addEventListener('click', () => {
    GAME_SETTINGS.gameMode = 'linear';
    document.getElementById('mode-linear').classList.add('active');
    document.getElementById('mode-free').classList.remove('active');
    document.getElementById('desc-linear').style.display = 'inline';
    document.getElementById('desc-free').style.display = 'none';
    // Remettre l'emoji souffle pour le mode linéaire
    const gasEmoji = document.getElementById('gas-emoji');
    if (gasEmoji) gasEmoji.innerText = '💨';
});

document.getElementById('mode-free').addEventListener('click', () => {
    GAME_SETTINGS.gameMode = 'free';
    document.getElementById('mode-free').classList.add('active');
    document.getElementById('mode-linear').classList.remove('active');
    document.getElementById('desc-linear').style.display = 'none';
    document.getElementById('desc-free').style.display = 'inline';
    // Changer l'emoji du bouton gaz en éclair pour le mode libre
    const gasEmoji = document.getElementById('gas-emoji');
    if (gasEmoji) gasEmoji.innerText = '⚡';
});

const autoRaceToggle = document.getElementById('option-auto-race');
if (autoRaceToggle) {
    autoRaceToggle.addEventListener('click', () => {
        GAME_SETTINGS.autoRace = !GAME_SETTINGS.autoRace;
        if (GAME_SETTINGS.autoRace) {
            autoRaceToggle.classList.add('active');
            autoRaceToggle.innerText = "⚡ COURSE AUTO: ON";
        } else {
            autoRaceToggle.classList.remove('active');
            autoRaceToggle.innerText = "⚡ COURSE AUTO";
        }
    });
}

// Graphics Quality toggle
document.getElementById('quality-high').addEventListener('click', () => {
    GAME_SETTINGS.graphicsQuality = 'high';
    document.getElementById('quality-high').classList.add('active');
    document.getElementById('quality-low').classList.remove('active');
    applyGraphicsQuality();
});

document.getElementById('quality-low').addEventListener('click', () => {
    GAME_SETTINGS.graphicsQuality = 'low';
    document.getElementById('quality-low').classList.add('active');
    document.getElementById('quality-high').classList.remove('active');
    applyGraphicsQuality();
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('pause-btn').addEventListener('click', togglePause);

// API Configuration
const API_BASE_URL = 'https://51-games-api.vercel.app/api/ranking';
const GAME_NAME = 'WheelieKing';

// Fonction pour envoyer le score à l'API
async function sendScoreToAPI(nickname, score) {
    try {
        const response = await fetch(API_BASE_URL + '/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                game_name: GAME_NAME,
                nickname: nickname,
                score: score
            })
        });
        
        if (!response.ok) {
            throw new Error('Erreur lors de l\'envoi du score');
        }
        
        const data = await response.json();
        console.log('Score envoyé avec succès:', data);
        return true;
    } catch (error) {
        console.error('Erreur API:', error);
        return false;
    }
}

// Fonction pour récupérer le classement depuis l'API
async function fetchLeaderboardFromAPI() {
    try {
        const response = await fetch(`${API_BASE_URL}/leaderboard/${GAME_NAME}`);
        
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération du classement');
        }
        
        const data = await response.json();
        return data.leaderboard || [];
    } catch (error) {
        console.error('Erreur API:', error);
        return [];
    }
}

// Fonction pour récupérer les statistiques d'un joueur depuis l'API
async function getPlayerStats(nickname) {
    try {
        const response = await fetch(`${API_BASE_URL}/player/${encodeURIComponent(nickname)}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return null; // Joueur non trouvé
            }
            throw new Error('Erreur lors de la récupération des stats');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur API:', error);
        return null;
    }
}

// Nickname & Leaderboard Functions
function showNicknamePopup(score) {
    const popup = document.getElementById('nickname-popup');
    const popupScore = document.getElementById('popup-score');
    const nicknameInput = document.getElementById('nickname-input');
    
    if (popup && popupScore && nicknameInput) {
        popupScore.innerText = score;
        nicknameInput.value = '';
        popup.style.display = 'flex';
        nicknameInput.focus();
    }
}

async function submitNickname() {
    const nicknameInput = document.getElementById('nickname-input');
    const nickname = nicknameInput.value.trim();
    
    if (nickname.length > 0) {
        // Sauvegarder le pseudo
        localStorage.setItem('wheelie_nickname', nickname);
        
        // Mettre à jour le leaderboard
        const currentScore = Math.floor(state.score);
        updateLeaderboard(nickname, currentScore);
        
        // Envoyer le score à l'API
        await sendScoreToAPI(nickname, currentScore);
        
        // Afficher le pseudo dans le menu
        displayNickname();
        
        // Fermer la popup
        closeNicknamePopup();
    }
}

function closeNicknamePopup() {
    const popup = document.getElementById('nickname-popup');
    if (popup) popup.style.display = 'none';
}

function displayNickname() {
    const nickname = localStorage.getItem('wheelie_nickname');
    const nicknameDisplay = document.getElementById('nickname-display');
    const playerNickname = document.getElementById('player-nickname');
    
    if (nickname && nicknameDisplay && playerNickname) {
        nicknameDisplay.innerText = nickname;
        playerNickname.style.display = 'block';
    }
}

function updateLeaderboard(nickname, score) {
    // Récupérer le leaderboard actuel
    let leaderboard = JSON.parse(localStorage.getItem('wheelie_leaderboard') || '[]');
    
    // Chercher si le joueur existe déjà
    const existingIndex = leaderboard.findIndex(entry => entry.nickname === nickname);
    
    if (existingIndex !== -1) {
        // Mettre à jour le score seulement s'il est meilleur
        if (score > leaderboard[existingIndex].score) {
            leaderboard[existingIndex].score = score;
        }
    } else {
        // Ajouter le nouveau joueur
        leaderboard.push({ nickname, score });
    }
    
    // Trier par score décroissant
    leaderboard.sort((a, b) => b.score - a.score);
    
    // Garder seulement le top 10
    leaderboard = leaderboard.slice(0, 10);
    
    // Sauvegarder
    localStorage.setItem('wheelie_leaderboard', JSON.stringify(leaderboard));
}

async function showLeaderboard() {
    const startScreen = document.getElementById('start-screen');
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    const leaderboardList = document.getElementById('leaderboard-list');
    
    if (startScreen) startScreen.classList.remove('active');
    if (leaderboardScreen) leaderboardScreen.classList.add('active');
    
    // Afficher un message de chargement
    leaderboardList.innerHTML = '<p style="color: #888;">Chargement...</p>';
    
    // Récupérer le classement depuis l'API
    const leaderboard = await fetchLeaderboardFromAPI();
    
    if (leaderboard.length === 0) {
        leaderboardList.innerHTML = '<p style="color: #888;">Aucun score enregistré...</p>';
    } else {
        let html = '';
        leaderboard.forEach((entry, index) => {
            const rank = index + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
            html += `
                <div class="leaderboard-entry">
                    <div class="leaderboard-rank">${medal}</div>
                    <div class="leaderboard-name">${entry.nickname}</div>
                    <div class="leaderboard-score">${entry.best_score}</div>
                </div>
            `;
        });
        leaderboardList.innerHTML = html;
    }
}

// Event Listeners pour le système de pseudo et classement
document.getElementById('submit-nickname')?.addEventListener('click', submitNickname);
document.getElementById('close-nickname-popup')?.addEventListener('click', closeNicknamePopup);
document.getElementById('skip-nickname')?.addEventListener('click', closeNicknamePopup);

document.getElementById('nickname-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitNickname();
    }
});

// Empêcher le zoom sur focus de l'input sur mobile
document.getElementById('nickname-input')?.addEventListener('focus', function(e) {
    this.style.fontSize = '16px'; // Évite le zoom automatique sur iOS
});

document.getElementById('leaderboard-btn')?.addEventListener('click', showLeaderboard);
document.getElementById('back-from-leaderboard')?.addEventListener('click', () => {
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    const startScreen = document.getElementById('start-screen');
    if (leaderboardScreen) leaderboardScreen.classList.remove('active');
    if (startScreen) startScreen.classList.add('active');
});

// Afficher le pseudo au chargement si il existe
displayNickname();

init();
