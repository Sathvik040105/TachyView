export const Shaders = {
    // 2D Texture Slicing Shaders
    texture2D: {
        vertex: `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;

            varying vec2 vTexCoord;

            uniform mat4 uMVP;
            uniform float uSliceZ;

            void main() {
                vec3 pos = aPosition;
                pos.z += uSliceZ;
                gl_Position = uMVP * vec4(pos, 1.0);
                vTexCoord = aTexCoord;
            }
        `,
        fragment: `
            precision mediump float;

            varying vec2 vTexCoord;

            uniform sampler2D uTexture;
            uniform sampler2D uColormap;
            uniform sampler2D uOpacitymap;
            uniform float uAlpha;
            uniform float uBrightness;

            void main() {
                float intensity = texture2D(uTexture, vTexCoord).r;
                intensity = clamp(intensity, 0.0, 1.0);

                vec3 color = texture2D(uColormap, vec2(intensity, 0.5)).rgb * uBrightness;
                float opacity = texture2D(uOpacitymap, vec2(intensity, 0.5)).r * uAlpha;

                gl_FragColor = vec4(color * opacity, opacity);
            }
        `
    },
    
    // 3D Texture with View-Aligned Slicing
    texture3D: {
        vertex: `
            attribute vec3 aPosition;
            attribute vec3 aTexCoord;

            varying vec3 vTexCoord;

            uniform mat4 uMVP;

            void main() {
                gl_Position = uMVP * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
            }
        `,
        fragment: `
            precision mediump float;

            varying vec3 vTexCoord;

            uniform sampler2D uVolume;
            uniform sampler2D uColormap;
            uniform sampler2D uOpacitymap;
            uniform vec3 uDimensions;
            uniform float uAlphaScale;
            uniform float uBrightness;
            uniform float uSlicesPerRow;
            uniform float uSlicesPerCol;
            uniform vec2 uSliceSize;
            uniform vec2 uTexelSize;

            float sampleVolume(vec3 pos) {
                if (pos.x < 0.0 || pos.x > 1.0 ||
                    pos.y < 0.0 || pos.y > 1.0 ||
                    pos.z < 0.0 || pos.z > 1.0) {
                    return 0.0;
                }

                float depth = uDimensions.z;
                float z = pos.z * (depth - 1.0);
                float z0 = floor(z);
                float z1 = min(z0 + 1.0, depth - 1.0);
                float zFrac = z - z0;

                float sliceRow0 = floor(z0 / uSlicesPerRow);
                float sliceCol0 = mod(z0, uSlicesPerRow);
                float sliceRow1 = floor(z1 / uSlicesPerRow);
                float sliceCol1 = mod(z1, uSlicesPerRow);

                vec2 local = vec2(pos.x, pos.y) * (uSliceSize - uTexelSize) + 0.5 * uTexelSize;
                vec2 base0 = vec2(sliceCol0, sliceRow0) * uSliceSize;
                vec2 base1 = vec2(sliceCol1, sliceRow1) * uSliceSize;

                float val0 = texture2D(uVolume, base0 + local).r;
                float val1 = texture2D(uVolume, base1 + local).r;

                return mix(val0, val1, zFrac);
            }

            void main() {
                float intensity = sampleVolume(vTexCoord);
                intensity = clamp(intensity, 0.0, 1.0);

                vec3 color = texture2D(uColormap, vec2(intensity, 0.5)).rgb * uBrightness;
                float opacity = texture2D(uOpacitymap, vec2(intensity, 0.5)).r * uAlphaScale;

                gl_FragColor = vec4(color * opacity, opacity);
            }
        `
    },
    
    // GPU Raycasting - Position Pass (for back faces)
    raycastPosition: {
        vertex: `
            attribute vec3 aPosition;

            varying vec3 vTexCoord;

            uniform mat4 uMVP;

            void main() {
                gl_Position = uMVP * vec4(aPosition, 1.0);
                vTexCoord = aPosition + 0.5;
            }
        `,
        fragment: `
            precision highp float;

            varying vec3 vTexCoord;

            void main() {
                gl_FragColor = vec4(vTexCoord, 1.0);
            }
        `
    },
    
    // GPU Raycasting - Main Pass
    raycast: {
        vertex: `
            attribute vec3 aPosition;

            varying vec3 vTexCoord;

            uniform mat4 uMVP;

            void main() {
                gl_Position = uMVP * vec4(aPosition, 1.0);
                vTexCoord = aPosition + 0.5;
            }
        `,
        fragment: `
            precision highp float;

            varying vec3 vTexCoord;

            uniform sampler2D uVolume;
            uniform sampler2D uBackFace;
            uniform sampler2D uColormap;
            uniform sampler2D uOpacitymap;
            uniform vec3 uDimensions;
            uniform vec2 uScreenSize;
            uniform float uStepSize;
            uniform float uBrightness;
            uniform float uSlicesPerRow;
            uniform float uSlicesPerCol;
            uniform vec2 uSliceSize;
            uniform vec2 uTexelSize;

            float sampleVolume(vec3 pos) {
                if (pos.x < 0.0 || pos.x > 1.0 ||
                    pos.y < 0.0 || pos.y > 1.0 ||
                    pos.z < 0.0 || pos.z > 1.0) {
                    return 0.0;
                }

                float depth = uDimensions.z;
                float z = pos.z * (depth - 1.0);
                float z0 = floor(z);
                float z1 = min(z0 + 1.0, depth - 1.0);
                float zFrac = z - z0;

                float sliceRow0 = floor(z0 / uSlicesPerRow);
                float sliceCol0 = mod(z0, uSlicesPerRow);
                float sliceRow1 = floor(z1 / uSlicesPerRow);
                float sliceCol1 = mod(z1, uSlicesPerRow);

                vec2 local = vec2(pos.x, pos.y) * (uSliceSize - uTexelSize) + 0.5 * uTexelSize;
                vec2 base0 = vec2(sliceCol0, sliceRow0) * uSliceSize;
                vec2 base1 = vec2(sliceCol1, sliceRow1) * uSliceSize;

                float val0 = texture2D(uVolume, base0 + local).r;
                float val1 = texture2D(uVolume, base1 + local).r;

                return mix(val0, val1, zFrac);
            }

            void main() {
                vec2 screenPos = gl_FragCoord.xy / uScreenSize;
                vec3 entryPoint = vTexCoord;
                vec3 exitPoint = texture2D(uBackFace, screenPos).rgb;

                if (any(lessThan(entryPoint, vec3(0.0))) || any(greaterThan(entryPoint, vec3(1.0)))) {
                    discard;
                }

                vec3 rayDir = exitPoint - entryPoint;
                float rayLength = length(rayDir);

                if (rayLength < 0.0001) discard;

                rayDir = normalize(rayDir);
                vec4 accumulated = vec4(0.0);

                float maxSteps = 1024.0;
                float desiredSteps = rayLength / max(uStepSize, 1e-4);
                float stepCount = clamp(desiredSteps, 1.0, maxSteps);
                float actualStep = rayLength / stepCount;
                int numSteps = int(stepCount + 0.5);

                for (int i = 0; i < 1024; i++) {
                    if (i >= numSteps) break;
                    if (accumulated.a >= 0.95) break;

                    float t = float(i) * actualStep;
                    vec3 samplePos = entryPoint + rayDir * t;

                    if (any(lessThan(samplePos, vec3(0.0))) ||
                        any(greaterThan(samplePos, vec3(1.0)))) {
                        continue;
                    }

                    float intensity = clamp(sampleVolume(samplePos) * uBrightness, 0.0, 1.0);

                    vec3 color = texture2D(uColormap, vec2(intensity, 0.5)).rgb;
                    float opacity = texture2D(uOpacitymap, vec2(intensity, 0.5)).r;

                    opacity = 1.0 - pow(1.0 - opacity, actualStep * 200.0);

                    vec3 src = color * opacity;
                    accumulated.rgb += (1.0 - accumulated.a) * src;
                    accumulated.a += (1.0 - accumulated.a) * opacity;
                }

                gl_FragColor = vec4(accumulated.rgb, accumulated.a);
            }
        `
    },
    
    // Bounding Box Shader
    bbox: {
        vertex: `
            attribute vec3 aPosition;
            uniform mat4 uMVP;

            void main() {
                gl_Position = uMVP * vec4(aPosition, 1.0);
            }
        `,
        fragment: `
            precision mediump float;
            uniform vec3 uColor;

            void main() {
                gl_FragColor = vec4(uColor, 1.0);
            }
        `
    }
};