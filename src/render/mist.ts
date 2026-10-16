import * as THREE from 'three';

// Ground mist: three's exponential fog, plus a layer that lies along the ground and thickens with distance. Low
// things far away sink into it (the feet of the ruins, the bases of the distant skylines, the land far below the
// city wall) while what stands tall stays clear. It patches the fog shader chunks, so every fogged material gets it
// for free: import this module before anything renders.

const MIST = { reach: 0.07, height: 0.55, strength: 0.55 };

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogY;
#endif`;

THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // world height of this vertex: undo the (rigid) view transform
  vFogY = ( transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) ).y;
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float mist = ( 1.0 - exp( - vFogDepth * ${MIST.reach.toFixed(3)} ) ) * exp( - max( vFogY, 0.0 ) * ${MIST.height.toFixed(3)} ) * ${MIST.strength.toFixed(3)};
  fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - mist );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
