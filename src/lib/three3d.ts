import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BASE = import.meta.env.BASE_URL;
let draco: DRACOLoader | null = null;

/** GLB를 읽는다 (Draco·Meshopt·KTX2 압축 모델 포함) */
export async function loadGlb(blob: Blob, renderer: THREE.WebGLRenderer): Promise<GLTF> {
  const loader = new GLTFLoader();
  if (!draco) {
    draco = new DRACOLoader();
    draco.setDecoderPath(`${BASE}three/draco/`);
  }
  loader.setDRACOLoader(draco);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}three/basis/`).detectSupport(renderer);
  loader.setKTX2Loader(ktx2);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const buf = await blob.arrayBuffer();
  return new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject));
}

export function makeEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

/** 모델이 화면 가운데에 알맞은 크기로 보이도록 카메라를 맞춘다 */
export function frameObject(obj: THREE.Object3D, camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1e-3);
  const fov = (camera.fov * Math.PI) / 180;
  const dist = radius / Math.sin(fov / 2) * 1.05;
  target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(0.6, 0.45, 1).normalize().multiplyScalar(dist));
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
}

/** 자산함 미리보기용: 모델 한 장 그림(투명 배경 PNG)을 만든다 */
export async function renderThumbnail(blob: Blob, size = 256): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.environment = makeEnvironment(renderer);
    const gltf = await loadGlb(blob, renderer);
    scene.add(gltf.scene);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    frameObject(gltf.scene, camera, new THREE.Vector3());
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
