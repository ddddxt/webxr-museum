import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
//import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./draco/');
// 3. 把 Draco 解压器绑到 GLTF 加载器上
loader.setDRACOLoader(dracoLoader);
// ==================== 诊断面板 ====================
const debugDiv = document.createElement('div');
debugDiv.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(244, 244, 244, 0.85);color:#00ff00;font-family:monospace;font-size:13px;padding:12px;z-index:9999;pointer-events:none;white-space:pre;line-height:1.6;border-radius:8px;max-width:340px;';
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
scene.background = new THREE.Color(	0xf5f5f0);//场景背景颜色
//scene.fog = new THREE.FogExp2(0x050b1a, 0.008);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 5);
scene.add(camera);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;   // 正确的色彩输出
renderer.toneMapping = THREE.ACESFilmicToneMapping; // 更自然的色调映射
renderer.toneMappingExposure = 1.0;

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
const screenGeo = new THREE.PlaneGeometry(3.2, 1.8, 1);
const screenMat = new THREE.MeshBasicMaterial({ 
    map: videoTexture,
    side: THREE.DoubleSide
});
const videoScreen = new THREE.Mesh(screenGeo, screenMat);
// 把 x 改为你要的值：例如 -1 向左，+1 向右（z 保持 -3，不改变远近）
videoScreen.position.set(-7, 2.3, 2);
videoScreen.rotation.y = Math.PI / 2;
scene.add(videoScreen);
// 视频边框
const borderGeo = new THREE.PlaneGeometry(3.4, 2.0);
const borderMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
const videoBorder = new THREE.Mesh(borderGeo, borderMat);
videoBorder.position.copy(videoScreen.position);
videoBorder.position.x -= 0.04;
// 同步边框旋转
videoBorder.rotation.copy(videoScreen.rotation);
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


    // ====================
    // 正在查看图片详情
    // 鼠标任意点击 = 关闭
    // ====================
    if (activeImageViewer) {

        if (!activeImageViewer.isAnimating) {
            closeImageDetails(activeImageViewer);
        }

        return;
    }


    // ====================
    // 正常状态：计算鼠标射线
    // ====================

    const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );

    const rc = new THREE.Raycaster();

    rc.setFromCamera(
        mouse,
        camera
    );


    // ====================
    // 视频
    // ====================

    const videoHits =
        rc.intersectObject(videoScreen);

    if (videoHits.length > 0) {

        toggleVideo();

        return;
    }


    // ====================
    // 展厅图片
    // ====================

    const imageMeshes =
        imageBoards.map(
            item => item.board
        );

    const imageHits =
        rc.intersectObjects(imageMeshes);

    if (imageHits.length > 0) {

        const hitBoard =
            imageHits[0].object;

        const imageGroup =
            imageBoards.find(
                item => item.board === hitBoard
            );

        if (imageGroup) {

            console.log(
                '🎯 点击图片:',
                imageGroup.id
            );

            openImageDetails(
                imageGroup
            );

            return;
        }
    }


    // ====================
    // 空白区域
    // ====================

    controls.lock();
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

     artifactItems.forEach((item, index) => {
        if (item.label) item.label.element.style.display = 'none';
        if (item.vrLabel) item.vrLabel.visible = false;
        // 调试用：看文物整体尺寸
        const box = new THREE.Box3().setFromObject(item.root);
        const size = new THREE.Vector3();
        box.getSize(size);
        console.log(index, item.data.name, '尺寸:', size, '根节点:', item.root.name);
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
        flyingItem.root.position.copy(
            flyingItem.root.parent.worldToLocal(flyTargetPos.clone())
        );
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

// ==================== 灯光系统（无天花板展厅均匀照明）====================

// 基础环境光：高亮度中性白，保证室内整体明亮无死黑
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

// 半球光：模拟天空/地面自然漫射，上亮下暗的柔和过渡
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
hemiLight.position.set(0, 10, 0);
scene.add(hemiLight);

// 主漫射光（模拟天窗自然光）：从上方均匀洒下，不产生硬阴影
const dirLight = new THREE.DirectionalLight(0xfffaf0, 0.8);
dirLight.position.set(2, 8, 3);
dirLight.castShadow = false;  // 展厅内几乎无阴影
scene.add(dirLight);

// 室内补光1：左侧墙壁反射光
const fillLight1 = new THREE.PointLight(0xfff5e8, 0.4);
fillLight1.position.set(-4, 3, 0);
scene.add(fillLight1);

// 室内补光2：右侧墙壁反射光
const fillLight2 = new THREE.PointLight(0xfff5e8, 0.4);
fillLight2.position.set(4, 3, 0);
scene.add(fillLight2);

// 室内补光3：深处补光，避免走廊/深处变暗
const deepLight = new THREE.PointLight(0xfff0e0, 0.3);
deepLight.position.set(0, 3, -6);
scene.add(deepLight);

// 外部暗角光：从展厅外缘打冷暗光，形成"外暗内亮"的空间层次
const outerDarkLight = new THREE.PointLight(0x334455, 0.2);
outerDarkLight.position.set(8, 2, 8);
scene.add(outerDarkLight);

// 网格辅助线
const gridHelper = new THREE.GridHelper(20, 20, 0x88aaff, 0x4466aa);
gridHelper.position.y = -0.5;
scene.add(gridHelper);

// ==================== 文物数据 ====================
let artifactsInfo = {
    Mesh_0: { name: "螺钿云龙纹圆盒", era: "清代·乾隆年制", collectionId: "M00123", description: "盒面嵌螺钿云龙纹，片片贝母流光溢彩。" },
    Mesh_0001: { name: "螺钿人物故事长方盒", era: "明代·天启年间", collectionId: "M00456", description: "描绘《西厢记》场景，螺片细密，工艺精湛。" }
};

// ==================== 展厅图片数据 ====================
// 一张墙面原图，可以对应多张详情图
const exhibitionImages = [
    {
        id: 'image1',

        // 墙上正常显示的原图
        original: './images/bed.jpg',

        // 点击后显示的详情图
        details: [
            './images/bed2.jpg',
           // './images/bed-detail2.jpg'
        ]
    },

    // 第二张图片，暂时可以先不使用
    {
        id: 'image2',
        original: './images/chair.jpg',
        details: [
            './images/chair2.jpg',
           // './images/image2-detail2.jpg'
        ]
    }
];

console.log('展厅图片数据:', exhibitionImages);

// 检查展厅图片数据是否正确
exhibitionImages.forEach(image => {
    console.log(
        `图片 ${image.id}：原图 = ${image.original}，详情图数量 = ${image.details.length}`
    );
});

const imageBoards = []; // 保存所有图片展板
const imageTextureLoader = new THREE.TextureLoader();
let activeImageViewer = null;
const IMAGE_OPEN_SPEED = 3.0;// 图片详情动画速度
// ==================== 创建单张图片展板 ====================
function createImagePlane(imagePath, position, name, visible = true) {

    // 初始几何体
    const geometry = new THREE.PlaneGeometry(2.4, 1.6);

    // 图片材质
    const material = new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);

    // 设置位置
    mesh.position.copy(position);

    // 设置名称
    mesh.name = name;

    // 设置显示状态
    mesh.visible = visible;

    // 加载图片
    imageTextureLoader.load(
        imagePath,

        (texture) => {

            // 色彩空间
            texture.colorSpace = THREE.SRGBColorSpace;

            // 纹理过滤
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;

            // 各向异性过滤
            texture.anisotropy =
                renderer.capabilities.getMaxAnisotropy();

            // 设置材质纹理
            material.map = texture;
            material.needsUpdate = true;


            // ==================== 根据图片比例调整尺寸 ====================

            const imageWidth = texture.image.width;
            const imageHeight = texture.image.height;

            if (imageWidth && imageHeight) {

                const aspect = imageWidth / imageHeight;

                // 固定高度
                const targetHeight = 1.6;

                // 根据比例计算宽度
                const targetWidth = targetHeight * aspect;

                mesh.scale.set(
                    targetWidth / 2.4,
                    targetHeight / 1.6,
                    1
                );
                if (mesh.userData.isExhibitionDetail) {
                    mesh.userData.originalScale =
                    mesh.scale.clone();
    }
            }

            console.log(
                `✅ 图片加载成功：${name}`,
                `${imageWidth} × ${imageHeight}`
            );
        },

        undefined,

        (error) => {
            console.error(
                `❌ 图片加载失败：${imagePath}`,
                error
            );
        }
    );

    // 加入场景
    scene.add(mesh);

    return mesh;
}


// ==================== 创建一组展厅图片 ====================
function createImageBoard(imageData, position) {

    // ------------------------------------------------
    // 1. 创建墙面原图
    // ------------------------------------------------

    const board = createImagePlane(
        imageData.original,
        position,
        `ExhibitionImage_${imageData.id}`,
        true
    );

    // 原图标记
    board.userData.isExhibitionImage = true;
    board.userData.imageId = imageData.id;
    board.userData.imageData = imageData;
    board.userData.imageType = 'original';


    // ------------------------------------------------
    // 2. 创建详情图
    // ------------------------------------------------

    const detailBoards = [];

    imageData.details.forEach((detailPath, index) => {

        const detailBoard = createImagePlane(
            detailPath,
            position,
            `ExhibitionDetail_${imageData.id}_${index + 1}`,
            false
        );

        // 详情图自己的数据
        detailBoard.userData.isExhibitionDetail = true;
        detailBoard.userData.imageId = imageData.id;
        detailBoard.userData.imageData = imageData;
        detailBoard.userData.imageType = 'detail';
        detailBoard.userData.detailIndex = index;

        // 保存“墙面原始位置”
        detailBoard.userData.originalPosition =
            position.clone();

        // 保存原始旋转
        detailBoard.userData.originalRotation =
            new THREE.Euler().copy(detailBoard.rotation);

        // 保存原始缩放
        detailBoard.userData.originalScale =
            detailBoard.scale.clone();

        detailBoards.push(detailBoard);

        console.log(
            `📌 创建详情图：${imageData.id} - detail${index + 1}`
        );
    });

    // 3. 保存整组图片信息
const imageGroupData = {
    // 图片 ID
    id: imageData.id,
    // 原始数据
    data: imageData,
    // 墙面原图
    board: board,
    // 详情图
    detailBoards: detailBoards,
    // 是否处于详情查看状态
    isDetailOpen: false,
    // 是否正在播放动画
    isAnimating: false,
    // 动画进度
    animationProgress: 0
};


    imageBoards.push(imageGroupData);


    console.log(
        `图片组创建完成：${imageData.id}`,
        `详情图数量：${detailBoards.length}`
    );


    return board;
}

// image1 的位置
createImageBoard(
    exhibitionImages[0],
    new THREE.Vector3(-3, 2.0, -3)
);
// image2 的位置
createImageBoard(
    exhibitionImages[1],
    new THREE.Vector3(3, 2.0, -3)
);
// ==================== 打开图片详情 ====================

function openImageDetails(imageGroup) {

    // 防止重复点击
    if (!imageGroup) return;
    if (imageGroup.isAnimating) return;
    if (imageGroup.isDetailOpen) return;

    console.log('🖼️ 打开图片详情:', imageGroup.id);

    // 当前正在查看的图片
    activeImageViewer = imageGroup;

    // 标记正在动画
    imageGroup.isAnimating = true;
    imageGroup.isDetailOpen = true;

    // 原图隐藏
    imageGroup.board.visible = false;

    // 获取玩家/相机的世界位置
    const cameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);

    imageGroup.detailBoards.forEach((detailBoard, index) => {

        // 显示详情图
        detailBoard.visible = true;

        // 从墙面位置开始
        detailBoard.position.copy(
            detailBoard.userData.originalPosition
        );

        // 恢复原始旋转
        detailBoard.rotation.copy(
            detailBoard.userData.originalRotation
        );

        // 从很小开始
        detailBoard.scale
            .copy(detailBoard.userData.originalScale)

        detailBoard.userData.animationStart =
            detailBoard.userData.originalPosition.clone();
        const direction =
            new THREE.Vector3()
                .subVectors(cameraWorldPos, detailBoard.userData.originalPosition)
                .normalize();
const targetPosition =
    cameraWorldPos.clone()
        .sub(direction.multiplyScalar(2.0));

targetPosition.y = cameraWorldPos.y;


// ==================== 多张详情图横向排列 ====================

const cameraRight =
    new THREE.Vector3(1, 0, 0)
        .applyQuaternion(camera.quaternion)
        .normalize();

const detailCount =
    imageGroup.detailBoards.length;

const spacing = 1.4;

const offsetX =
    (index - (detailCount - 1) / 2) * spacing;

targetPosition.addScaledVector(
    cameraRight,
    offsetX
);
        detailBoard.userData.animationTarget =
            targetPosition;
            // 让详情图正面朝向玩家
detailBoard.userData.animationTargetRotation =
    new THREE.Quaternion();

const lookMatrix =
    new THREE.Matrix4();

lookMatrix.lookAt(
    targetPosition,
    cameraWorldPos,
    new THREE.Vector3(0, 1, 0)
);

detailBoard.userData.animationTargetRotation
    .setFromRotationMatrix(lookMatrix);
        detailBoard.userData.animationStartScale =
            detailBoard.userData.originalScale.clone()
                .multiplyScalar(0.1);
        detailBoard.userData.animationTargetScale =
            detailBoard.userData.originalScale.clone()
                .multiplyScalar(1.0);
    });
    imageGroup.animationProgress = 0;
}

// ==================== 更新图片详情动画 ====================

// ==================== 图片详情动画 ====================
function updateImageViewer(delta) {

    if (!activeImageViewer) return;

    const imageGroup = activeImageViewer;

    if (!imageGroup.isAnimating) return;

    imageGroup.animationProgress +=
        delta * IMAGE_OPEN_SPEED;

    let t = imageGroup.animationProgress;

    t = Math.min(t, 1);

    // 缓出
    const eased =
        1 - Math.pow(1 - t, 3);

    imageGroup.detailBoards.forEach((detailBoard) => {

        const start =
            detailBoard.userData.animationStart;

        const target =
            detailBoard.userData.animationTarget;

        detailBoard.position.lerpVectors(
            start,
            target,
            eased
        );

        const startScale =
            detailBoard.userData.animationStartScale;

        const targetScale =
            detailBoard.userData.animationTargetScale;

        detailBoard.scale.lerpVectors(
            startScale,
            targetScale,
            eased
        );
    });

    // ==================== 动画结束 ====================
    if (t >= 1) {

        imageGroup.isAnimating = false;
        imageGroup.animationProgress = 1;

        // ====================
        // 正在关闭
        // ====================
        if (!imageGroup.isDetailOpen) {

            imageGroup.detailBoards.forEach(
                (detailBoard) => {

                    detailBoard.visible = false;

                    // 恢复原始旋转
                    detailBoard.rotation.copy(
                        detailBoard.userData.originalRotation
                    );

                    // 恢复原始尺寸
                    detailBoard.scale.copy(
                        detailBoard.userData.originalScale
                    );
                }
            );

            // 恢复墙上的原图
            imageGroup.board.visible = true;

            activeImageViewer = null;

            console.log(
                '✅ 图片详情关闭完成:',
                imageGroup.id
            );

        }

        // ====================
        // 正在打开
        // ====================
        else {

            console.log(
                '✅ 图片详情打开完成:',
                imageGroup.id
            );
        }
    }
}

// ==================== 关闭图片详情 ====================
function closeImageDetails(imageGroup) {

    if (!imageGroup) return;
    if (imageGroup.isAnimating) return;
    if (!imageGroup.isDetailOpen) return;

    console.log('🖼️ 关闭图片详情:', imageGroup.id);

imageGroup.isAnimating = true;
imageGroup.isDetailOpen = false;
imageGroup.animationProgress = 0;

    imageGroup.detailBoards.forEach((detailBoard) => {

        // 当前的位置作为关闭动画起点
        detailBoard.userData.animationStart =
            detailBoard.position.clone();

        // 回到墙面原始位置
        detailBoard.userData.animationTarget =
            detailBoard.userData.originalPosition.clone();

        // 当前大小作为起点
        detailBoard.userData.animationStartScale =
            detailBoard.scale.clone();

        // 缩小到原始尺寸的 10%
        detailBoard.userData.animationTargetScale =
            detailBoard.userData.originalScale
                .clone()
                .multiplyScalar(0.1);
    });

    // 注意：
    // 这里暂时不要立刻显示原图
    // 等详情图完全缩回去之后再恢复原图
}

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
// 获取加载面板元素（新增）
const loadingText = document.getElementById('loading-text');
const loadingDetail = document.getElementById('loading-detail');
const loadingPanel = document.getElementById('loading-panel');

loader.load('models/test.glb',
    // ========== 1. 加载成功 ==========
    (gltf) => {
        loadingText.textContent = '✅ 模型加载完成';
        loadingDetail.textContent = '正在渲染场景...';
        
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
                // ========== 纹理过滤与色彩空间修复（消除摩尔纹）==========
                if (c.material) {
                    const materials = Array.isArray(c.material) ? c.material : [c.material];
                    materials.forEach(mat => {
                        for (const key in mat) {
                            const value = mat[key];
                            if (value && value.isTexture) {
                                value.minFilter = THREE.LinearMipmapLinearFilter;
                                value.magFilter = THREE.LinearFilter;
                                value.anisotropy = renderer.capabilities.getMaxAnisotropy();
                                value.colorSpace = THREE.SRGBColorSpace;
                            }
                        }
                    });
                }
                // =========================================================
            }
        });
        console.log('===== 模型子物体清单 =====');
        console.log(allMeshNames.join(', '));
        console.log('==========================');
    
        const detectedArtifacts = [];
const presetKeys = Object.keys(artifactsInfo);

// 按"文物根节点"（model 的直接子节点）分组
model.children.forEach(root => {
    // 收集这个 Empty/Group 下的所有 Mesh
    const meshes = [];
    root.traverse(c => { if (c.isMesh) meshes.push(c); });
    if (meshes.length === 0) return; // 纯空物体，跳过

    // 匹配文物数据：优先用父级名，再用子 Mesh 名
    let key = root.name;
    let data = artifactsInfo[key];

    if (!data) {
        for (const mesh of meshes) {
            if (artifactsInfo[mesh.name]) {
                key = mesh.name;
                data = artifactsInfo[key];
                break;
            }
            const lowerName = mesh.name.toLowerCase();
            const matchKey = presetKeys.find(k => k.toLowerCase() === lowerName);
            if (matchKey) {
                key = matchKey;
                data = artifactsInfo[key];
                break;
            }
        }
    }

    // 没匹配到就自动生成
    if (!data && root.name.length > 2 && !root.name.toLowerCase().includes('grid') && !root.name.toLowerCase().includes('helper')) {
        data = {
            name: root.name,
            era: "未知年代",
            collectionId: "未编号",
            description: "自动探测到的展品，请在代码中补充详细信息。"
        };
        artifactsInfo[root.name] = data;
        detectedArtifacts.push(root.name);
    }

    if (data) {
        // 创建标签（基于整个文物的包围盒）
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
        const box = new THREE.Box3().setFromObject(root);
        const hh = box.max.y - box.min.y;
        label.position.copy(root.position);
        label.position.y += hh / 2 + 0.4;
        scene.add(label);

        const vrLabel = createVRLabel(data);
        vrLabel.position.copy(root.position);
        vrLabel.position.y += hh / 2 + 0.6;
        vrLabel.visible = false;
        scene.add(vrLabel);

        // 关键改动：存的是 root（整个文物），不是单个 mesh
        artifactItems.push({ 
            root: root,        // 文物根节点（Empty/Group）
            meshes: meshes,    // 它下面的所有 Mesh（用于射线检测）
            label, 
            vrLabel, 
            data 
        });
    }
});


        if (detectedArtifacts.length > 0) {
            console.warn('⚠️ 以下文物未在 artifactsInfo 中预设，已自动探测:', detectedArtifacts);
            console.warn('请修改 main.js 里的 artifactsInfo，把名字换成:', detectedArtifacts);
        }

        console.log(`模型加载完成，共 ${artifactItems.length} 个文物`);

        loadingText.textContent = '✅ 模型加载完成';
loadingDetail.textContent = '场景已就绪';

// 1秒后隐藏加载界面
setTimeout(() => {
    loadingPanel.style.display = 'none';
}, 1000);
    },
  


    // ========== 2. 加载进度（新增）==========
    (xhr) => {
        if (xhr.total) {
            const percent = (xhr.loaded / xhr.total * 100).toFixed(1);
            loadingText.textContent = '⏳ 正在加载模型';
            loadingDetail.textContent = `${percent}%`;
        }
       
    },

    // ========== 3. 加载失败（新增）==========
    (err) => {
        loadingText.textContent = '❌ 加载失败';
        loadingText.style.color = '#ff4444';
        
        let msg = err.message || '未知错误';
        if (msg.includes('DRACO')) msg = 'Draco 解码器失败';
        if (msg.includes('404')) msg = '模型文件找不到';
        if (msg.includes('Meshopt')) msg = 'Meshopt 不支持';
        if (msg.includes('TIMEOUT') || msg.includes('TIMED_OUT')) msg = '网络超时，请检查模型路径';
        
        loadingDetail.textContent = `错误：${msg}`;
        loadingDetail.style.color = '#ff6666';
        
        console.error('完整错误:', err);
    }

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
            flyingItem.root.position.copy(
                flyingItem.root.parent.worldToLocal(flyTargetPos.clone())
            );
            flyingItem = null;
        } else {
            const worldPos = new THREE.Vector3().lerpVectors(flyStartPos, flyTargetPos, flyProgress);
            flyingItem.root.position.copy(
                flyingItem.root.parent.worldToLocal(worldPos)
            );
        }
    }

    // 拿着物品时，更新整个文物的位置和旋转
    if (heldItem) {
        const root = heldItem.root;
        const playerForward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
        playerForward.y = 0;
        playerForward.normalize();
        const targetPos = player.position.clone()
            .addScaledVector(playerForward, heldItem.offset.z)
            .add(new THREE.Vector3(0, heldItem.offset.y, 0));
        root.position.copy(targetPos);

        const yRotQuat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), heldItemRotY
        );
        root.quaternion.copy(heldItemOriginalQuat).premultiply(yRotQuat);
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
         // --- 检测文物：检测所有根节点下的所有 Mesh ---
        const allMeshes = [];
        artifactItems.forEach(item => {
            item.meshes.forEach(mesh => {
                mesh._artifactItem = item;
                allMeshes.push(mesh);
            });
        });
        const hits = raycaster.intersectObjects(allMeshes);
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
            hitItem = hits[0].object._artifactItem;
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
        const pos = hitItem.root.position.clone();
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

    // 收集所有文物根节点下的所有 Mesh
    const allMeshes = [];
    artifactItems.forEach(item => {
        item.meshes.forEach(mesh => {
            mesh._artifactItem = item;  // 临时绑定，方便找回文物
            allMeshes.push(mesh);
        });
    });

    const hits = raycaster.intersectObjects(allMeshes);
    if (hits.length === 0 || hits[0].distance > 8) return null;
    return hits[0].object._artifactItem;  // 返回整个文物，不是单个 Mesh
}

// ==================== 查找控制器射线命中的展厅图片 ====================
function findHitImage(controller) {

    const raycaster =
        new THREE.Raycaster();

    const origin =
        new THREE.Vector3();

    const direction =
        new THREE.Vector3();

    controller.getWorldPosition(origin);

    direction.set(0, 0, -1);

    direction.applyQuaternion(
        controller.getWorldQuaternion(
            new THREE.Quaternion()
        )
    );

    raycaster.set(
        origin,
        direction
    );

    const imageMeshes =
        imageBoards.map(
            item => item.board
        );

    const hits =
        raycaster.intersectObjects(
            imageMeshes,
            false
        );

    if (hits.length === 0) {
        return null;
    }

    const hitBoard =
        hits[0].object;

    return imageBoards.find(
        item => item.board === hitBoard
    ) || null;
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


    // ====================
    // 正在查看图片详情
    // 任意控制器按键 = 关闭
    // ====================

    if (activeImageViewer) {

        if (!activeImageViewer.isAnimating) {

            console.log(
                '🥽 VR 退出图片详情'
            );

            closeImageDetails(
                activeImageViewer
            );
        }

        return;
    }


    // ====================
    // 视频
    // ====================

    if (isPointingVideo(controller)) {

        toggleVideo();

        return;
    }


    // ====================
    // 检查是否点击展厅图片
    // ====================

    const imageGroup =
        findHitImage(controller);

    if (imageGroup) {

        console.log(
            '🥽 VR 点击图片:',
            imageGroup.id
        );

        openImageDetails(
            imageGroup
        );

        return;
    }


    // ====================
    // 原来的物品抓取逻辑
    // ====================

    if (heldItem) {

        dropItem();

        return;
    }


    const item =
        findHitItem(controller);

    if (!item) return;

    heldController = controller;

    grabItem(item);
}

function onVRSelectEnd(event) {
    // 可留空
}

function grabItem(item) {
    heldItem = item;
    const root = item.root;  // 抓起整个文物父级
    
    heldItemOriginalParent = root.parent;
    root.updateWorldMatrix(true, false);
    heldItemOriginalWorldMatrix.copy(root.matrixWorld);
    heldItemOriginalQuat.copy(root.quaternion);
    heldItemRotY = 0;

    // 把整个 Empty/Group 从模型里摘出来，挂到场景根下
    heldItemOriginalParent.remove(root);
    scene.add(root);

    if (!heldItem.offset) {
        heldItem.offset = new THREE.Vector3(0, 0.8, 0.6);
    }

    if (item.vrLabel) item.vrLabel.visible = false;
}

function dropItem() {
    if (!heldItem) return;
    const item = heldItem;
    const root = item.root;

    root.getWorldPosition(flyStartPos);
    flyTargetPos.setFromMatrixPosition(heldItemOriginalWorldMatrix);

    // 从场景摘下来，塞回原父级（model）
    scene.remove(root);
    heldItemOriginalParent.add(root);

    flyingItem = item;
    flyProgress = 0;

    heldItem = null;
    heldItemOriginalParent = null;
    heldController = null;
    heldItemRotY = 0;
}

function forceDropItem() {
    if (!heldItem) return;
    const item = heldItem;
    const root = item.root;
    
    scene.remove(root);
    heldItemOriginalParent.add(root);
    const localPos = heldItemOriginalParent.worldToLocal(
        new THREE.Vector3().setFromMatrixPosition(heldItemOriginalWorldMatrix)
    );
    root.position.copy(localPos);
    root.quaternion.copy(heldItemOriginalQuat);
    
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

// 图片详情动画
updateImageViewer(delta);

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
