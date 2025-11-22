import * as THREE from 'three';

const CONFIG = {
    laneWidth: 10,
    maxSpeed: 2.8,
    minSpeed: 0.0,
    baseAcceleration: 0.006,
    deceleration: 0.005,
    brakeForce: 0.03,
    lateralAccel: 0.05,
    lateralFriction: 0.92,
    maxLateralSpeed: 0.7,
    wheelieLift: 0.008,
    wheelieLiftFast: 0.012,
    gravity: 0.0015,
    balancePoint: 1.2,
    maxAngle: 1.6,
    sweetSpotWidth: 0.2,
    scoreMultiplier: 10,
    dayNightCycleDuration: 600,
};

let state = {
    isPlaying: false,
    isPaused: false,
    score: 0,
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
    const root = new THREE.Group();
    bikePivot = new THREE.Group();
    bikePivot.position.y = 0.8;
    root.add(bikePivot);

    const wheelGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.35, 32);
    wheelGeo.rotateZ(Math.PI / 2);
    const rearWheel = new THREE.Mesh(wheelGeo, matTire);
    rearWheel.castShadow = true;
    bikePivot.add(rearWheel);

    const frontWheel = new THREE.Mesh(wheelGeo, matTire);
    frontWheel.position.set(0, 0, -3.2);
    bikePivot.add(frontWheel);

    const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7 });
    const rimGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const rRim = new THREE.Mesh(rimGeo, rimMat);
    bikePivot.add(rRim);
    const fRim = new THREE.Mesh(rimGeo, rimMat);
    fRim.position.set(0, 0, -3.2);
    bikePivot.add(fRim);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, metalness: 0.6, roughness: 0.4 });

    const mainTube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5), frameMat);
    mainTube.rotation.z = -Math.PI / 6;
    mainTube.position.set(0, 0.7, -1.5);
    bikePivot.add(mainTube);

    const downTube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0), frameMat);
    downTube.rotation.z = Math.PI / 3;
    downTube.position.set(0, 0.3, -0.8);
    bikePivot.add(downTube);

    const seatGeo = new THREE.BoxGeometry(0.6, 0.15, 1.4);
    const seat = new THREE.Mesh(seatGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }));
    seat.position.set(0, 1.15, -0.8);
    bikePivot.add(seat);

    const tankGeo = new THREE.BoxGeometry(0.5, 0.6, 1.2);
    const tank = new THREE.Mesh(tankGeo, frameMat);
    tank.position.set(0, 0.8, -1.5);
    bikePivot.add(tank);

    const rFenderGeo = new THREE.BoxGeometry(0.5, 0.05, 1.4);
    const rFender = new THREE.Mesh(rFenderGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    rFender.position.set(0, 1.0, 0.3);
    bikePivot.add(rFender);

    const fFenderGeo = new THREE.BoxGeometry(0.5, 0.05, 1.4);
    const fFender = new THREE.Mesh(fFenderGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    fFender.position.set(0, 1.0, -3.0);
    bikePivot.add(fFender);

    const forkGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.5);
    const lFork = new THREE.Mesh(forkGeo, new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 }));
    lFork.position.set(0.25, 0.5, -3.2);
    bikePivot.add(lFork);

    const rFork = new THREE.Mesh(forkGeo, new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 }));
    rFork.position.set(-0.25, 0.5, -3.2);
    bikePivot.add(rFork);

    const handleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8);
    handleGeo.rotateZ(Math.PI / 2);
    const handle = new THREE.Mesh(handleGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    handle.position.set(0, 1.3, -2.6);
    bikePivot.add(handle);

    const gripGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.2);
    gripGeo.rotateZ(Math.PI / 2);
    const lGrip = new THREE.Mesh(gripGeo, new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 }));
    lGrip.position.set(-0.85, 1.3, -2.6);
    bikePivot.add(lGrip);
    const rGrip = new THREE.Mesh(gripGeo, new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 }));
    rGrip.position.set(0.85, 1.3, -2.6);
    bikePivot.add(rGrip);

    const exhaustGeo = new THREE.CylinderGeometry(0.08, 0.06, 1.5);
    exhaustGeo.rotateZ(Math.PI / 2);
    const exhaust = new THREE.Mesh(exhaustGeo, new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 }));
    exhaust.position.set(0.5, 0.4, -0.5);
    bikePivot.add(exhaust);

    const headlight = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), new THREE.MeshBasicMaterial({ color: 0xffffee }));
    headlight.position.set(0, 1.4, -3.1);
    headlight.rotation.y = Math.PI;
    bikePivot.add(headlight);

    const rider = new THREE.Group();
    rider.position.set(0, 1.2, -1.0);
    bikePivot.add(rider);

    const legGeo = new THREE.BoxGeometry(0.25, 0.8, 0.25);
    const lUpperLeg = new THREE.Mesh(legGeo, matPants);
    lUpperLeg.position.set(0.3, -0.2, 0.1);
    lUpperLeg.rotation.x = -0.3;
    rider.add(lUpperLeg);

    const rUpperLeg = new THREE.Mesh(legGeo, matPants);
    rUpperLeg.position.set(-0.3, -0.2, 0.1);
    rUpperLeg.rotation.x = -0.3;
    rider.add(rUpperLeg);

    const lLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), matPants);
    lLowerLeg.position.set(0.3, -0.6, -0.2);
    lLowerLeg.rotation.x = 0.4;
    rider.add(lLowerLeg);

    const rLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), matPants);
    rLowerLeg.position.set(-0.3, -0.6, -0.2);
    rLowerLeg.rotation.x = 0.4;
    rider.add(rLowerLeg);

    const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.35), matShoes);
    lFoot.position.set(0.3, -0.95, -0.3);
    rider.add(lFoot);
    const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.35), matShoes);
    rFoot.position.set(-0.3, -0.95, -0.3);
    rider.add(rFoot);

    const torsoGeo = new THREE.BoxGeometry(0.7, 0.9, 0.4);
    const matJerseyFront = new THREE.MeshStandardMaterial({ map: createJerseyTexture(true) });
    const matJerseyBack = new THREE.MeshStandardMaterial({ map: createJerseyTexture(false) });

    const torso = new THREE.Mesh(torsoGeo, [
        matJersey, matJersey, matJersey, matJersey, matJerseyFront, matJerseyBack
    ]);
    torso.position.set(0, 0.5, -0.2);
    torso.rotation.x = -0.1;
    rider.add(torso);

    const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);

    const lUpperArm = new THREE.Mesh(armGeo, matJersey);
    lUpperArm.position.set(0.5, 0.7, -0.3);
    lUpperArm.rotation.x = -1.3;
    lUpperArm.rotation.z = -0.3;
    rider.add(lUpperArm);

    const lForeArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), matJersey);
    lForeArm.position.set(0.65, 0.3, -0.8);
    lForeArm.rotation.x = -0.8;
    lForeArm.rotation.z = -0.2;
    rider.add(lForeArm);

    const rUpperArm = new THREE.Mesh(armGeo, matJersey);
    rUpperArm.position.set(-0.5, 0.7, -0.3);
    rUpperArm.rotation.x = -1.3;
    rUpperArm.rotation.z = 0.3;
    rider.add(rUpperArm);

    const rForeArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), matJersey);
    rForeArm.position.set(-0.65, 0.3, -0.8);
    rForeArm.rotation.x = -0.8;
    rForeArm.rotation.z = 0.2;
    rider.add(rForeArm);

    const handGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const lHand = new THREE.Mesh(handGeo, matSkin);
    lHand.position.set(0.75, 0.1, -1.1);
    rider.add(lHand);
    const rHand = new THREE.Mesh(handGeo, matSkin);
    rHand.position.set(-0.75, 0.1, -1.1);
    rider.add(rHand);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), matSkin);
    head.position.set(0, 1.15, -0.2);
    rider.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.3, roughness: 0.5 }));
    helmet.position.set(0, 1.15, -0.2);
    rider.add(helmet);

    const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    capBrim.position.set(0, 1.25, 0.15);
    rider.add(capBrim);

    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    capTop.position.set(0, 1.35, -0.05);
    rider.add(capTop);

    return root;
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
    bird.add(wing);
    bird.userData.wingAngle = 0;

    bird.position.set((Math.random() - 0.5) * 150, 15 + Math.random() * 15, -50 - Math.random() * 100);
    bird.userData.speed = 0.3 + Math.random() * 0.2;
    bird.userData.wing = wing;
    return bird;
}

function createDetailedBuilding(width, height, depth, colorMat) {
    const building = new THREE.Group();

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), colorMat);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    building.add(mesh);

    const windowGeo = new THREE.PlaneGeometry(1.2, 1.8);
    const balconyGeo = new THREE.BoxGeometry(1.4, 0.1, 0.5);

    const rows = Math.floor(height / 4);
    const cols = Math.floor(width / 3);

    for (let r = 1; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const winMat = Math.random() > 0.9 ? matWindowLit : matWindow;
            const win = new THREE.Mesh(windowGeo, winMat);
            const xPos = -width / 2 + 2 + c * 3;
            const yPos = r * 4;
            const zPos = depth / 2 + 0.05;

            win.position.set(xPos, yPos, zPos);
            building.add(win);

            if (Math.random() > 0.6) {
                const balcony = new THREE.Mesh(balconyGeo, matBalcony);
                balcony.position.set(xPos, yPos - 1, zPos + 0.25);
                building.add(balcony);
            }
        }
    }

    // Graffiti visibles des DEUX côtés (1 fois sur ~4)
    if (state.graffitiList && state.graffitiList.length > 0 && Math.random() > 0.75) {
        const text = state.graffitiList[Math.floor(Math.random() * state.graffitiList.length)];
        const bgHex = '#' + colorMat.color.getHexString();
        const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

        const tex = createTextTexture(text, bgHex, randomColor);
        const grafGeo = new THREE.PlaneGeometry(10, 5);
        const grafMat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });

        // Côté GAUCHE (visible depuis la route)
        const grafLeft = new THREE.Mesh(grafGeo, grafMat);
        grafLeft.position.set(-width / 2 - 0.1, height * 0.35, 0);
        grafLeft.rotation.y = Math.PI / 2;
        building.add(grafLeft);

        // Côté DROIT (visible depuis la route)
        const grafRight = new THREE.Mesh(grafGeo, grafMat.clone());
        grafRight.position.set(width / 2 + 0.1, height * 0.35, 0);
        grafRight.rotation.y = -Math.PI / 2;
        building.add(grafRight);

        console.log(`✅ Graffiti "${text}" on both sides`);
    }

    const trim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.5, depth + 0.5), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    trim.position.y = height;
    building.add(trim);

    return building;
}

function createGroundChunk(zPos) {
    const chunk = new THREE.Group();
    const length = 100;

    const road = new THREE.Mesh(new THREE.PlaneGeometry(20, length), matAsphalt);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    chunk.add(road);

    const lineGeo = new THREE.PlaneGeometry(0.5, 4);
    for (let i = 0; i < length; i += 10) {
        const line = new THREE.Mesh(lineGeo, matLine);
        line.rotation.x = -Math.PI / 2;
        line.position.set(0, 0.02, -length / 2 + i + 2);
        chunk.add(line);
    }

    const sidewalkGeo = new THREE.BoxGeometry(6, 0.4, length);
    const lWalk = new THREE.Mesh(sidewalkGeo, matSidewalk);
    lWalk.position.set(13, 0.2, 0);
    lWalk.receiveShadow = true;
    chunk.add(lWalk);

    const rWalk = new THREE.Mesh(sidewalkGeo, matSidewalk);
    rWalk.position.set(-13, 0.2, 0);
    rWalk.receiveShadow = true;
    chunk.add(rWalk);

    let currentZ = -length / 2;
    while (currentZ < length / 2) {
        const width = 10 + Math.random() * 10;
        const depth = 10 + Math.random() * 10;
        const height = 15 + Math.random() * 25;

        const mats = [matBuilding, matBuilding2, matBuilding3];
        const mat = mats[Math.floor(Math.random() * mats.length)];

        const bLeft = createDetailedBuilding(width, height, depth, mat);
        bLeft.position.set(22, 0, currentZ + width / 2);
        bLeft.rotation.y = Math.random() * 0.1 - 0.05;
        chunk.add(bLeft);

        const bRight = createDetailedBuilding(width, height, depth, mat);
        bRight.position.set(-22, 0, currentZ + width / 2);
        bRight.rotation.y = Math.PI + (Math.random() * 0.1 - 0.05);
        chunk.add(bRight);

        currentZ += width + 2;
    }

    chunk.position.z = zPos;
    scene.add(chunk);
    return chunk;
}

function spawnObstacle(zPos) {
    const type = Math.floor(Math.random() * 3);
    let mesh;

    if (type === 0) {
        mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), matTrashBag);
        mesh.scale.set(1, 0.8, 1);
        mesh.position.y = 0.5;
    } else if (type === 1) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), matBox);
        mesh.position.y = 0.75;
        mesh.rotation.y = Math.random();
    } else {
        mesh = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.25, 8, 16), matTire);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = 0.25;
    }

    mesh.position.x = (Math.random() - 0.5) * 14;
    mesh.position.z = zPos;
    mesh.castShadow = true;

    scene.add(mesh);
    state.obstacles.push({ mesh, active: true });
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
            console.log('✅ Graffiti loaded:', state.graffitiList);
        } else {
            console.warn('⚠️ graffiti.json not found');
        }
    } catch (e) {
        console.error("❌ Could not load graffiti.json", e);
    }
}

function init() {
    loadGraffiti().then(() => {
        try {
            bikeGroup = createBike();
            scene.add(bikeGroup);

            for (let i = 0; i < 15; i++) {
                const cloud = createCloud();
                scene.add(cloud);
                state.clouds.push(cloud);
            }

            for (let i = 0; i < 5; i++) {
                const bird = createBird();
                scene.add(bird);
                state.birds.push(bird);
            }

            for (let i = 0; i < 4; i++) {
                groundChunks.push(createGroundChunk(-i * 100));
            }

            createCheckpoint();

            resetGame();
            animate();
        } catch (e) {
            console.error("Init failed:", e);
        }
    });
}

function resetGame() {
    state.isPlaying = false;
    state.isPaused = false;
    state.score = 0;
    state.speed = 0;
    state.distance = 0;
    state.gameTime = 0;
    state.bike.angle = 0;
    state.bike.angularVelocity = 0;
    state.bike.lateralVelocity = 0;

    if (bikeGroup) {
        bikeGroup.position.set(0, 0, 0);
        bikePivot.rotation.x = 0;
        bikeGroup.rotation.z = 0;
    }

    state.obstacles.forEach(o => scene.remove(o.mesh));
    state.obstacles = [];

    updateUI();
}

function startGame() {
    resetGame();
    state.isPlaying = true;
    state.speed = CONFIG.minSpeed;

    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');

    if (startScreen) startScreen.classList.remove('active');
    if (gameOverScreen) gameOverScreen.classList.remove('active');
}

function togglePause() {
    if (!state.isPlaying) return;
    state.isPaused = !state.isPaused;
}

function gameOver() {
    state.isPlaying = false;
    const finalScore = document.getElementById('final-score');
    const gameOverScreen = document.getElementById('game-over-screen');

    if (finalScore) finalScore.innerText = Math.floor(state.score);
    if (gameOverScreen) gameOverScreen.classList.add('active');
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') state.keys.left = true;
    if (e.code === 'ArrowRight') state.keys.right = true;
    if (e.code === 'ArrowUp') state.keys.up = true;
    if (e.code === 'ArrowDown') state.keys.down = true;
    if (e.code === 'Space') {
        e.preventDefault();
        state.keys.space = true;
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

const startBtn = document.getElementById('start-btn');
if (startBtn) startBtn.addEventListener('click', startGame);

const restartBtn = document.getElementById('restart-btn');
if (restartBtn) restartBtn.addEventListener('click', startGame);

const pauseBtn = document.getElementById('pause-btn');
if (pauseBtn) pauseBtn.addEventListener('click', togglePause);

function animate() {
    requestAnimationFrame(animate);

    if (state.isPlaying && !state.isPaused && bikeGroup) {
        state.gameTime += 1 / 60;
        const dayProgress = (state.gameTime % CONFIG.dayNightCycleDuration) / CONFIG.dayNightCycleDuration;
        const skyColor = new THREE.Color();
        skyColor.lerpColors(new THREE.Color(0x87CEEB), new THREE.Color(0x0a0a2e), dayProgress);
        scene.background = skyColor;
        scene.fog.color = skyColor;

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

        if (state.keys.left) state.bike.lateralVelocity -= CONFIG.lateralAccel;
        if (state.keys.right) state.bike.lateralVelocity += CONFIG.lateralAccel;

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

        if (state.keys.space && state.keys.up) {
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

        // Freinage réaliste (proportionnel à la vitesse)
        if (state.keys.down) {
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

        bikePivot.rotation.x = state.bike.angle;

        // REALISTIC SPEED CURVE (max 140 km/h)
        if (state.keys.up) {
            let accel = CONFIG.baseAcceleration;
            if (kmh > 130) {
                accel *= 0.15;
            } else if (kmh > 120) {
                accel *= 0.3;
            } else if (kmh > 100) {
                accel *= 0.5;
            } else if (kmh > 80) {
                accel *= 0.7;
            } else if (kmh > 60) {
                accel *= 0.85;
            }
            if (state.speed < CONFIG.maxSpeed) state.speed += accel;
        } else if (!state.keys.down) {
            if (state.speed > CONFIG.minSpeed) state.speed -= CONFIG.deceleration;
        }

        bikeGroup.position.z -= state.speed;
        state.distance += state.speed;

        if (state.bike.angle > 0.2) {
            state.score += state.bike.angle * CONFIG.scoreMultiplier;
        }

        const lastChunk = groundChunks[groundChunks.length - 1];
        if (bikeGroup.position.z < lastChunk.position.z + 50) {
            const newZ = lastChunk.position.z - 100;
            const chunk = createGroundChunk(newZ);
            groundChunks.push(chunk);
            if (groundChunks.length > 6) {
                const old = groundChunks.shift();
                scene.remove(old);
            }
            for (let i = 0; i < 4; i++) {
                spawnObstacle(newZ + Math.random() * 100);
            }
        }

        const bikeBox = new THREE.Box3().setFromObject(bikeGroup);
        bikeBox.expandByScalar(-0.4);

        for (const obs of state.obstacles) {
            if (!obs.active) continue;
            const obsBox = new THREE.Box3().setFromObject(obs.mesh);
            if (bikeBox.intersectsBox(obsBox)) {
                if (state.bike.angle > 0.2) {
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

    const targetFOV = 60 + (state.speed * 10);
    camera.fov += (targetFOV - camera.fov) * 0.1;
    camera.updateProjectionMatrix();

    const shake = state.speed * 0.05;
    const shakeX = (Math.random() - 0.5) * shake;
    const shakeY = (Math.random() - 0.5) * shake;

    const targetX = bikeGroup.position.x * 0.5;
    const targetZ = bikeGroup.position.z + 10 + (state.speed * 1);

    camera.position.x += (targetX - camera.position.x) * 0.2;
    camera.position.z += (targetZ - camera.position.z) * 0.3;
    camera.position.y = 5 + shakeY;
    camera.position.x += shakeX;

    camera.lookAt(bikeGroup.position.x * 0.5, 2, bikeGroup.position.z - 20);
}

function updateUI() {
    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.innerText = Math.floor(state.score);

    const bar = document.getElementById('balance-bar');
    if (bar) {
        const pct = (state.bike.angle / CONFIG.maxAngle) * 100;
        bar.style.height = `${pct}%`;
        if (pct > 80) bar.style.background = '#ff0000';
        else if (pct > 40) bar.style.background = '#00ff00';
        else bar.style.background = '#FFD700';
    }

    const needle = document.getElementById('speed-needle');
    const speedText = document.getElementById('speed-text');
    if (needle && speedText) {
        const kmh = Math.max(0, Math.floor(state.speed * 50));
        speedText.innerText = `${kmh} km/h`;
        const deg = (state.speed / CONFIG.maxSpeed) * 180 - 90;
        needle.style.transform = `rotate(${deg}deg)`;
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
