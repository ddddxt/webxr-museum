import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
//import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

// 3. 把 Draco 解压器绑到 GLTF 加载器上（新增）


loader.setDRACOLoader(dracoLoader);
//loader.setMeshoptDecoder(MeshoptDecoder);

// ==================== 诊断面板 ====================
const debugDiv = document.createElement('div');
debugDiv.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.85);color:#00ff00;font-family:monospace;font-size:13px;padding:12px;z-index:9999;pointer-events:none;white-space:pre;line-height:1.6;border-radius:8px;max-width:340px;';
document.body.appendChild(debugDiv);
let debugLines = [];
function setDebug(key, value) { debugLines.push(`${key}: ${value}`); }

let debugSprite = null;
let debugCanvas = null;
let debugCtx = null;
let debugTexture = null;

function initVRDebug() {
    debugCanvas = document.createElement('canvas');
    debugCanvas.width = 512;
    debugCanvas.height = 320;
    debugCtx = debugCanvas.getContext('2d');
    debugTexture = new THREE.CanvasTexture(debugCanvas);
    const mat = new THREE.SpriteMaterial({ 
        map: debugTexture, 
        transparent: true, 
        opacity: 0.92,
        depthTest: false,
        depthWrite: false
    });
    debugSprite = new THREE.Sprite(mat);
    debugSprite.scale.set(1.2, 0.75, 1);
    debugSprite.position.set(0, 0.15, -1.0);
    debugSprite.renderOrder = 9999;
    camera.add(debugSprite);
    debugSprite.visible = false;
}

// ==================== 基础场景 ====================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
//scene.fog = new THREE.FogExp2(0x050b1a, 0.008);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 5);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const vrBtnDefault = VRButton.createButton(renderer);
vrBtnDefault.style.display = 'none';
document.body.appendChild(vrBtnDefault);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.left = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

// ==================== 视频系统 ====================
const videoElement = document.getElementById('museum-video');
const videoTexture = new THREE.VideoTexture(videoElement);

// 视频屏幕
const screenGeo = new THREE.PlaneGeometry(3.2, 1.8);
const screenMat = new THREE.MeshBasicMaterial({ 
    map: videoTexture,
    side: THREE.DoubleSide
});
const videoScreen = new THREE.Mesh(screenGeo, screenMat);
videoScreen.position.set(0, 2.0, -3);
scene.add(videoScreen);

// 视频边框
const borderGeo = new THREE.PlaneGeometry(3.4, 2.0);
const borderMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
const videoBorder = new THREE.Mesh(borderGeo, borderMat);
videoBorder.position.copy(videoScreen.position);
videoBorder.position.z -= 0.02;
scene.add(videoBorder);

// 3D 提示文字
function createVideoHint(text, color = '#00ffaa') {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 108, 20);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'bold 44px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(2.0, 0.5, 1);
    return sprite;
}

const hintSprite = createVideoHint('▶ 点击播放视频');
hintSprite.position.set(0, 3.2, -6);
hintSprite.visible = false;
scene.add(hintSprite);
// ==================== 玩家组 ====================
const player = new THREE.Group();
scene.add(player);
let desktopCameraPos = new THREE.Vector3();

// ==================== 桌面端控制 ====================
const controls = new PointerLockControls(camera, renderer.domElement);
const moveState = { forward: false, backward: false, left: false, right: false };
const MOVE_SPEED = 2.0;

window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
    }
});
window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyD': moveState.right = false; break;
    }
});

renderer.domElement.addEventListener('click', (event) => {
    if (renderer.xr.isPresenting) return;
    
    // 计算鼠标在 3D 空间的位置（-1 到 +1）
    const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );
    
    // 从相机发射射线，检测是否打中视频屏幕
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, camera);
    const hits = rc.intersectObject(videoScreen);
    
    if (hits.length > 0) {
        toggleVideo();  // 点击视频 -> 播放/暂停
    } else {
        controls.lock();  // 点击空白处 -> 锁定鼠标漫游
    }
});

controls.addEventListener('lock', () => {
    const el = document.getElementById('instructions');
    if (el) el.style.opacity = '0';
});
controls.addEventListener('unlock', () => {
    const el = document.getElementById('instructions');
    if (el) el.style.opacity = '1';
});

// ==================== VR 手柄系统 ====================
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
player.add(controller1);
player.add(controller2);

const rayGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)
]);
const rayMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 });
const leftRay = new THREE.Line(rayGeo, rayMat.clone());
leftRay.scale.z = 8;
controller1.add(leftRay);
const rightRay = new THREE.Line(rayGeo, rayMat.clone());
rightRay.scale.z = 8;
controller2.add(rightRay);

const vrState = {
    leftStick: new THREE.Vector2(),
    rightStick: new THREE.Vector2(),
    isPresenting: false
};

// -------------------- 抓取系统变量 --------------------
let heldItem = null;
let heldItemOriginalParent = null;
let heldItemOriginalWorldMatrix = new THREE.Matrix4();
let flyingItem = null;
let flyStartPos = new THREE.Vector3();
let flyTargetPos = new THREE.Vector3();
let flyProgress = 0;

// 新增：物体旋转相关
let heldController = null;             // 触发抓取的手柄
let heldItemRotY = 0;                  // 累积的绕Y轴旋转角度（弧度）
let heldItemOriginalQuat = new THREE.Quaternion(); // 抓取时物体的原始世界旋转
// ---------------------------------------------------

renderer.xr.addEventListener('sessionstart', () => {
    vrState.isPresenting = true;
    controls.enabled = false;
    if (controls.isLocked) controls.unlock();

    desktopCameraPos.copy(camera.position);
    player.add(camera);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);

    player.position.set(desktopCameraPos.x, 0, desktopCameraPos.z);
    player.rotation.set(0, 0, 0);

    const btn = document.getElementById('vr-btn');
    const status = document.getElementById('vr-status');
    if (btn) btn.textContent = '⏏️ 退出 VR 模式';
    if (status) status.textContent = '● VR 模式已激活';

    artifactItems.forEach(item => {
        if (item.label) item.label.element.style.display = 'none';
        if (item.vrLabel) item.vrLabel.visible = false;
    });

    controller1.addEventListener('selectstart', onVRSelectStart);
    controller1.addEventListener('selectend', onVRSelectEnd);
    controller2.addEventListener('selectstart', onVRSelectStart);
    controller2.addEventListener('selectend', onVRSelectEnd);
});

renderer.xr.addEventListener('sessionend', () => {
    vrState.isPresenting = false;
    controls.enabled = true;

    if (heldItem) forceDropItem();
    if (flyingItem) {
        flyingItem.mesh.position.copy(flyingItem.mesh.parent.worldToLocal(flyTargetPos.clone()));
        flyingItem = null;
    }

    const worldPos = new THREE.Vector3();
    camera.getWorldPosition(worldPos);
    scene.add(camera);
    camera.position.copy(worldPos);
    camera.rotation.set(0, 0, 0);

    player.position.set(0, 0, 0);
    player.rotation.set(0, 0, 0);

    artifactItems.forEach(item => {
        if (item.label) item.label.element.style.display = 'block';
        if (item.vrLabel) item.vrLabel.visible = false;
    });

    const btn = document.getElementById('vr-btn');
    const status = document.getElementById('vr-status');
    if (btn) btn.textContent = '🎮 进入 VR 模式';
    if (status) status.textContent = '';

    controller1.removeEventListener('selectstart', onVRSelectStart);
    controller1.removeEventListener('selectend', onVRSelectEnd);
    controller2.removeEventListener('selectstart', onVRSelectStart);
    controller2.removeEventListener('selectend', onVRSelectEnd);
});

document.getElementById('vr-btn').addEventListener('click', async () => {
    if (!navigator.xr) {
        alert('浏览器不支持 WebXR');
        return;
    }
    try {
        if (!renderer.xr.isPresenting) {
            const session = await navigator.xr.requestSession('immersive-vr', {
                requiredFeatures: ['local-floor']
            });
            await renderer.xr.setSession(session);
        } else {
            renderer.xr.getSession().end();
        }
    } catch (err) {
        console.error('VR 启动失败:', err);
        alert('进入 VR 失败: ' + err.message);
    }
});

// ==================== 灯光 ====================
const ambientLight = new THREE.AmbientLight(0x404060, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
dirLight.position.set(5, 12, 4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 20;
dirLight.shadow.camera.left = -8;
dirLight.shadow.camera.right = 8;
dirLight.shadow.camera.top = 8;
dirLight.shadow.camera.bottom = -8;
scene.add(dirLight);

const backLight = new THREE.PointLight(0xcc8855, 0.5);
backLight.position.set(-3, 2, -4);
scene.add(backLight);

const fillLight = new THREE.PointLight(0x4488ff, 0.4);
fillLight.position.set(4, 3, 5);
scene.add(fillLight);

const gridHelper = new THREE.GridHelper(20, 20, 0x88aaff, 0x4466aa);
gridHelper.position.y = -0.5;
scene.add(gridHelper);

const smLight = new THREE.PointLight(0xcc8855, 0.5);
smLight.position.set(7, -1, 0);
scene.add(smLight);

// ==================== 文物数据 ====================
let artifactsInfo = {
    Mesh_0: { name: "螺钿云龙纹圆盒", era: "清代·乾隆年制", collectionId: "M00123", description: "盒面嵌螺钿云龙纹，片片贝母流光溢彩。" },
    Mesh_0001: { name: "螺钿人物故事长方盒", era: "明代·天启年间", collectionId: "M00456", description: "描绘《西厢记》场景，螺片细密，工艺精湛。" }
};

const artifactItems = [];

function createVRLabel(data) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = 512, h = 340;
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = 'rgba(45, 38, 32, 0.92)';
    roundRect(ctx, 10, 10, w - 20, h - 20, 24);
    ctx.fill();
    ctx.strokeStyle = '#c4a882';
    ctx.lineWidth = 6;
    roundRect(ctx, 10, 10, w - 20, h - 20, 24);
    ctx.stroke();

    ctx.fillStyle = '#f0e2c5';
    ctx.font = 'bold 44px "Microsoft YaHei", sans-serif';
    ctx.fillText(data.name, 35, 75);
    ctx.fillStyle = '#d4c4a8';
    ctx.font = '32px "Microsoft YaHei", sans-serif';
    ctx.fillText(`年代：${data.era}`, 35, 130);
    ctx.fillText(`馆藏号：${data.collectionId}`, 35, 175);
    ctx.fillStyle = '#b8a890';
    ctx.font = '28px "Microsoft YaHei", sans-serif';
    wrapText(ctx, data.description, 35, 225, w - 70, 40);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), mat);
    mesh.renderOrder = 1000;
    return mesh;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineHeight) {
    let line = '';
    for (let i = 0; i < text.length; i++) {
        const test = line + text[i];
        if (ctx.measureText(test).width > maxW && i > 0) {
            ctx.fillText(line, x, y);
            line = text[i];
            y += lineHeight;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, x, y);
}

// ==================== 加载模型 ====================

// 2. 创建 Draco 解压器（新增）

loader.load('models/ex.glb',
    (gltf) => {
        const model = gltf.scene;
        model.position.set(0, 0, 0);
        model.scale.set(1, 1, 1);
        scene.add(model);

        const allMeshNames = [];
        model.traverse(c => {
            if (c.isMesh) {
                allMeshNames.push(c.name);
                c.castShadow = true;
                c.receiveShadow = true;
            }
        });
        console.log('===== 模型子物体清单 =====');
        console.log(allMeshNames.join(', '));
        console.log('==========================');

        const detectedArtifacts = [];
        const presetKeys = Object.keys(artifactsInfo);
        
        model.traverse(c => {
            if (!c.isMesh) return;
            
            let key = c.name;
            let data = artifactsInfo[key];
            
            if (!data) {
                const lowerName = c.name.toLowerCase();
                const matchKey = presetKeys.find(k => k.toLowerCase() === lowerName);
                if (matchKey) {
                    key = matchKey;
                    data = artifactsInfo[key];
                }
            }
            
            if (!data && c.name.length > 2 && !c.name.toLowerCase().includes('grid') && !c.name.toLowerCase().includes('helper')) {
                data = {
                    name: c.name,
                    era: "未知年代",
                    collectionId: "未编号",
                    description: "自动探测到的展品，请在代码中补充详细信息。"
                };
                artifactsInfo[c.name] = data;
                detectedArtifacts.push(c.name);
            }

            if (data) {
                const div = document.createElement('div');
                div.className = 'artifact-label';
                div.innerHTML = `
                    <div class="title">${data.name}</div>
                    <div class="detail">年代：${data.era}</div>
                    <div class="detail">馆藏号：${data.collectionId}</div>
                    <div class="desc">${data.description}</div>
                `;
                div.style.opacity = '0';
                const label = new CSS2DObject(div);
                const box = new THREE.Box3().setFromObject(c);
                const hh = box.max.y - box.min.y;
                label.position.copy(c.position);
                label.position.y += hh / 2 + 0.4;
                scene.add(label);

                const vrLabel = createVRLabel(data);
                vrLabel.position.copy(c.position);
                vrLabel.position.y += hh / 2 + 0.6;
                vrLabel.visible = false;
                scene.add(vrLabel);

                artifactItems.push({ mesh: c, label, vrLabel, data });
            }
        });

        if (detectedArtifacts.length > 0) {
            console.warn('⚠️ 以下文物未在 artifactsInfo 中预设，已自动探测:', detectedArtifacts);
            console.warn('请修改 main.js 里的 artifactsInfo，把名字换成:', detectedArtifacts);
        }

        console.log(`模型加载完成，共 ${artifactItems.length} 个文物`);
    },
    (xhr) => {
        if (xhr.total) console.log(`加载进度: ${(xhr.loaded / xhr.total * 100).toFixed(1)}%`);
    },
    (err) => console.error('模型加载失败:', err)
);

// ==================== 辅助函数：从指定手柄读取摇杆 ====================
function getStickFromController(controller) {
    // 尝试从该手柄的 gamepad 获取摇杆数据
    if (!controller.gamepad || !controller.gamepad.axes || controller.gamepad.axes.length === 0) {
        return { x: 0, y: 0 };
    }
    const axes = controller.gamepad.axes;
    // 暴力扫描，取模长最大的摇杆对
    let bestX = 0, bestY = 0, bestLen = 0;
    for (let j = 0; j < axes.length - 1; j += 2) {
        const x = axes[j] || 0;
        const y = axes[j+1] || 0;
        const len = Math.sqrt(x*x + y*y);
        if (len > bestLen) {
            bestLen = len;
            bestX = x;
            bestY = y;
        }
    }
    return { x: bestX, y: bestY };
}

// ==================== 移动与交互逻辑 ====================
function updateDesktop(delta) {
    if (!delta || delta > 0.1) return;
    const s = MOVE_SPEED * delta;
    if (moveState.forward) controls.moveForward(s);
    if (moveState.backward) controls.moveForward(-s);
    if (moveState.right) controls.moveRight(s);
    if (moveState.left) controls.moveRight(-s);
    camera.position.y = 1.6;
}

function updateVR(delta) {
    if (!vrState.isPresenting) return;
    const session = renderer.xr.getSession();
    if (!session) return;

    const deadzone = 0.05;
    const speed = 2.0;
    const rotationSpeed = 0.7;
    const objRotSpeed = 2.5;        // 文物旋转速度

    // ---------- 读取两只手柄的摇杆 ----------
    // 从 session.inputSources 获取左右手 gamepad
    let stickLeft = { x: 0, y: 0 };
    let stickRight = { x: 0, y: 0 };
    const sources = session.inputSources;
    for (const src of sources) {
        if (!src.gamepad || !src.gamepad.axes) continue;
        const axes = src.gamepad.axes;
        let bestX = 0, bestY = 0, bestLen = 0;
        for (let j = 0; j < axes.length - 1; j += 2) {
            const x = axes[j] || 0;
            const y = axes[j+1] || 0;
            const len = Math.sqrt(x*x + y*y);
            if (len > bestLen) {
                bestLen = len;
                bestX = x;
                bestY = y;
            }
        }
        if (src.handedness === 'left') {
            stickLeft = { x: bestX, y: bestY };
        } else if (src.handedness === 'right') {
            stickRight = { x: bestX, y: bestY };
        } else {
            // 没有标识左右手时，按顺序分配
            if (stickLeft.x === 0 && stickLeft.y === 0) stickLeft = { x: bestX, y: bestY };
            else stickRight = { x: bestX, y: bestY };
        }
    }

    // ---------- 根据是否拿着文物决定控制逻辑 ----------
    if (heldItem && heldController) {
        // 判断抓取手柄是左还是右，取出对应的摇杆
        let stickHeld, stickOther;
        // 简单判断：如果 heldController 是 controller1，尝试对应 handedness
        // 更可靠的是直接查 inputSources 的 handedness 和控制器对应关系
        // 这里我们假设 controller1 是右手，controller2 是左手（一般如此）
        // 或者根据当时抓取的那个手柄的 handedness 从 sources 里读
        // 为保险，直接用上面得到的左右摇杆值，通过按键事件时记录的 handedness 分配
        const heldHandedness = heldController.handedness; // Three.js 手柄通常有 handedness
        if (heldHandedness === 'left') {
            stickHeld = stickLeft;
            stickOther = stickRight;
        } else {
            stickHeld = stickRight;
            stickOther = stickLeft;
        }

        setDebug('HeldStick', `X:${stickHeld.x.toFixed(2)} Y:${stickHeld.y.toFixed(2)}`);
        setDebug('OtherStick', `X:${stickOther.x.toFixed(2)} Y:${stickOther.y.toFixed(2)}`);

        // 抓取手柄 Y 轴 → 移动
        if (Math.abs(stickHeld.y) > deadzone) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
            forward.y = 0;
            forward.normalize();
            player.position.addScaledVector(forward, -stickHeld.y * speed * delta);
            setDebug('MV', 'YES');
        } else {
            setDebug('MV', 'no');
        }

        // 抓取手柄 X 轴 → 转身（可选）
        //if (Math.abs(stickHeld.x) > deadzone) {
          //  player.rotation.y -= stickHeld.x * rotationSpeed * delta;
            //setDebug('TR', 'smooth');
        //} 
        //else {
           // setDebug('TR', 'no');
        //}

        // 另一只手柄 X 轴 → 旋转文物
        if (Math.abs(stickOther.x) > deadzone) {
            heldItemRotY += stickOther.x * objRotSpeed * delta;
            setDebug('OBJR', 'YES');
        } else {
            setDebug('OBJR', 'no');
        }
    } else {
        // 没有拿物品时，任意一只手操作均有效（使用你原来的合并方式）
        let totalX = 0, totalY = 0;
        for (const src of sources) {
            if (!src.gamepad || !src.gamepad.axes) continue;
            const axes = src.gamepad.axes;
            let bestX = 0, bestY = 0, bestLen = 0;
            for (let j = 0; j < axes.length - 1; j += 2) {
                const x = axes[j] || 0;
                const y = axes[j+1] || 0;
                const len = Math.sqrt(x*x + y*y);
                if (len > bestLen) {
                    bestLen = len;
                    bestX = x;
                    bestY = y;
                }
            }
            totalX += bestX;
            totalY += bestY;
        }
        setDebug('SX', totalX.toFixed(2));
        setDebug('SY', totalY.toFixed(2));

        if (Math.abs(totalY) > deadzone) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
            forward.y = 0;
            forward.normalize();
            player.position.addScaledVector(forward, -totalY * speed * delta);
            setDebug('MV', 'YES');
        } else {
            setDebug('MV', 'no');
        }

        if (Math.abs(totalX) > deadzone) {
            player.rotation.y -= totalX * rotationSpeed * delta;
            setDebug('TR', 'smooth');
        } else {
            setDebug('TR', 'no');
        }
    }

    player.position.y = 0;

    // 飞行归位动画
    if (flyingItem) {
        flyProgress += delta * 2.5;
        if (flyProgress >= 1) {
            flyingItem.mesh.position.copy(
                flyingItem.mesh.parent.worldToLocal(flyTargetPos.clone())
            );
            flyingItem = null;
        } else {
            const worldPos = new THREE.Vector3().lerpVectors(flyStartPos, flyTargetPos, flyProgress);
            flyingItem.mesh.position.copy(
                flyingItem.mesh.parent.worldToLocal(worldPos)
            );
        }
    }

    // 拿着物品时，更新物品的位置和旋转
    if (heldItem) {
        // 位置：固定在玩家前方
        const playerForward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
        playerForward.y = 0;
        playerForward.normalize();
        const targetPos = player.position.clone()
            .addScaledVector(playerForward, heldItem.offset.z)
            .add(new THREE.Vector3(0, heldItem.offset.y, 0));
        heldItem.mesh.position.copy(targetPos);

        // 旋转：恢复原始世界旋转 + 用户累积的Y轴旋转
        const yRotQuat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), heldItemRotY
        );
        heldItem.mesh.quaternion.copy(heldItemOriginalQuat).premultiply(yRotQuat);
    }
}

function updateInteraction() {
    if (!vrState.isPresenting) return;

    if (heldItem && heldItem.vrLabel) heldItem.vrLabel.visible = false;

    const controllers = [controller1, controller2];
    let hitItem = null;
    let videoHit = false;  // 新增：是否指着视频
    
    artifactItems.forEach(i => { if (i.vrLabel) i.vrLabel.visible = false; });
    
    for (const ctrl of controllers) {
        const raycaster = new THREE.Raycaster();
        const mat = new THREE.Matrix4();
        mat.identity().extractRotation(ctrl.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(mat);
        
        // --- 检测文物 ---
        const meshes = artifactItems.map(i => i.mesh);
        const hits = raycaster.intersectObjects(meshes);
        const isHit = hits.length > 0 && hits[0].distance < 8;
        
        // --- 新增：检测视频屏幕 ---
        const vHits = raycaster.intersectObject(videoScreen);
        const isVideoHit = vHits.length > 0 && vHits[0].distance < 10;
        
        // 射线颜色：视频优先（青色）> 文物（绿色）> 无命中（橙色）
        ctrl.children.forEach(child => {
            if (child.isLine) {
                if (isVideoHit) {
                    child.material.color.setHex(0x00ffaa);
                    child.scale.z = vHits[0].distance;
                } else {
                    child.material.color.setHex(isHit ? 0x44ff44 : 0xffaa00);
                    child.scale.z = isHit ? hits[0].distance : 8;
                }
            }
        });
        
        if (isVideoHit) videoHit = true;
        else if (isHit && !hitItem) {
            hitItem = artifactItems.find(i => i.mesh === hits[0].object);
        }
    }
    
    // 视频提示文字
    if (videoHit) {
        hintSprite.visible = true;
        hintSprite.material.map.needsUpdate = true;  // 刷新文字
        hintSprite.position.x = videoScreen.position.x;
        hintSprite.lookAt(camera.position);
        setDebug('VIDEO', videoElement.paused ? '▶ 点击播放' : '⏸ 点击暂停');
    } else {
        hintSprite.visible = false;
    }
    
    if (hitItem && hitItem.vrLabel && heldItem !== hitItem) {
        hitItem.vrLabel.visible = true;
        const pos = hitItem.mesh.position.clone();
        pos.y += 0.6;
        hitItem.vrLabel.position.copy(pos);
        hitItem.vrLabel.lookAt(camera.position);
    }
}

// ==================== 抓取/放下逻辑 ====================
function findHitItem(controller) {
    const raycaster = new THREE.Raycaster();
    const mat = new THREE.Matrix4().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(mat);

    const meshes = artifactItems.map(i => i.mesh);
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length === 0 || hits[0].distance > 8) return null;
    return artifactItems.find(i => i.mesh === hits[0].object);
}

// 检测手柄是否指着视频屏幕
function isPointingVideo(controller) {
    const rc = new THREE.Raycaster();
    const rotMatrix = new THREE.Matrix4().extractRotation(controller.matrixWorld);
    rc.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    rc.ray.direction.set(0, 0, -1).applyMatrix4(rotMatrix);
    const hits = rc.intersectObject(videoScreen);
    return hits.length > 0 && hits[0].distance < 10;
}

// 播放 / 暂停切换
function toggleVideo() {
    if (videoElement.paused) {
        videoElement.muted = false;  // 第一次播放时取消静音
        videoElement.play().catch(err => {
            console.warn('播放失败:', err);
            alert('视频无法播放，请检查 video/vi.mp4 文件是否存在');
        });
    } else {
        videoElement.pause();
    }
}

function onVRSelectStart(event) {
    if (!vrState.isPresenting) return;
    const controller = event.target;

    if (isPointingVideo(controller)) {
        toggleVideo();
        return;
    }

    if (heldItem) {
        dropItem();
        return;
    }

    const item = findHitItem(controller);
    if (!item) return;

    // 记录是哪个手柄抓取的
    heldController = controller;
    grabItem(item);
}

function onVRSelectEnd(event) {
    // 可留空
}

function grabItem(item) {
    heldItem = item;
    heldItemOriginalParent = item.mesh.parent;
    item.mesh.updateWorldMatrix(true, false);
    heldItemOriginalWorldMatrix.copy(item.mesh.matrixWorld);

    // 保存原始世界旋转
    heldItemOriginalQuat.copy(item.mesh.quaternion);
    heldItemRotY = 0;   // 重置旋转累积

    // 从原父级移出，挂到 scene
    heldItemOriginalParent.remove(item.mesh);
    scene.add(item.mesh);

    // 设置偏移（你可以修改这里的数值调整位置）
    if (!heldItem.offset) {
        heldItem.offset = new THREE.Vector3(0, 0.8, 0.6); // (左右, 高度, 前后)
    }

    if (item.vrLabel) item.vrLabel.visible = false;
}

function dropItem() {
    if (!heldItem) return;
    const item = heldItem;

    item.mesh.getWorldPosition(flyStartPos);
    flyTargetPos.setFromMatrixPosition(heldItemOriginalWorldMatrix);

    camera.remove(item.mesh);
    heldItemOriginalParent.add(item.mesh);

    flyingItem = item;
    flyProgress = 0;

    // 清除抓取状态
    heldItem = null;
    heldItemOriginalParent = null;
    heldController = null;
    heldItemRotY = 0;
}

function forceDropItem() {
    if (!heldItem) return;
    const item = heldItem;
    camera.remove(item.mesh);
    heldItemOriginalParent.add(item.mesh);
    const localPos = heldItemOriginalParent.worldToLocal(
        new THREE.Vector3().setFromMatrixPosition(heldItemOriginalWorldMatrix)
    );
    item.mesh.position.copy(localPos);
    heldItem = null;
    heldItemOriginalParent = null;
    heldController = null;
    heldItemRotY = 0;
}

// ==================== 渲染循环 ====================
let lastTime = performance.now();

function animate() {
    debugLines = [];
    const now = performance.now();
    const delta = Math.min(1 / 30, (now - lastTime) / 1000);
    lastTime = now;

    if (vrState.isPresenting) {
        updateVR(delta);
    } else {
        updateDesktop(delta);
    }

    updateInteraction();

    debugDiv.textContent = debugLines.join('\n');
    if (debugSprite && debugCtx) {
        debugCtx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        debugCtx.fillRect(0, 0, 512, 280);
        debugCtx.fillStyle = '#00ff00';
        debugCtx.font = 'bold 22px monospace';
        debugLines.slice(0, 12).forEach((line, i) => {
            debugCtx.fillText(line, 12, 30 + i * 22);
        });
        debugTexture.needsUpdate = true;
        debugSprite.visible = false;
    }

    renderer.render(scene, camera);
    if (!vrState.isPresenting) {
        labelRenderer.render(scene, camera);
    }
}

initVRDebug();
renderer.setAnimationLoop(animate);

// ==================== 窗口调整 ====================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

console.log('XR 展厅诊断版已启动 | 抓取后另一只手柄摇杆可旋转文物');