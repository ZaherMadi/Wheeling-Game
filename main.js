import * as THREE from 'three';

const CONFIG = {
    laneWidth: 10,
    maxSpeed: 4.0, // Increased for 200 km/h
    minSpeed: 0.0,
    baseAcceleration: 0.0025, // Reduced for 13s to 100km/h
    deceleration: 0.005,
    brakeForce: 0.03,
    lateralAccel: 0.04, // Reduced by 20% (was 0.05)
    lateralFriction: 0.92,
    maxLateralSpeed: 0.56, // Reduced by 20% (was 0.7)
    wheelieLift: 0.008,
    wheelieLiftFast: 0.012,
    gravity: 0.0015,
    balancePoint: 1.2,
    maxAngle: 1.6,
    sweetSpotWidth: 0.2,
    scoreMultiplier: 10,
    dayNightCycleDuration: 600,
    freeModeSpeed: 0.15
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
    },
    keys: {
        left: false,
        right: false,
        up: false,
        down: false,
        space: false,
    },
    obstacles: [],
    animatedObjects: [], // For hazard lights etc.
    graffitiList: [],
    trafficLightState: 0,
    trafficTimer: 0,
    trafficLights: [],
    clouds: [],
    birds: [],
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 50, 300);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
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
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
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
const matConstructionStripe = new THREE.MeshStandardMaterial({ color: 0xffcc00 }); // Yellow/Black stripes would be better but simple yellow for now
const matHole = new THREE.MeshBasicMaterial({ color: 0x000000 });

let bikeGroup, bikePivot;
let groundChunks = [];

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

    // Red circle
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, 2 * Math.PI);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.lineWidth = 25;
    ctx.strokeStyle = 'red';
    ctx.stroke();

    // Text
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

function createBike() {
    bikeGroup = new THREE.Group();
    bikePivot = new THREE.Group();
    bikeGroup.add(bikePivot);

    // --- REALISTIC WHEELS ---
    const createWheel = () => {
        const wheelGroup = new THREE.Group();

        // Tire (Black rubber)
        const tireGeo = new THREE.TorusGeometry(0.35, 0.08, 8, 16);
        const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.y = Math.PI / 2; // Align for rolling
        wheelGroup.add(tire);

        // Rim (Silver metal)
        const rimGeo = new THREE.TorusGeometry(0.25, 0.02, 8, 16);
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.y = Math.PI / 2;
        wheelGroup.add(rim);

        // Spokes (Simple cross pattern)
        const spokeGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.5);
        const spoke1 = new THREE.Mesh(spokeGeo, rimMat);
        spoke1.rotation.z = Math.PI / 2;
        wheelGroup.add(spoke1);

        const spoke2 = new THREE.Mesh(spokeGeo, rimMat);
        wheelGroup.add(spoke2);

        // Axle detail
        const axleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2);
        const axle = new THREE.Mesh(axleGeo, rimMat);
        axle.rotation.x = Math.PI / 2;
        wheelGroup.add(axle);

        return wheelGroup;
    };

    // Back Wheel
    const backWheel = createWheel();
    backWheel.position.set(0, 0.35, 0);
    bikePivot.add(backWheel);
    bikeGroup.userData.backWheel = backWheel;

    // Front Wheel
    const frontWheel = createWheel();
    frontWheel.position.set(0, 0.35, 1.3);
    bikePivot.add(frontWheel);
    bikeGroup.userData.frontWheel = frontWheel;

    // Frame (Chassis)
    const frameGeo = new THREE.BoxGeometry(0.15, 0.15, 1.3);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0.6, 0.65);
    frame.rotation.x = -0.1;
    bikePivot.add(frame);

    // Engine block
    const engineGeo = new THREE.BoxGeometry(0.25, 0.3, 0.3);
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const engine = new THREE.Mesh(engineGeo, engineMat);
    engine.position.set(0, 0.5, 0.4);
    bikePivot.add(engine);

    // Seat
    const seatGeo = new THREE.BoxGeometry(0.3, 0.1, 0.6);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.85, 0.2);
    bikePivot.add(seat);

    // Handlebars
    const barGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const handlebars = new THREE.Mesh(barGeo, barMat);
    handlebars.rotation.z = Math.PI / 2;
    handlebars.position.set(0, 1.1, 1.1);
    bikePivot.add(handlebars);

    // Rider Body (Jersey)
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.7, 0.25);
    const body = new THREE.Mesh(bodyGeo, matJersey);
    body.position.set(0, 1.2, 0.2);
    body.rotation.x = 0.2;
    bikePivot.add(body);

    // Rider Number "51"
    const frontTexture = createJerseyTexture(true);
    const backTexture = createJerseyTexture(false);

    const frontNumGeo = new THREE.PlaneGeometry(0.3, 0.3);
    const frontNumMat = new THREE.MeshBasicMaterial({ map: frontTexture, transparent: true });
    const frontNum = new THREE.Mesh(frontNumGeo, frontNumMat);
    frontNum.position.set(0, 1.2, 0.33);
    frontNum.rotation.x = 0.2;
    bikePivot.add(frontNum);

    const backNumGeo = new THREE.PlaneGeometry(0.3, 0.3);
    const backNumMat = new THREE.MeshBasicMaterial({ map: backTexture, transparent: true });
    const backNum = new THREE.Mesh(backNumGeo, backNumMat);
    backNum.position.set(0, 1.3, 0.07);
    backNum.rotation.x = 0.2;
    backNum.rotation.y = Math.PI;
    bikePivot.add(backNum);

    // Rider Head (Backward Cap)
    const headGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const head = new THREE.Mesh(headGeo, matSkin);
    head.position.set(0, 1.65, 0.25);
    bikePivot.add(head);

    const capGeo = new THREE.BoxGeometry(0.26, 0.1, 0.35);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(0, 1.75, 0.22); // Backward cap
    bikePivot.add(cap);

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7);

    const leftArm = new THREE.Mesh(armGeo, matJersey);
    leftArm.position.set(-0.25, 1.3, 0.7);
    leftArm.rotation.x = -0.8;
    leftArm.rotation.z = -0.2;
    bikePivot.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, matJersey);
    rightArm.position.set(0.25, 1.3, 0.7);
    rightArm.rotation.x = -0.8;
    rightArm.rotation.z = 0.2;
    bikePivot.add(rightArm);

    scene.add(bikeGroup);

    // FIX: Rotate bike 180 degrees to face correct direction
    bikeGroup.rotation.y = Math.PI;

    // FIX: Scale bike wider (x1.5) AND larger overall (x1.5)
    // Previous scale was (1.5, 1, 1) for width. Now we want EVERYTHING 1.5x bigger.
    // So we scale the GROUP uniformly.
    bikeGroup.scale.set(1.5, 1.5, 1.5);
    // And keep the pivot scale for extra width if needed, or reset it?
    // User said "1.5 fois plus gros" (1.5x bigger). 
    // If I scale the group, everything grows.
    // Let's reset pivot scale to (1,1,1) to avoid distortion, or keep (1.5, 1, 1) if "wider" was a separate request.
    // The user previously asked for "plus large" (wider). Now "plus gros" (bigger).
    // I'll keep the width scaling on pivot and apply uniform scaling on group.
    bikePivot.scale.set(1.5, 1, 1);

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

    // Main Glass Body
    const geo = new THREE.BoxGeometry(width, height, depth);
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        metalness: 0.1, // Reduced metalness for visibility without env map
        roughness: 0.2,
        transparent: true,
        opacity: 0.7
    });
    const mesh = new THREE.Mesh(geo, glassMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Frames / Grid
    const frameGeo = new THREE.BoxGeometry(width + 0.2, height, depth + 0.2);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.3 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    group.add(frame);

    // Internal Lights (Emissive boxes instead of real lights)
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

    // Legs - Scaled up
    const legGeo = new THREE.BoxGeometry(0.15, 2.5, 0.15);
    const leg1 = new THREE.Mesh(legGeo, matBillboardFrame);
    leg1.position.set(-2.0, 1.25, 0);
    group.add(leg1);

    const leg2 = new THREE.Mesh(legGeo, matBillboardFrame);
    leg2.position.set(2.0, 1.25, 0);
    group.add(leg2);

    // Board Frame - Scaled up
    const frameGeo = new THREE.BoxGeometry(4.5, 3, 0.3);
    const frame = new THREE.Mesh(frameGeo, matBillboardFrame);
    frame.position.set(0, 2.8, 0);
    group.add(frame);

    // Board Face (Text)
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const tex = createTextTexture(text, '#ffffff', randomColor);
    const faceGeo = new THREE.PlaneGeometry(4.2, 2.7);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 2.8, 0.16);
    group.add(face);

    // Back Face
    const backFace = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ color: 0x555555 }));
    backFace.position.set(0, 2.8, -0.16);
    backFace.rotation.y = Math.PI;
    group.add(backFace);

    return group;
}

function createOverheadSign(text) {
    const group = new THREE.Group();

    // Pillars
    const poleGeo = new THREE.CylinderGeometry(0.3, 0.3, 8);
    const poleLeft = new THREE.Mesh(poleGeo, matPole);
    poleLeft.position.set(-12, 4, 0);
    group.add(poleLeft);

    const poleRight = new THREE.Mesh(poleGeo, matPole);
    poleRight.position.set(12, 4, 0);
    group.add(poleRight);

    // Crossbeam
    const beamGeo = new THREE.BoxGeometry(26, 0.5, 0.5);
    const beam = new THREE.Mesh(beamGeo, matPole);
    beam.position.set(0, 7, 0);
    group.add(beam);

    // Sign Board
    const boardW = 14;
    const boardH = 4;
    const boardGeo = new THREE.BoxGeometry(boardW, boardH, 0.2);
    const board = new THREE.Mesh(boardGeo, new THREE.MeshStandardMaterial({ color: 0x003399 })); // Blue highway sign color
    board.position.set(0, 7.5, 0.3);
    group.add(board);

    // Text
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

    // Car Body
    const bodyGeo = new THREE.BoxGeometry(4, 1.2, 2);
    const color = Math.random() * 0xffffff;
    const bodyMat = new THREE.MeshStandardMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    group.add(body);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(2.5, 0.8, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(-0.2, 1.6, 0);
    group.add(cabin);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const w1 = new THREE.Mesh(wheelGeo, wheelMat); w1.rotation.x = Math.PI / 2; w1.position.set(-1.2, 0.4, 1); group.add(w1);
    const w2 = new THREE.Mesh(wheelGeo, wheelMat); w2.rotation.x = Math.PI / 2; w2.position.set(1.2, 0.4, 1); group.add(w2);
    const w3 = new THREE.Mesh(wheelGeo, wheelMat); w3.rotation.x = Math.PI / 2; w3.position.set(-1.2, 0.4, -1); group.add(w3);
    const w4 = new THREE.Mesh(wheelGeo, wheelMat); w4.rotation.x = Math.PI / 2; w4.position.set(1.2, 0.4, -1); group.add(w4);

    // Hazard Lights (Blinkers)
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

    // Barrier
    const barrierGeo = new THREE.BoxGeometry(3, 1, 0.2);
    const barrier = new THREE.Mesh(barrierGeo, matConstructionStripe);
    barrier.position.set(0, 0.5, 0);
    group.add(barrier);

    // Hole
    const holeGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.1, 16);
    const hole = new THREE.Mesh(holeGeo, matHole);
    hole.position.set(0, 0.05, 2); // Hole in front of barrier
    group.add(hole);

    return group;
}

function createBench() {
    const group = new THREE.Group();

    // Legs
    const legGeo = new THREE.BoxGeometry(0.1, 0.5, 0.4);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const l1 = new THREE.Mesh(legGeo, legMat); l1.position.set(-0.8, 0.25, 0); group.add(l1);
    const l2 = new THREE.Mesh(legGeo, legMat); l2.position.set(0.8, 0.25, 0); group.add(l2);

    // Slats
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

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x006400, metalness: 0.3 }); // Dark Green
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    group.add(body);

    // Lid
    const lidGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16);
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = 0.85;
    group.add(lid);

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
    lSw.position.set(-15, 0.05, 0); // Slightly raised
    lSw.receiveShadow = true;
    chunk.add(lSw);

    const rSw = new THREE.Mesh(swGeo, matSidewalk);
    rSw.position.set(15, 0.05, 0); // Slightly raised
    rSw.receiveShadow = true;
    chunk.add(rSw);

    // Curbs (Demarcation)
    const curbGeo = new THREE.BoxGeometry(0.5, 0.15, 100);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x888888 }); // Grey concrete curb

    const curbLeft = new THREE.Mesh(curbGeo, curbMat);
    curbLeft.position.set(-10.25, 0.075, 0);
    chunk.add(curbLeft);

    const curbRight = new THREE.Mesh(curbGeo, curbMat);
    curbRight.position.set(10.25, 0.075, 0);
    chunk.add(curbRight);

    // Buildings
    for (let i = 0; i < 6; i++) { // Increased count
        const isTower = Math.random() > 0.7;
        let bLeft, bRight;

        if (isTower) {
            // Glass Tower
            const height = 30 + Math.random() * 30;
            const width = 8 + Math.random() * 5;
            const depth = 8 + Math.random() * 5;
            bLeft = createGlassTower(width, height, depth);
            bRight = createGlassTower(width, height, depth);
        } else {
            // Standard Building
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

    // Benches and Trash Cans (New)
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

    // --- NEW ELEMENTS SPAWNING ---

    // Overhead Sign (Rare)
    if (Math.random() > 0.9 && state.graffitiList.length > 0) {
        const text = state.graffitiList[Math.floor(Math.random() * state.graffitiList.length)];
        const sign = createOverheadSign(text);
        sign.position.set(0, 0, 0);
        chunk.add(sign);
    }

    // Speed Limit Sign (Occasional)
    if (Math.random() > 0.8) {
        const limit = Math.random() > 0.5 ? "90" : "110";
        const sign = createSpeedLimitSign(limit);
        sign.position.set(12, 0, (Math.random() - 0.5) * 40);
        sign.rotation.y = -Math.PI / 2;
        chunk.add(sign);
    }

    // Hazard Car (Occasional, on shoulder)
    if (Math.random() > 0.85) {
        const car = createHazardCar();
        car.position.set(13, 0, (Math.random() - 0.5) * 60);
        car.rotation.y = Math.PI; // Parked facing backward (or forward 0) - Parallel to road
        chunk.add(car);
    }

    // Sidewalk Billboards (Graffiti replacement)
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

    // Street lights
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

        // Light spot
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

function createTriangleSign() {
    const group = new THREE.Group();

    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2);
    const pole = new THREE.Mesh(poleGeo, matPole);
    pole.position.y = 1;
    group.add(pole);

    // Triangle
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.6);
    shape.lineTo(0.5, -0.3);
    shape.lineTo(-0.5, -0.3);
    shape.lineTo(0, 0.6);

    const geom = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide }); // Yellow warning
    const triangle = new THREE.Mesh(geom, mat);
    triangle.position.y = 2;
    group.add(triangle);

    // Exclamation Mark
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

    // Feet
    const footGeo = new THREE.BoxGeometry(0.4, 0.1, 0.4);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const f1 = new THREE.Mesh(footGeo, footMat); f1.position.set(-1, 0.05, 0); group.add(f1);
    const f2 = new THREE.Mesh(footGeo, footMat); f2.position.set(1, 0.05, 0); group.add(f2);

    // Panel
    const panelGeo = new THREE.BoxGeometry(2.2, 0.8, 0.1);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 0.5, 0);
    group.add(panel);

    // Stripes
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

function spawnObstacle(zPos) {
    const type = Math.random();
    let obs;

    if (type < 0.15) {
        // Construction Zone (New)
        obs = createConstructionZone();
        obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
    } else if (type < 0.3) {
        // Triangle Sign (New)
        obs = createTriangleSign();
        obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
        obs.rotation.y = (Math.random() - 0.5) * 0.5;
    } else if (type < 0.45) {
        // Barrier (New)
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
    createBike();

    // Initial ground
    for (let i = 0; i < 10; i++) { // Increased from 5 to 10 for smoother start
        const chunk = createGroundChunk(-i * 100);
        scene.add(chunk);
        groundChunks.push(chunk);
    }

    // Initial clouds and birds
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

    // Load high score
    state.highScore = parseInt(localStorage.getItem('wheelie_high_score')) || 0;
    const highScoreEl = document.getElementById('high-score-display');
    if (highScoreEl) {
        highScoreEl.innerText = `MEILLEUR: ${state.highScore}`;
        highScoreEl.style.display = 'block';
    }

    // Set default control mode to analog
    GAME_SETTINGS.controlMode = 'analog';
    document.querySelectorAll('.setting-btn').forEach(b => b.classList.remove('active'));
    const analogBtn = document.getElementById('control-analog');
    if (analogBtn) analogBtn.classList.add('active');

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

    // Reset Bike Position
    bikeGroup.position.set(0, 0, 0);
    bikeGroup.rotation.set(0, Math.PI, 0); // Keep rotation 180
    bikePivot.rotation.x = 0;

    // Clear obstacles
    state.obstacles.forEach(obs => scene.remove(obs.mesh));
    state.obstacles = [];
    state.animatedObjects = []; // Clear animated objects

    // Reset Ground
    groundChunks.forEach(chunk => scene.remove(chunk));
    groundChunks = [];
    for (let i = 0; i < 5; i++) {
        const chunk = createGroundChunk(-i * 100);
        scene.add(chunk);
        groundChunks.push(chunk);
    }

    // Update High Score Display
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

    if (GAME_SETTINGS.autoRace) {
        autoRaceActive = false;
        state.isPaused = true; // Pause game logic during countdown
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

    // Return to main menu
    state.isPlaying = false;
    state.isPaused = false;

    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.classList.add('active');

    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = 'none';
}

function gameOver() {
    state.isPlaying = false;

    // Save High Score
    if (state.score > state.highScore) {
        state.highScore = Math.floor(state.score);
        localStorage.setItem('wheelie_high_score', state.highScore);
    }

    const finalScore = document.getElementById('final-score');
    const gameOverScreen = document.getElementById('game-over-screen');

    if (finalScore) finalScore.innerText = Math.floor(state.score);
    if (gameOverScreen) gameOverScreen.classList.add('active');

    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = 'none';
}

function animate() {
    requestAnimationFrame(animate);

    if (state.isPlaying && !state.isPaused && bikeGroup) {
        state.gameTime += 1 / 60;
        const dayProgress = (state.gameTime % CONFIG.dayNightCycleDuration) / CONFIG.dayNightCycleDuration;
        const skyColor = new THREE.Color();
        skyColor.lerpColors(new THREE.Color(0x87CEEB), new THREE.Color(0x0a0a2e), dayProgress);
        scene.background = skyColor;
        scene.fog.color = skyColor;

        // Rotate Wheels based on speed
        if (bikeGroup.userData.frontWheel && bikeGroup.userData.backWheel) {
            const rotationSpeed = state.speed * 2.0;
            bikeGroup.userData.frontWheel.rotation.x -= rotationSpeed;
            bikeGroup.userData.backWheel.rotation.x -= rotationSpeed;
        }

        // Animate Hazard Lights
        if (Math.floor(state.gameTime * 2) % 2 === 0) {
            state.animatedObjects.forEach(obj => {
                if (obj.userData.lights) {
                    obj.userData.lights.forEach(l => l.visible = true);
                }
            });
        } else {
            state.animatedObjects.forEach(obj => {
                if (obj.userData.lights) {
                    obj.userData.lights.forEach(l => l.visible = false);
                }
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

        // Handle different game modes
        if (GAME_SETTINGS.gameMode === 'free') {
            // FREE MODE
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
                const targetRotation = Math.atan2(moveX, -moveZ);
                bikeGroup.rotation.y = targetRotation;
            }

            // Wheel rotation in free mode
            const speed = Math.sqrt(moveX * moveX + moveZ * moveZ);
            if (bikeGroup.userData.frontWheel) bikeGroup.userData.frontWheel.rotation.x -= speed * 2;
            if (bikeGroup.userData.backWheel) bikeGroup.userData.backWheel.rotation.x -= speed * 2;

            if (bikeGroup.position.x > 9) bikeGroup.position.x = 9;
            if (bikeGroup.position.x < -9) bikeGroup.position.x = -9;

            state.bike.angle = 0;
            bikePivot.rotation.x = 0;
            state.distance += Math.abs(moveZ) + Math.abs(moveX);

        } else {
            // LINEAR MODE
            let isAccelerating = state.keys.up;
            let isBraking = state.keys.down;

            // ANALOG CONTROL LOGIC
            if (GAME_SETTINGS.controlMode === 'analog' && analogData.active) {
                // Sensitivity Logic: 50% below 200 km/h
                let sensitivity = 1.0;
                const kmh = state.speed * 50;
                if (kmh < 200) sensitivity = 0.5;

                state.bike.lateralVelocity = analogData.x * CONFIG.maxLateralSpeed * sensitivity;

                if (GAME_SETTINGS.autoRace) {
                    // AUTO RACE MODE
                    if (autoRaceActive) {
                        isAccelerating = true; // Auto accelerate
                    }

                    // Drag Back (Positive Y) -> Wheelie
                    if (analogData.y > 0.2) {
                        state.keys.space = true; // Simulate space for wheelie
                    } else {
                        state.keys.space = false;
                    }

                    // Brake is handled by button only (mapped to 'down' key)
                    if (state.keys.down) isBraking = true;

                } else {
                    // STANDARD MODE
                    // Acceleration via Analog UP (negative Y)
                    if (analogData.y < -0.1) {
                        isAccelerating = true;
                    }
                    // Braking via Analog DOWN (positive Y)
                    if (analogData.y > 0.5) {
                        isBraking = true;
                    }
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

            bikeGroup.rotation.z = -state.bike.lateralVelocity * 0.5;

            const kmh = state.speed * 50;
            let lift = 0;

            // Wheelie Logic: Needs Space + Acceleration
            if (state.keys.space && isAccelerating) {
                if (kmh > 110) {
                    lift = CONFIG.wheelieLiftFast;
                } else if (kmh > 0) {
                    lift = CONFIG.wheelieLift;
                } else {
                    lift = CONFIG.wheelieLift * 0.5;
                }

                if (state.bike.angle > CONFIG.balancePoint - CONFIG.sweetSpotWidth &&
                    state.bike.angle < CONFIG.balancePoint + CONFIG.sweetSpotWidth) {
                    lift *= 0.5;
                }
            }

            if (isBraking) {
                lift -= CONFIG.wheelieLift * 2;
                const brakePower = CONFIG.brakeForce * (1 + state.speed * 2);
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

            // FIX: Inverted rotation for correct wheelie direction (nose up)
            bikePivot.rotation.x = -state.bike.angle;

            if (isAccelerating) {
                let accel = CONFIG.baseAcceleration;
                if (kmh > 130) accel *= 0.15;
                else if (kmh > 120) accel *= 0.3;
                else if (kmh > 100) accel *= 0.5;
                else if (kmh > 80) accel *= 0.7;
                else if (kmh > 60) accel *= 0.85;

                // Modulate acceleration with analog stick if available
                if (GAME_SETTINGS.controlMode === 'analog' && analogData.active && analogData.y < -0.1) {
                    accel *= Math.min(1, Math.abs(analogData.y) * 1.5);
                }

                if (state.speed < CONFIG.maxSpeed) state.speed += accel;
            } else if (!isBraking) {
                if (state.speed > CONFIG.minSpeed) state.speed -= CONFIG.deceleration;
            }

            bikeGroup.position.z -= state.speed;
            state.distance += state.speed;

            if (state.bike.angle > 0.2) {
                state.score += state.bike.angle * CONFIG.scoreMultiplier;
            }
        }

        // Terrain generation
        const lastChunk = groundChunks[groundChunks.length - 1];
        if (bikeGroup.position.z < lastChunk.position.z + 200) { // Increased threshold from 50 to 200
            const newZ = lastChunk.position.z - 100;
            const chunk = createGroundChunk(newZ);
            scene.add(chunk);
            groundChunks.push(chunk);
            if (groundChunks.length > 12) { // Increased buffer from 6 to 12
                const old = groundChunks.shift();
                scene.remove(old);
            }
            for (let i = 0; i < 4; i++) {
                spawnObstacle(newZ + Math.random() * 100);
            }
        }

        // Collision detection
        const bikeBox = new THREE.Box3().setFromObject(bikeGroup);
        bikeBox.expandByScalar(-0.4);

        for (const obs of state.obstacles) {
            if (!obs.active) continue;
            const obsBox = new THREE.Box3().setFromObject(obs.mesh);
            if (bikeBox.intersectsBox(obsBox)) {
                if (GAME_SETTINGS.gameMode === 'free') {
                    scene.remove(obs.mesh);
                    obs.active = false;
                } else if (state.bike.angle > 0.2) {
                    state.bike.angle = 0;
                    state.bike.angularVelocity = 0;
                    scene.remove(obs.mesh);
                    obs.active = false;
                } else {
                    gameOver();
                }
            }
        }
    }

    updateCamera();
    updateUI();
    renderer.render(scene, camera);
}

function updateCamera() {
    if (!bikeGroup) return;

    // Different camera behavior for free mode vs linear mode
    if (GAME_SETTINGS.gameMode === 'free') {
        const targetX = bikeGroup.position.x;
        const targetZ = bikeGroup.position.z + 15;
        const targetY = 8;

        camera.position.x += (targetX - camera.position.x) * 0.15;
        camera.position.z += (targetZ - camera.position.z) * 0.15;
        camera.position.y += (targetY - camera.position.y) * 0.15;

        camera.lookAt(bikeGroup.position.x, 1, bikeGroup.position.z - 5);
    } else {
        const targetFOV = 60 + (state.speed * 10);
        camera.fov += (targetFOV - camera.fov) * 0.1;
        camera.updateProjectionMatrix();

        const shake = state.speed * 0.05;
        const shakeX = (Math.random() - 0.5) * shake;
        const shakeY = (Math.random() - 0.5) * shake;

        const targetX = bikeGroup.position.x * 0.5;
        // Dynamic Zoom: Get closer and lower as speed increases
        const zoomZ = state.speed * 3.0;
        const zoomY = state.speed * 0.8;

        const targetZ = bikeGroup.position.z + 10 + (state.speed * 1) - zoomZ;
        const targetY = 5 - zoomY;

        camera.position.x += (targetX - camera.position.x) * 0.2;
        camera.position.z += (targetZ - camera.position.z) * 0.3;
        camera.position.y += (Math.max(2, targetY) - camera.position.y) * 0.1; // Smooth Y transition
        camera.position.x += shakeX;

        camera.lookAt(bikeGroup.position.x * 0.5, 2, bikeGroup.position.z - 20);
    }
}

function updateUI() {
    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.innerText = Math.floor(state.score);

    // Update Sports Car Speedometer
    const speedText = document.getElementById('speed-text');
    const speedNeedle = document.getElementById('gauge-needle');

    if (speedText && speedNeedle) {
        const kmh = Math.max(0, Math.floor(state.speed * 50));
        speedText.innerText = `${kmh}`;

        // Map 0-200kmh to -135deg to +135deg
        const maxKmh = 200;
        const pct = Math.min(1, kmh / maxKmh);
        const deg = -135 + (pct * 270);
        speedNeedle.style.transform = `translateX(-50%) rotate(${deg}deg)`;
    }
}

// ================================
// GAME SETTINGS & MODE MANAGEMENT
// ================================
const GAME_SETTINGS = {
    controlMode: 'analog', // Default to analog
    gameMode: 'linear',
    autoRace: false // New Auto Race option
};

// ================================
// MOBILE CONTROLS SETUP 
// ================================
let mobileControlsInitialized = false;
let analogData = { x: 0, y: 0, active: false };
let autoRaceCountdown = 0;
let autoRaceActive = false;

function setupMobileControls() {
    const mobileControls = document.getElementById('mobile-controls');
    const arrowControls = document.getElementById('arrow-controls');
    const analogControls = document.getElementById('analog-controls');

    if (!mobileControls) return;

    // Show/hide based on control mode
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

        // Update Analog UI for Auto Race
        const brakeBtn = document.getElementById('analog-brake');
        const gasBtn = document.getElementById('analog-gas');
        const wheelieBtn = document.getElementById('analog-wheelie');

        if (GAME_SETTINGS.autoRace) {
            if (gasBtn) gasBtn.style.display = 'none'; // No gas button needed
            if (wheelieBtn) wheelieBtn.style.display = 'none'; // Wheelie is on stick
            if (brakeBtn) {
                brakeBtn.style.display = 'block';
                brakeBtn.style.right = '30px'; // Move brake to right
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

        // Touch events
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); state.keys[key] = true; }, { passive: false });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); state.keys[key] = false; }, { passive: false });

        // Mouse events for testing
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

        // Touch events
        analogBase.addEventListener('touchstart', handleAnalog);
        analogBase.addEventListener('touchmove', handleAnalog);
        analogBase.addEventListener('touchend', resetAnalog);

        // Mouse events
        let isDragging = false;
        analogBase.addEventListener('mousedown', (e) => { isDragging = true; handleAnalog(e); });
        window.addEventListener('mousemove', (e) => { if (isDragging) handleAnalog(e); });
        window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; resetAnalog(); } });
    }

    // Action buttons
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

// ================================
// SETTINGS SCREEN HANDLERS
// ================================
const settingsBtn = document.getElementById('settings-btn');
const backBtn = document.getElementById('back-btn');

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('settings-screen').classList.add('active');
    });
}

if (backBtn) {
    backBtn.addEventListener('click', () => {
        document.getElementById('settings-screen').classList.remove('active');
        document.getElementById('start-screen').classList.add('active');
    });
}

// Control mode selection
['keyboard', 'arrows', 'analog'].forEach(mode => {
    const btn = document.getElementById(`control-${mode}`);
    if (btn) {
        btn.addEventListener('click', () => {
            GAME_SETTINGS.controlMode = mode;
            document.querySelectorAll('.setting-btn').forEach(b => {
                if (b.id.startsWith('control-')) b.classList.remove('active');
            });
            btn.classList.add('active');
        });
    }
});

// Game mode selection
['linear', 'free'].forEach(mode => {
    const btn = document.getElementById(`mode-${mode}`);
    if (btn) {
        btn.addEventListener('click', () => {
            GAME_SETTINGS.gameMode = mode;
            document.querySelectorAll('.setting-btn').forEach(b => {
                if (b.id.startsWith('mode-')) b.classList.remove('active');
            });
            btn.classList.add('active');

            // Toggle descriptions
            document.getElementById('desc-linear').style.display = mode === 'linear' ? '' : 'none';
            document.getElementById('desc-free').style.display = mode === 'free' ? '' : 'none';
        });
    }
});

// Auto Race Toggle
const autoRaceBtn = document.getElementById('option-auto-race');
if (autoRaceBtn) {
    autoRaceBtn.addEventListener('click', () => {
        GAME_SETTINGS.autoRace = !GAME_SETTINGS.autoRace;
        autoRaceBtn.classList.toggle('active', GAME_SETTINGS.autoRace);
    });
}

// Fullscreen Toggle
const fullscreenBtn = document.getElementById('fullscreen-btn');
if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// DYNAMIC UI FADING LOGIC
const mobileControls = document.getElementById('mobile-controls');

window.addEventListener('keydown', (e) => {
    // Spacebar Shortcuts
    if (e.code === 'Space') {
        const startScreen = document.getElementById('start-screen');
        const gameOverScreen = document.getElementById('game-over-screen');

        if (startScreen && startScreen.classList.contains('active')) {
            startGame();
            return;
        }
        if (gameOverScreen && gameOverScreen.classList.contains('active')) {
            startGame(); // Restart
            return;
        }
    }

    if (e.code === 'ArrowLeft') state.keys.left = true;
    if (e.code === 'ArrowRight') state.keys.right = true;
    if (e.code === 'ArrowUp') state.keys.up = true;
    if (e.code === 'ArrowDown') state.keys.down = true;
    if (e.code === 'Space') {
        e.preventDefault();
        state.keys.space = true;
    }

    // Fade OUT mobile controls on keyboard input
    if (mobileControls && !mobileControls.classList.contains('controls-hidden')) {
        mobileControls.classList.add('controls-hidden');
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') state.keys.left = false;
    if (e.code === 'ArrowRight') state.keys.right = false;
    if (e.code === 'ArrowUp') state.keys.up = false;
    if (e.code === 'ArrowDown') state.keys.down = false;
    if (e.code === 'Space') {
        e.preventDefault();
        state.keys.space = false;
    }
});

// Fade IN mobile controls on click/touch
window.addEventListener('mousedown', () => {
    if (mobileControls && mobileControls.classList.contains('controls-hidden')) {
        mobileControls.classList.remove('controls-hidden');
    }
});
window.addEventListener('touchstart', () => {
    if (mobileControls && mobileControls.classList.contains('controls-hidden')) {
        mobileControls.classList.remove('controls-hidden');
    }
});

const startBtn = document.getElementById('start-btn');
if (startBtn) startBtn.addEventListener('click', startGame);

const restartBtn = document.getElementById('restart-btn');
if (restartBtn) restartBtn.addEventListener('click', startGame);

const pauseBtn = document.getElementById('pause-btn');
if (pauseBtn) pauseBtn.addEventListener('click', togglePause);

init();
