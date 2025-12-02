import { Matrix4, computeViewDirection } from '../utils.js';
import { createShader, createProgram } from '../utils.js';
import { Shaders } from '../shaders.js';

export class Texture3DVolumeRenderer {
    constructor(gl, volume) {
        this.gl = gl;
        this.volume = volume;
        
        this.program = null;
        this.volumeTexture = null;
        this.sliceVAO = null;

        this.rotationX = 0;
        this.rotationY = 0;
        this.zoom = 2.5;
        this.alpha = 0.8;
        this.brightness = 1.0;
        this.numSlices = 128;
        this.opacityMultiplier = 5.0;

        this.colorTexture = null;
        this.opacityTexture = null;

        this.init();
    }

    init() {
        const gl = this.gl;

        const shaderSource = Shaders.texture3DWebGL2;
        
        const vs = createShader(gl, gl.VERTEX_SHADER, shaderSource.vertex);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, shaderSource.fragment);
        this.program = createProgram(gl, vs, fs);

        this.createVolumeTexture();
        this.sliceVAO = { buffer: gl.createBuffer() };

        console.log('3D Texture Volume Renderer initialized (WebGL2)');
    }

    createVolumeTexture() {
        const gl = this.gl;
        const { data, width, height, depth } = this.volume;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, texture);

        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage3D(
            gl.TEXTURE_3D,
            0,                  // level
            gl.R8,              // internal format
            width,
            height,
            depth,
            0,                  // border
            gl.RED,             // format
            gl.UNSIGNED_BYTE,   // type
            data
        );

        this.volumeTexture = texture;
        this.textureTarget = gl.TEXTURE_3D;

        console.log(`Created true 3D texture: ${width}x${height}x${depth}`);
    }

    updateTransferFunction(colorTexture, opacityTexture) {
        this.colorTexture = colorTexture;
        this.opacityTexture = opacityTexture;
    }

    intersectEdge(planePoint, planeNormal, v0, v1) {
        const d0 = (v0[0] - planePoint[0]) * planeNormal[0] +
            (v0[1] - planePoint[1]) * planeNormal[1] +
            (v0[2] - planePoint[2]) * planeNormal[2];
        const d1 = (v1[0] - planePoint[0]) * planeNormal[0] +
            (v1[1] - planePoint[1]) * planeNormal[1] +
            (v1[2] - planePoint[2]) * planeNormal[2];

        if ((d0 > 0 && d1 > 0) || (d0 < 0 && d1 < 0)) return null;
        if (Math.abs(d0 - d1) < 1e-6) return null;

        const t = d0 / (d0 - d1);
        return [
            v0[0] + t * (v1[0] - v0[0]),
            v0[1] + t * (v1[1] - v0[1]),
            v0[2] + t * (v1[2] - v0[2])
        ];
    }

    generateSlicePolygon(sliceDepth, viewDir) {
        const bbox = [
            [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5],
            [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
            [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5],
            [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]
        ];

        const edges = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];

        const planePoint = [
            viewDir[0] * sliceDepth,
            viewDir[1] * sliceDepth,
            viewDir[2] * sliceDepth
        ];

        const vertices = [];

        for (const [i0, i1] of edges) {
            const intersection = this.intersectEdge(planePoint, viewDir, bbox[i0], bbox[i1]);
            if (intersection) {
                vertices.push({
                    pos: intersection,
                    tex: [
                        intersection[0] + 0.5,
                        intersection[1] + 0.5,
                        intersection[2] + 0.5
                    ]
                });
            }
        }

        if (vertices.length < 3) return [];

        const center = vertices.reduce((acc, v) => [
            acc[0] + v.pos[0], acc[1] + v.pos[1], acc[2] + v.pos[2]
        ], [0, 0, 0]).map(x => x / vertices.length);

        let tangent;
        if (Math.abs(viewDir[0]) > 0.5) {
            tangent = [-viewDir[2], 0, viewDir[0]];
        } else {
            tangent = [0, viewDir[2], -viewDir[1]];
        }
        const len = Math.hypot(tangent[0], tangent[1], tangent[2]);
        tangent = tangent.map(x => x / len);

        const bitangent = [
            viewDir[1] * tangent[2] - viewDir[2] * tangent[1],
            viewDir[2] * tangent[0] - viewDir[0] * tangent[2],
            viewDir[0] * tangent[1] - viewDir[1] * tangent[0]
        ];

        vertices.sort((a, b) => {
            const ax = (a.pos[0] - center[0]) * tangent[0] +
                (a.pos[1] - center[1]) * tangent[1] +
                (a.pos[2] - center[2]) * tangent[2];
            const ay = (a.pos[0] - center[0]) * bitangent[0] +
                (a.pos[1] - center[1]) * bitangent[1] +
                (a.pos[2] - center[2]) * bitangent[2];
            const bx = (b.pos[0] - center[0]) * tangent[0] +
                (b.pos[1] - center[1]) * tangent[1] +
                (b.pos[2] - center[2]) * tangent[2];
            const by = (b.pos[0] - center[0]) * bitangent[0] +
                (b.pos[1] - center[1]) * bitangent[1] +
                (b.pos[2] - center[2]) * bitangent[2];
            return Math.atan2(ay, ax) - Math.atan2(by, bx);
        });

        return vertices;
    }

    render(width, height) {
        if (!this.colorTexture || !this.opacityTexture) return;

        const gl = this.gl;

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        gl.useProgram(this.program);

        const mvp = Matrix4.createMVP(width, height, this.rotationX, this.rotationY, this.zoom);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uMVP'), false, mvp);

        const viewDir = computeViewDirection(this.rotationX, this.rotationY);

        const maxDist = Math.sqrt(3) * 0.5;
        const sliceDepths = [];
        for (let i = 0; i < this.numSlices; i++) {
            const t = i / (this.numSlices - 1);
            sliceDepths.push(-maxDist + 2 * maxDist * t);
        }
        sliceDepths.sort((a, b) => b - a);

        const alphaPerSlice = this.opacityMultiplier / Math.sqrt(this.numSlices);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uAlphaScale'), alphaPerSlice);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uBrightness'), this.brightness);

        gl.uniform1i(gl.getUniformLocation(this.program, 'uVolume'), 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uColormap'), 1);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uOpacitymap'), 2);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(this.textureTarget, this.volumeTexture);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.opacityTexture);

        for (const depth of sliceDepths) {
            const polygon = this.generateSlicePolygon(depth, viewDir);

            if (polygon.length >= 3) {
                const vertexData = new Float32Array(polygon.length * 6);
                for (let i = 0; i < polygon.length; i++) {
                    vertexData[i * 6 + 0] = polygon[i].pos[0];
                    vertexData[i * 6 + 1] = polygon[i].pos[1];
                    vertexData[i * 6 + 2] = polygon[i].pos[2];
                    vertexData[i * 6 + 3] = polygon[i].tex[0];
                    vertexData[i * 6 + 4] = polygon[i].tex[1];
                    vertexData[i * 6 + 5] = polygon[i].tex[2];
                }

                gl.bindBuffer(gl.ARRAY_BUFFER, this.sliceVAO.buffer);
                gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

                const posLoc = gl.getAttribLocation(this.program, 'aPosition');
                const texLoc = gl.getAttribLocation(this.program, 'aTexCoord');

                gl.enableVertexAttribArray(posLoc);
                gl.enableVertexAttribArray(texLoc);

                gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 24, 0);
                gl.vertexAttribPointer(texLoc, 3, gl.FLOAT, false, 24, 12);

                gl.drawArrays(gl.TRIANGLE_FAN, 0, polygon.length);

                gl.disableVertexAttribArray(posLoc);
                gl.disableVertexAttribArray(texLoc);
            }
        }

        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }

    setNumSlices(num) {
        this.numSlices = Math.max(32, Math.min(512, num));
    }

    cleanup() {
        const gl = this.gl;

        for (let i = 0; i < 8; i++) {
            gl.disableVertexAttribArray(i);
        }

        gl.deleteTexture(this.volumeTexture);
        gl.deleteProgram(this.program);
        gl.deleteBuffer(this.sliceVAO.buffer);
    }
}