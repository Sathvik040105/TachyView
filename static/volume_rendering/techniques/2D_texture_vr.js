import { Matrix4, transformByRotations } from '../utils.js';
import { createShader, createProgram } from '../utils.js';
import { Shaders } from '../shaders.js';

export class Texture2DVolumeRenderer {
    constructor(gl, volume) {
        this.gl = gl;
        this.volume = volume;
        this.textureSlices = [];
        this.program = null;
        this.quadVAO = null;

        this.rotationX = 0;
        this.rotationY = 0;
        this.zoom = 2.5;
        this.alpha = 0.8;

        this.colorTexture = null;
        this.opacityTexture = null;

        this.init();
    }

    init() {
        const gl = this.gl;

        const vs = createShader(gl, gl.VERTEX_SHADER, Shaders.texture2DWebGL2.vertex);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, Shaders.texture2DWebGL2.fragment);
        this.program = createProgram(gl, vs, fs);

        this.createTextureSlices();
        this.createQuad();
    }

    createTextureSlices() {
        const gl = this.gl;
        const { data, width, height, depth } = this.volume;

        for (let z = 0; z < depth; z++) {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            const sliceData = new Uint8Array(width * height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = z * width * height + y * width + x;
                    sliceData[y * width + x] = data[idx];
                }
            }

            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0,
                gl.RED, gl.UNSIGNED_BYTE, sliceData);

            this.textureSlices.push(texture);
        }

        console.log(`Created ${depth} texture slices`);
    }

    createQuad() {
        const gl = this.gl;

        const vertices = new Float32Array([
            -0.5, -0.5, 0.0, 0.0, 0.0,
             0.5, -0.5, 0.0, 1.0, 0.0,
             0.5,  0.5, 0.0, 1.0, 1.0,
            -0.5,  0.5, 0.0, 0.0, 1.0
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        this.quadVAO = { buffer, count: 4 };
    }

    updateTransferFunction(colorTexture, opacityTexture) {
        this.colorTexture = colorTexture;
        this.opacityTexture = opacityTexture;
    }

    render(width, height) {
        if (!this.colorTexture || !this.opacityTexture) return;

        const gl = this.gl;

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        const sliceOrder = this.computeSliceOrder();

        gl.useProgram(this.program);

        const mvp = Matrix4.createMVP(width, height, this.rotationX, this.rotationY, this.zoom, 
            this.volume.scaleX, this.volume.scaleY, this.volume.scaleZ);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uMVP'), false, mvp);

        gl.uniform1f(gl.getUniformLocation(this.program, 'uAlpha'), this.alpha);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uTexture'), 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uColormap'), 1);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uOpacitymap'), 2);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVAO.buffer);

        const posLoc = gl.getAttribLocation(this.program, 'aPosition');
        const texLoc = gl.getAttribLocation(this.program, 'aTexCoord');

        gl.enableVertexAttribArray(posLoc);
        gl.enableVertexAttribArray(texLoc);

        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 20, 12);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.opacityTexture);

        const halfDepth = 0.5;
        const sliceZLoc = gl.getUniformLocation(this.program, 'uSliceZ');
        for (const { slice } of sliceOrder) {
            const zPos = -halfDepth + slice / (this.volume.depth - 1);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.textureSlices[slice]);

            gl.uniform1f(sliceZLoc, zPos);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
        }

        gl.disableVertexAttribArray(posLoc);
        gl.disableVertexAttribArray(texLoc);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }

    computeSliceOrder() {
        const order = [];
        const halfDepth = 0.5;

        for (let z = 0; z < this.volume.depth; z++) {
            const zPos = -halfDepth + z / (this.volume.depth - 1);
            const transformed = transformByRotations(0, 0, zPos, this.rotationX, this.rotationY);
            const eyeZ = transformed.z - this.zoom;
            order.push({ eyeZ, slice: z });
        }

        order.sort((a, b) => a.eyeZ - b.eyeZ);
        return order;
    }

    cleanup() {
        const gl = this.gl;

        for (let i = 0; i < 8; i++) {
            gl.disableVertexAttribArray(i);
        }

        for (const texture of this.textureSlices) {
            gl.deleteTexture(texture);
        }
        gl.deleteProgram(this.program);
        gl.deleteBuffer(this.quadVAO.buffer);
    }
}