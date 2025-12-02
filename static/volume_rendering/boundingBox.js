import { Matrix4 } from './utils.js';
import { createShader, createProgram } from './utils.js';
import { Shaders } from './shaders.js';

export class BoundingBox {
    constructor(gl, volume = null) {
        this.gl = gl;
        this.program = null;
        this.vao = null;
        this.volume = volume;
        
        this.rotationX = 0;
        this.rotationY = 0;
        this.zoom = 2.5;
        
        this.init();
    }
    
    init() {
        const gl = this.gl;
        
        // Create shader program
        const vs = createShader(gl, gl.VERTEX_SHADER, Shaders.bbox.vertex);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, Shaders.bbox.fragment);
        this.program = createProgram(gl, vs, fs);
        
        // Create bounding box geometry
        this.createGeometry();
    }
    
    createGeometry() {
        const gl = this.gl;
        
        // 12 edges of a cube
        const vertices = new Float32Array([
            // Bottom face
            -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,
             0.5, -0.5, -0.5,   0.5, -0.5,  0.5,
             0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
            -0.5, -0.5,  0.5,  -0.5, -0.5, -0.5,
            // Top face
            -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
             0.5,  0.5, -0.5,   0.5,  0.5,  0.5,
             0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
            -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
            // Verticals
            -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,
             0.5, -0.5, -0.5,   0.5,  0.5, -0.5,
             0.5, -0.5,  0.5,   0.5,  0.5,  0.5,
            -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5
        ]);
        
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        
        this.vao = { buffer, count: 24 };
    }
    
    render(width, height) {
        const gl = this.gl;
        
        gl.useProgram(this.program);
        
        // Set MVP matrix with scale factors
        const scaleX = this.volume ? this.volume.scaleX : 1.0;
        const scaleY = this.volume ? this.volume.scaleY : 1.0;
        const scaleZ = this.volume ? this.volume.scaleZ : 1.0;
        const mvp = Matrix4.createMVP(width, height, this.rotationX, this.rotationY, this.zoom, scaleX, scaleY, scaleZ);
        const mvpLoc = gl.getUniformLocation(this.program, 'uMVP');
        gl.uniformMatrix4fv(mvpLoc, false, mvp);
        
        // Set color (black)
        const colorLoc = gl.getUniformLocation(this.program, 'uColor');
        gl.uniform3f(colorLoc, 0.0, 0.0, 0.0);
        
        // Bind and draw
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vao.buffer);
        
        const posLoc = gl.getAttribLocation(this.program, 'aPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.LINES, 0, this.vao.count);
        
        gl.disableVertexAttribArray(posLoc);
    }
    
    cleanup() {
        const gl = this.gl;
        gl.deleteProgram(this.program);
        gl.deleteBuffer(this.vao.buffer);
    }
}