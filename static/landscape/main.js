import { Matrix4 } from '../volume_rendering/utils.js';

export class LandscapeApp {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');

        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        this.program = null;
        this.buffers = {
            nodes: null,
            nodeValues: null,
            links: null,
            linkValues: null,
            axes: null,
            axisValues: null,
            grid: null,
            gridValues: null
        };
        this.data = {
            nodeCount: 0,
            linkCount: 0
        };

        // Camera state
        this.camera = {
            rotationX: 30,
            rotationY: 0,
            distance: 2.5,
            center: [0, 0, 0]
        };

        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this.axisVertexCount = 0;
        this.gridVertexCount = 0;

        this.initShaders();
        this.setupInteraction();
        this.updateReferenceGeometry();
        
        // Start render loop
        this.render = this.render.bind(this);
        requestAnimationFrame(this.render);
    }

    initShaders() {
        const vsSource = `
            attribute vec3 aPosition;
            attribute float aValue;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            
            varying float vValue;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                gl_PointSize = 5.0;
                vValue = aValue;
            }
        `;

        const fsSource = `
            precision mediump float;
            
            varying float vValue;
            
            vec3 colormap(float t) {
                if (t < -3.5) {
                    return vec3(0.7, 0.7, 0.7); // Grid -> neutral gray
                }
                if (t < -2.5) {
                    return vec3(0.0, 0.0, 1.0); // Z axis -> blue
                }
                if (t < -1.5) {
                    return vec3(0.0, 1.0, 0.0); // Y axis -> green
                }
                if (t < -0.5) {
                    return vec3(1.0, 0.0, 0.0); // X axis -> red
                }

                // Simple heatmap (blue -> green -> red)
                return vec3(
                    smoothstep(0.5, 1.0, t),
                    smoothstep(0.0, 0.5, t) - smoothstep(0.5, 1.0, t),
                    smoothstep(0.0, 0.5, 1.0 - t)
                );
            }

            void main() {
                gl_FragColor = vec4(colormap(vValue), 1.0);
            }
        `;

        const vertexShader = this.loadShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, fsSource);

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(this.program));
            return;
        }

        this.attribLocations = {
            vertexPosition: this.gl.getAttribLocation(this.program, 'aPosition'),
            vertexValue: this.gl.getAttribLocation(this.program, 'aValue'),
        };

        this.uniformLocations = {
            projectionMatrix: this.gl.getUniformLocation(this.program, 'uProjectionMatrix'),
            modelViewMatrix: this.gl.getUniformLocation(this.program, 'uModelViewMatrix'),
        };
    }

    loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('An error occurred compiling the shaders: ' + this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    setData(spineData) {
        console.log("LandscapeApp.setData called", spineData);
        if (!spineData || !spineData.nodes || !spineData.link) {
            console.warn("Invalid spine data");
            return;
        }

        const nodes = spineData.nodes;
        const links = spineData.link;
        console.log(`Nodes: ${nodes.length}, Links: ${links.length}`);

        // Normalize data
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minVal = Infinity, maxVal = -Infinity;

        nodes.forEach(node => {
            const px = Number(node.position[0]);
            const py = Number(node.position[1]);
            const fv = Number(node.functionValue);

            minX = Math.min(minX, px);
            maxX = Math.max(maxX, px);
            minY = Math.min(minY, py);
            maxY = Math.max(maxY, py);
            minVal = Math.min(minVal, fv);
            maxVal = Math.max(maxVal, fv);
        });

        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;
        const rangeVal = maxVal - minVal || 1;

        // Create buffers
        // Nodes
        const nodePositions = [];
        const nodeValues = [];
        
        nodes.forEach(node => {
            const px = Number(node.position[0]);
            const py = Number(node.position[1]);
            const fv = Number(node.functionValue);

            // Map to [-1, 1] range
            const x = ((px - minX) / rangeX) * 2 - 1;
            const y = ((py - minY) / rangeY) * 2 - 1;
            // Map value to height (Y axis in 3D)
            const z = ((fv - minVal) / rangeVal); // 0 to 1
            const height = z * 2 - 1; // -1 to 1

            // We'll use Y as up. So (x, height, y)
            nodePositions.push(x, height, y);
            nodeValues.push(z);
        });

        // Links (lines)
        const linkPositions = [];
        const linkValues = [];

        const resolveLinkIndices = (link) => {
            if (link == null) {
                return null;
            }

            if (typeof link === 'string') {
                const parts = link.split('-');
                if (parts.length !== 2) {
                    return null;
                }
                const a = Number(parts[0]);
                const b = Number(parts[1]);
                return Number.isNaN(a) || Number.isNaN(b) ? null : { source: a, target: b };
            }

            if (typeof link === 'object') {
                if (link.source !== undefined && link.target !== undefined) {
                    return { source: Number(link.source), target: Number(link.target) };
                }
                if (Array.isArray(link) && link.length === 2) {
                    const a = Number(link[0]);
                    const b = Number(link[1]);
                    return Number.isNaN(a) || Number.isNaN(b) ? null : { source: a, target: b };
                }
            }

            return null;
        };

        links.forEach(link => {
            const resolved = resolveLinkIndices(link);
            if (!resolved) {
                console.warn('LandscapeApp: unable to parse link entry', link);
                return;
            }

            const sourceNode = nodes[resolved.source];
            const targetNode = nodes[resolved.target];

            if (!sourceNode || !targetNode) {
                console.warn('LandscapeApp: link references missing node', resolved, nodes);
                return;
            }

            const sx = ((Number(sourceNode.position[0]) - minX) / rangeX) * 2 - 1;
            const sy = ((Number(sourceNode.position[1]) - minY) / rangeY) * 2 - 1;
            const sz = ((Number(sourceNode.functionValue) - minVal) / rangeVal) * 2 - 1;

            const tx = ((Number(targetNode.position[0]) - minX) / rangeX) * 2 - 1;
            const ty = ((Number(targetNode.position[1]) - minY) / rangeY) * 2 - 1;
            const tz = ((Number(targetNode.functionValue) - minVal) / rangeVal) * 2 - 1;

            linkPositions.push(sx, sz, sy);
            linkPositions.push(tx, tz, ty);

            const sVal = (Number(sourceNode.functionValue) - minVal) / rangeVal;
            const tVal = (Number(targetNode.functionValue) - minVal) / rangeVal;
            
            linkValues.push(sVal);
            linkValues.push(tVal);
        });

        // Upload to GPU
        this.buffers.nodes = this.createBuffer(new Float32Array(nodePositions));
        this.buffers.nodeValues = this.createBuffer(new Float32Array(nodeValues));
        this.buffers.links = this.createBuffer(new Float32Array(linkPositions));
        this.buffers.linkValues = this.createBuffer(new Float32Array(linkValues));

        this.data.nodeCount = nodes.length;
        this.data.linkCount = links.length * 2; // 2 vertices per line

        this.updateReferenceGeometry();
    }

    createBuffer(data) {
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
        return buffer;
    }

    updateReferenceGeometry() {
        const floorY = -1.0;
        const divisions = 10;
        const step = 2.0 / divisions;

        const gridPositions = [];
        const gridValues = [];
        for (let i = 0; i <= divisions; i++) {
            const offset = -1.0 + i * step;

            // Lines parallel to X axis (varying Z)
            gridPositions.push(-1.0, floorY, offset, 1.0, floorY, offset);
            gridValues.push(-4.0, -4.0);

            // Lines parallel to Z axis (varying X)
            gridPositions.push(offset, floorY, -1.0, offset, floorY, 1.0);
            gridValues.push(-4.0, -4.0);
        }

        if (gridPositions.length > 0) {
            this.buffers.grid = this.createBuffer(new Float32Array(gridPositions));
            this.buffers.gridValues = this.createBuffer(new Float32Array(gridValues));
            this.gridVertexCount = gridValues.length;
        }

        const origin = -1.0;
        const max = 1.0;

        const axisPositions = new Float32Array([
            origin, origin, origin,  max,    origin, origin, // X axis
            origin, origin, origin,  origin, max,    origin, // Y axis
            origin, origin, origin,  origin, origin, max     // Z axis
        ]);

        const axisValues = new Float32Array([
            -1.0, -1.0, // X axis
            -2.0, -2.0, // Y axis
            -3.0, -3.0  // Z axis
        ]);

        this.buffers.axes = this.createBuffer(axisPositions);
        this.buffers.axisValues = this.createBuffer(axisValues);
        this.axisVertexCount = axisValues.length;
    }

    setupInteraction() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;
            
            this.camera.rotationY += deltaX * 0.5;
            this.camera.rotationX += deltaY * 0.5;
            
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.distance += e.deltaY * 0.001;
            this.camera.distance = Math.max(0.1, Math.min(10.0, this.camera.distance));
        });
    }

    resize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;

        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    render() {
        if (!this.hasRenderedOnce) {
             console.log("LandscapeApp render loop running");
             this.hasRenderedOnce = true;
        }
        this.resize();

        this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        if (!this.program || !this.buffers.nodes) {
            requestAnimationFrame(this.render);
            return;
        }

        this.gl.useProgram(this.program);

        // Compute matrices
        const aspect = this.canvas.width / this.canvas.height;
        const projectionMatrix = Matrix4.perspective(45 * Math.PI / 180, aspect, 0.1, 100.0);
        
        let modelViewMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, -this.camera.distance, 1
        ]);

        // Apply rotations
        const rotX = Matrix4.rotationX(this.camera.rotationX);
        const rotY = Matrix4.rotationY(this.camera.rotationY);
        
        // Combine rotations: M = M * RotX * RotY
        let rotation = Matrix4.multiply(rotX, rotY);
        modelViewMatrix = Matrix4.multiply(modelViewMatrix, rotation);

        this.gl.uniformMatrix4fv(this.uniformLocations.projectionMatrix, false, projectionMatrix);
        this.gl.uniformMatrix4fv(this.uniformLocations.modelViewMatrix, false, modelViewMatrix);

        // Draw ground grid
        if (this.gridVertexCount > 0 && this.buffers.grid && this.buffers.gridValues) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.grid);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.gridValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            this.gl.drawArrays(this.gl.LINES, 0, this.gridVertexCount);
        }

        // Draw coordinate axes
        if (this.axisVertexCount > 0 && this.buffers.axes && this.buffers.axisValues) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.axes);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.axisValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            this.gl.drawArrays(this.gl.LINES, 0, this.axisVertexCount);
        }

        // Draw Links
        if (this.data.linkCount > 0) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.links);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.linkValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            this.gl.drawArrays(this.gl.LINES, 0, this.data.linkCount);
        }

        // Draw Nodes
        if (this.data.nodeCount > 0) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.nodes);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.nodeValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            this.gl.drawArrays(this.gl.POINTS, 0, this.data.nodeCount);
        }

        requestAnimationFrame(this.render);
    }
}
