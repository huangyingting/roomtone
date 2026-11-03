// PCFSoftShadowMap filtering from Three.js r170 (MIT), adapted to r187 depth textures.
// https://github.com/mrdoob/three.js/blob/r170/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js
import { ShaderChunk } from "three";

export function installOriginalSoftShadows() {
  const original = ShaderChunk.shadowmap_pars_fragment;
  ShaderChunk.shadowmap_pars_fragment = `
    float roomtoneShadowCompare(sampler2D shadowMap, vec2 uv, float compare) {
      return step(compare, texture2D(shadowMap, uv).r);
    }
    ${original.replace("shadow = step( shadowCoord.z, depth );", `
    vec2 texelSize = vec2(1.0) / shadowMapSize;
    float dx = texelSize.x;
    float dy = texelSize.y;
    vec2 uv = shadowCoord.xy;
    vec2 f = fract(uv * shadowMapSize + 0.5);
    uv -= f * texelSize;
    shadow = (
      roomtoneShadowCompare(shadowMap, uv, shadowCoord.z) +
      roomtoneShadowCompare(shadowMap, uv + vec2(dx, 0.0), shadowCoord.z) +
      roomtoneShadowCompare(shadowMap, uv + vec2(0.0, dy), shadowCoord.z) +
      roomtoneShadowCompare(shadowMap, uv + texelSize, shadowCoord.z) +
      mix(roomtoneShadowCompare(shadowMap, uv + vec2(-dx, 0.0), shadowCoord.z),
          roomtoneShadowCompare(shadowMap, uv + vec2(2.0 * dx, 0.0), shadowCoord.z), f.x) +
      mix(roomtoneShadowCompare(shadowMap, uv + vec2(-dx, dy), shadowCoord.z),
          roomtoneShadowCompare(shadowMap, uv + vec2(2.0 * dx, dy), shadowCoord.z), f.x) +
      mix(roomtoneShadowCompare(shadowMap, uv + vec2(0.0, -dy), shadowCoord.z),
          roomtoneShadowCompare(shadowMap, uv + vec2(0.0, 2.0 * dy), shadowCoord.z), f.y) +
      mix(roomtoneShadowCompare(shadowMap, uv + vec2(dx, -dy), shadowCoord.z),
          roomtoneShadowCompare(shadowMap, uv + vec2(dx, 2.0 * dy), shadowCoord.z), f.y) +
      mix(mix(roomtoneShadowCompare(shadowMap, uv + vec2(-dx, -dy), shadowCoord.z),
              roomtoneShadowCompare(shadowMap, uv + vec2(2.0 * dx, -dy), shadowCoord.z), f.x),
          mix(roomtoneShadowCompare(shadowMap, uv + vec2(-dx, 2.0 * dy), shadowCoord.z),
              roomtoneShadowCompare(shadowMap, uv + vec2(2.0 * dx, 2.0 * dy), shadowCoord.z), f.x), f.y)
    ) * (1.0 / 9.0);
  `)}`;
  return { dispose() { ShaderChunk.shadowmap_pars_fragment = original; } };
}
