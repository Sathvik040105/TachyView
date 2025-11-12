/**
 * Matrix and math utilities for WebGL volume rendering
 */

export class Matrix4 {
    /**
     * Multiply two 4x4 matrices (column-major)
     */
    static multiply(a, b) {
        const out = new Float32Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[k * 4 + r] * b[c * 4 + k];
                }
                out[c * 4 + r] = sum;
            }
        }
        return out;
    }

    /**
     * Create perspective projection matrix
     */
    static perspective(fov, aspect, near, far) {
        const f = 1.0 / Math.tan(fov / 2);
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) / (near - far), -1,
            0, 0, (2 * far * near) / (near - far), 0
        ]);
    }

    /**
     * Create rotation matrix around X axis
     */
    static rotationX(angle) {
        const c = Math.cos(angle * Math.PI / 180);
        const s = Math.sin(angle * Math.PI / 180);
        return new Float32Array([
            1, 0, 0, 0,
            0, c, s, 0,
            0, -s, c, 0,
            0, 0, 0, 1
        ]);
    }

    /**
     * Create rotation matrix around Y axis
     */
    static rotationY(angle) {
        const c = Math.cos(angle * Math.PI / 180);
        const s = Math.sin(angle * Math.PI / 180);
        return new Float32Array([
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1
        ]);
    }

    /**
     * Create translation matrix
     */
    static translation(x, y, z) {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            x, y, z, 1
        ]);
    }

    /**
     * Create Model-View-Projection matrix
     */
    static createMVP(windowWidth, windowHeight, rotationX, rotationY, zoom) {
        const aspect = windowWidth / windowHeight;
        const fov = 45 * Math.PI / 180;
        const projection = Matrix4.perspective(fov, aspect, 0.1, 100);
        
        const rotX = Matrix4.rotationX(rotationX);
        const rotY = Matrix4.rotationY(rotationY);
        const translate = Matrix4.translation(0, 0, -zoom);
        
        const temp1 = Matrix4.multiply(rotX, rotY);
        const temp2 = Matrix4.multiply(translate, temp1);
        return Matrix4.multiply(projection, temp2);
    }
}

/**
 * Transform a 3D point by rotation matrices
 */
export function transformByRotations(x, y, z, rotationX, rotationY) {
    const radX = rotationX * Math.PI / 180;
    const radY = rotationY * Math.PI / 180;
    
    const cosX = Math.cos(radX);
    const sinX = Math.sin(radX);
    const cosY = Math.cos(radY);
    const sinY = Math.sin(radY);
    
    // Apply rotX
    const rx = x;
    const ry = cosX * y + sinX * z;
    const rz = -sinX * y + cosX * z;
    
    // Apply rotY
    return {
        x: cosY * rx - sinY * rz,
        y: ry,
        z: sinY * rx + cosY * rz
    };
}

/**
 * Compute view direction in object space
 */
export function computeViewDirection(rotX, rotY) {
    const radX = rotX * Math.PI / 180;
    const radY = rotY * Math.PI / 180;
    
    const cosX = Math.cos(radX);
    const sinX = Math.sin(radX);
    const cosY = Math.cos(radY);
    const sinY = Math.sin(radY);
    
    const viewDir = [
        sinY,
        -sinX * cosY,
        -cosX * cosY
    ];
    
    // Normalize
    const len = Math.sqrt(viewDir[0]**2 + viewDir[1]**2 + viewDir[2]**2);
    return viewDir.map(v => v / len);
}

/**
 * FPS counter utility
 */
export class FPSCounter {
    constructor() {
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;
    }
    
    update() {
        this.frameCount++;
        const currentTime = performance.now();
        
        if (currentTime - this.lastTime > 1000) {
            this.fps = (this.frameCount * 1000 / (currentTime - this.lastTime)).toFixed(2);
            this.frameCount = 0;
            this.lastTime = currentTime;
        }
        
        return this.fps;
    }
}

/**
 * WebGL shader compilation utility
 */
export function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    
    return shader;
}

/**
 * WebGL program linking utility
 */
export function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    
    return program;
}