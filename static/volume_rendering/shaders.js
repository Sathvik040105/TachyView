export const Shaders = {
    // 2D Texture Slicing Shaders (WebGL2)
    texture2DWebGL2: {
        vertex: `#version 300 es
            in vec3 aPosition;
            in vec2 aTexCoord;

            out vec2 vTexCoord;

            uniform mat4 uMVP;
            uniform float uSliceZ;

            void main() {
                vec3 pos = aPosition;
                pos.z += uSliceZ;
                gl_Position = uMVP * vec4(pos, 1.0);
                vTexCoord = aTexCoord;
            }
        `,
        fragment: `#version 300 es
            precision highp float;

            in vec2 vTexCoord;
            out vec4 FragColor;

            uniform sampler2D uTexture;
            uniform sampler2D uColormap;
            uniform sampler2D uOpacitymap;
            uniform float uAlpha;
            uniform float uBrightness;

            void main() {
                float intensity = texture(uTexture, vTexCoord).r;
                intensity = clamp(intensity, 0.0, 1.0);

                vec3 color = texture(uColormap, vec2(intensity, 0.5)).rgb * uBrightness;
                float opacity = texture(uOpacitymap, vec2(intensity, 0.5)).r * uAlpha;

                FragColor = vec4(color * opacity, opacity);
            }
        `
    },
    
    // WebGL2 3D Texture with View-Aligned Slicing
    texture3DWebGL2: {
        vertex: `#version 300 es
            in vec3 aPosition;
            in vec3 aTexCoord;

            out vec3 vTexCoord;

            uniform mat4 uMVP;

            void main() {
                gl_Position = uMVP * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
            }
        `,
        fragment: `#version 300 es
            precision highp float;
            precision highp sampler3D;

            in vec3 vTexCoord;
            out vec4 FragColor;

            uniform sampler3D uVolume;
            uniform sampler2D uColormap;
            uniform sampler2D uOpacitymap;
            uniform float uAlphaScale;
            uniform float uBrightness;

            void main() {
                // Hardware trilinear interpolation
                float intensity = texture(uVolume, vTexCoord).r;
                intensity = clamp(intensity, 0.0, 1.0);

                vec3 color = texture(uColormap, vec2(intensity, 0.5)).rgb * uBrightness;
                float opacity = texture(uOpacitymap, vec2(intensity, 0.5)).r * uAlphaScale;

                // Premultiplied alpha
                FragColor = vec4(color * opacity, opacity);
            }
        `
    },
    
    // GPU Raycasting - Position Pass (WebGL2)
    raycastPositionWebGL2: {
        vertex: `#version 300 es
            in vec3 aPosition;

            out vec3 vTexCoord;

            uniform mat4 uMVP;

            void main() {
                gl_Position = uMVP * vec4(aPosition, 1.0);
                vTexCoord = aPosition + 0.5;
            }
        `,
        fragment: `#version 300 es
            precision highp float;

            in vec3 vTexCoord;
            out vec4 FragColor;

            void main() {
                FragColor = vec4(vTexCoord, 1.0);
            }
        `
    },
    
    // GPU Raycasting - Main Pass (WebGL2)
    raycastWebGL2: {
        vertex: `#version 300 es
            in vec3 aPosition;

            out vec3 vTexCoord;

            uniform mat4 uMVP;

            void main() {
                gl_Position = uMVP * vec4(aPosition, 1.0);
                vTexCoord = aPosition + 0.5;
            }
        `,
        fragment: `#version 300 es
            precision highp float;
            precision highp sampler3D;

            in vec3 vTexCoord;
            out vec4 FragColor;

            uniform sampler3D uVolume;
            uniform sampler2D uBackFace;
            uniform sampler2D uColormap;
            uniform sampler2D uOpacitymap;
            uniform vec2 uScreenSize;
            uniform float uStepSize;
            uniform float uBrightness;

            void main() {
                vec2 screenPos = gl_FragCoord.xy / uScreenSize;
                vec3 entryPoint = vTexCoord;
                vec3 exitPoint = texture(uBackFace, screenPos).rgb;

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

                    float intensity = clamp(texture(uVolume, samplePos).r * uBrightness, 0.0, 1.0);

                    vec3 color = texture(uColormap, vec2(intensity, 0.5)).rgb;
                    float opacity = texture(uOpacitymap, vec2(intensity, 0.5)).r;

                    opacity = 1.0 - pow(1.0 - opacity, actualStep * 200.0);

                    vec3 src = color * opacity;
                    accumulated.rgb += (1.0 - accumulated.a) * src;
                    accumulated.a += (1.0 - accumulated.a) * opacity;
                }

                FragColor = vec4(accumulated.rgb, accumulated.a);
            }
        `
    },
    
    // Bounding Box Shader (WebGL2)
    bbox: {
        vertex: `#version 300 es
            in vec3 aPosition;
            uniform mat4 uMVP;

            void main() {
                gl_Position = uMVP * vec4(aPosition, 1.0);
            }
        `,
        fragment: `#version 300 es
            precision highp float;
            uniform vec3 uColor;
            out vec4 FragColor;

            void main() {
                FragColor = vec4(uColor, 1.0);
            }
        `
    }
};