import { Matrix4 } from '../utils.js';
import { createShader, createProgram } from '../utils.js';
import { Shaders } from '../shaders.js';

export class RayMarchingRenderer {
    constructor(gl, volume) {
        this.gl = gl;
        this.volume = volume;

        this.posProgram = null;
        this.raycastProgram = null;
        this.volumeTexture = null;
        this.cubeVAO = null;
        this.fbo = null;
        this.backFaceTexture = null;

        this.rotationX = 0;
        this.rotationY = 0;
        this.zoom = 2.5;
        this.brightness = 1.0;
        this.stepSize = 0.005;

        this.colorTexture = null;
        this.opacityTexture = null;

        this.init();
    }

    init() {
        const gl = this.gl;

        const posVs = createShader(gl, gl.VERTEX_SHADER, Shaders.raycastPositionWebGL2.vertex);
        const posFs = createShader(gl, gl.FRAGMENT_SHADER, Shaders.raycastPositionWebGL2.fragment);
        this.posProgram = createProgram(gl, posVs, posFs);

        const rayVs = createShader(gl, gl.VERTEX_SHADER, Shaders.raycastWebGL2.vertex);
        const rayFs = createShader(gl, gl.FRAGMENT_SHADER, Shaders.raycastWebGL2.fragment);
        this.raycastProgram = createProgram(gl, rayVs, rayFs);

        this.createVolumeTexture();
        this.createCubeGeometry();
        this.createFramebuffer();

        console.log('GPU Raycasting Renderer initialized');
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
            0,
            gl.R8,
            width,
            height,
            depth,
            0,
            gl.RED,
            gl.UNSIGNED_BYTE,
            data
        );

        this.volumeTexture = texture;
        this.textureTarget = gl.TEXTURE_3D;

        console.log(`Created raycasting 3D texture: ${width}x${height}x${depth}`);
    }

    updateTransferFunction(colorTexture, opacityTexture) {
        this.colorTexture = colorTexture;
        this.opacityTexture = opacityTexture;
    }

    createCubeGeometry() {
        const gl = this.gl;

        const vertices = new Float32Array([
            -0.5, -0.5,  0.5,
             0.5, -0.5,  0.5,
             0.5,  0.5,  0.5,
            -0.5,  0.5,  0.5,
            -0.5, -0.5, -0.5,
             0.5, -0.5, -0.5,
             0.5,  0.5, -0.5,
            -0.5,  0.5, -0.5
        ]);

        const indices = new Uint16Array([
            0, 1, 2, 2, 3, 0,
            1, 5, 6, 6, 2, 1,
            5, 4, 7, 7, 6, 5,
            4, 0, 3, 3, 7, 4,
            3, 2, 6, 6, 7, 3,
            4, 5, 1, 1, 0, 4
        ]);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        this.cubeVAO = { vbo, ebo, count: 36 };
    }

    createFramebuffer() {
        const gl = this.gl;
        const canvas = gl.canvas;

        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

        this.backFaceTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.backFaceTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, this.backFaceTexture, 0);

        const depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16,
            canvas.width, canvas.height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
            gl.RENDERBUFFER, depthBuffer);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('Framebuffer incomplete!');
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    render(width, height) {
        if (!this.colorTexture || !this.opacityTexture) return;

        const gl = this.gl;
        const mvp = Matrix4.createMVP(width, height, this.rotationX, this.rotationY, this.zoom,
            this.volume.scaleX, this.volume.scaleY, this.volume.scaleZ);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, width, height);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);

        gl.useProgram(this.posProgram);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.posProgram, 'uMVP'), false, mvp);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVAO.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeVAO.ebo);

        const posLoc = gl.getAttribLocation(this.posProgram, 'aPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
        gl.drawElements(gl.TRIANGLES, this.cubeVAO.count, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.CULL_FACE);
        gl.disableVertexAttribArray(posLoc);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(this.raycastProgram);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.raycastProgram, 'uMVP'), false, mvp);
        gl.uniform2f(gl.getUniformLocation(this.raycastProgram, 'uScreenSize'), width, height);
        gl.uniform1f(gl.getUniformLocation(this.raycastProgram, 'uStepSize'), this.stepSize);
        gl.uniform1f(gl.getUniformLocation(this.raycastProgram, 'uBrightness'), this.brightness);

        gl.uniform1i(gl.getUniformLocation(this.raycastProgram, 'uVolume'), 0);
        gl.uniform1i(gl.getUniformLocation(this.raycastProgram, 'uBackFace'), 1);
        gl.uniform1i(gl.getUniformLocation(this.raycastProgram, 'uColormap'), 2);
        gl.uniform1i(gl.getUniformLocation(this.raycastProgram, 'uOpacitymap'), 3);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, this.volumeTexture);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.backFaceTexture);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);

        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.opacityTexture);

        const posLoc2 = gl.getAttribLocation(this.raycastProgram, 'aPosition');
        gl.enableVertexAttribArray(posLoc2);
        gl.vertexAttribPointer(posLoc2, 3, gl.FLOAT, false, 0, 0);

        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.drawElements(gl.TRIANGLES, this.cubeVAO.count, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.CULL_FACE);

        gl.disableVertexAttribArray(posLoc2);
    }

    setNumSlices(num) {
        this.stepSize = 0.05 / (num / 32);
    }

    cleanup() {
        const gl = this.gl;

        for (let i = 0; i < 8; i++) {
            gl.disableVertexAttribArray(i);
        }

        gl.deleteTexture(this.volumeTexture);
        gl.deleteTexture(this.backFaceTexture);
        gl.deleteFramebuffer(this.fbo);
        gl.deleteProgram(this.posProgram);
        gl.deleteProgram(this.raycastProgram);
        gl.deleteBuffer(this.cubeVAO.vbo);
        gl.deleteBuffer(this.cubeVAO.ebo);
    }
}