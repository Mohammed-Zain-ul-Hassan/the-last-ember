import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  BlendFunction,
  RenderPass,
  TiltShiftEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  HueSaturationEffect,
  BrightnessContrastEffect,
} from 'postprocessing';
import { CONFIG } from '../config';

export interface Post {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: BloomEffect;
  tilt: TiltShiftEffect;
  vignette: VignetteEffect;
  tone: ToneMappingEffect;
  grade: HueSaturationEffect;
  contrast: BrightnessContrastEffect;
  resize(): void;
}

export function createPost(canvasHost: HTMLElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Post {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.render.dprCap));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvasHost.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 2 });
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: CONFIG.render.bloomThreshold,
    luminanceSmoothing: 0.12,
    intensity: CONFIG.render.bloomIntensity,
    radius: 0.72,
    levels: 7,
  });
  const tilt = new TiltShiftEffect({ offset: 0.04, rotation: 0, focusArea: 0.55, feather: 0.32, resolutionScale: 0.5 });
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.72 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const grade = new HueSaturationEffect({ saturation: 0.08, hue: 0 });
  const contrast = new BrightnessContrastEffect({ brightness: 0, contrast: 0.06 });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
  noise.blendMode.opacity.value = 0.18;

  composer.addPass(new EffectPass(camera, bloom, tilt, tone, grade, contrast, vignette, noise));

  const resize = () => {
    const w = canvasHost.clientWidth || window.innerWidth;
    const h = canvasHost.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.render.dprCap));
    renderer.setSize(w, h, false);
    composer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return { renderer, composer, bloom, tilt, vignette, tone, grade, contrast, resize };
}
