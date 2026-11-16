// Only the parts of three.js the viewer uses (js/viewer.js). Rebuild with:
//   npm i three@0.170 esbuild && npx esbuild scripts/three-entry.js --bundle --minify --format=iife --legal-comments=eof --outfile=js/vendor/three-bundle.min.js
import {
  ACESFilmicToneMapping, Box3, BufferAttribute, BufferGeometry, Color, DataTexture, DirectionalLight,
  EquirectangularReflectionMapping, Group, LineBasicMaterial, LineSegments, LinearFilter, MathUtils, Mesh,
  PCFSoftShadowMap, PMREMGenerator, PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
window.THREE = {
  ACESFilmicToneMapping, Box3, BufferAttribute, BufferGeometry, Color, DataTexture, DirectionalLight,
  EquirectangularReflectionMapping, Group, LineBasicMaterial, LineSegments, LinearFilter, MathUtils, Mesh,
  PCFSoftShadowMap, PMREMGenerator, PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial, Vector3, WebGLRenderer,
};
window.THREEX = { GLTFLoader, DRACOLoader, EXRLoader, OrbitControls, RoomEnvironment };
