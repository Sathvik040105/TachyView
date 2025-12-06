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
            surface: null,
            surfaceNormals: null,
            surfaceValues: null,
            axes: null,
            axisValues: null,
            grid: null,
            gridValues: null
        };
        this.data = {
            nodeCount: 0,
            linkCount: 0,
            surfaceVertexCount: 0,
            contourTriCount: 0,
            contourLineCount: 0
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

        // Toggle to hide/show surface + contours; nodes/links always shown
        this.showSurface = true;

        this.axisVertexCount = 0;
        this.gridVertexCount = 0;

        this.initShaders();
        this.setupInteraction();
        this.updateReferenceGeometry();

        this.render = this.render.bind(this);
        requestAnimationFrame(this.render);
    }

    initShaders() {
        const vsSource = `
            attribute vec3 aPosition;
            attribute vec3 aNormal;
            attribute float aValue;
            attribute float aAlpha;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform vec3 uLightDir;
            
            varying float vValue;
            varying float vAlpha;
            varying float vLight;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                gl_PointSize = 5.0;
                vValue = aValue;
                vAlpha = aAlpha;
                vec3 n = normalize(aNormal);
                float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
                vLight = max(diffuse, 0.25);
            }
        `;

        const fsSource = `
            precision mediump float;
            
            varying float vValue;
            varying float vAlpha;
            varying float vLight;
            
            vec3 colormap(float t) {
                // Axes/grid special codes
                if (t < -2.5) return vec3(0.0, 0.0, 1.0);
                if (t < -1.5) return vec3(0.0, 1.0, 0.0);
                if (t < -0.5) return vec3(1.0, 0.0, 0.0);
                if (t < 0.0)  return vec3(0.75, 0.75, 0.75);

                // Perceptually uniform Viridis-like ramp
                // Stops: (#440154, #31688e, #35b779, #fde725)
                vec3 c0 = vec3(0.266, 0.000, 0.592);
                vec3 c1 = vec3(0.193, 0.407, 0.557);
                vec3 c2 = vec3(0.208, 0.718, 0.475);
                vec3 c3 = vec3(0.992, 0.910, 0.145);

                float s = clamp(t, 0.0, 1.0);
                if (s < 0.33) {
                    float u = s / 0.33;
                    return mix(c0, c1, u);
                } else if (s < 0.66) {
                    float u = (s - 0.33) / 0.33;
                    return mix(c1, c2, u);
                } else {
                    float u = (s - 0.66) / 0.34;
                    return mix(c2, c3, u);
                }
            }

            void main() {
                gl_FragColor = vec4(colormap(vValue) * vLight, vAlpha);
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
            vertexNormal: this.gl.getAttribLocation(this.program, 'aNormal'),
            vertexValue: this.gl.getAttribLocation(this.program, 'aValue'),
            vertexAlpha: this.gl.getAttribLocation(this.program, 'aAlpha'),
        };

        this.uniformLocations = {
            projectionMatrix: this.gl.getUniformLocation(this.program, 'uProjectionMatrix'),
            modelViewMatrix: this.gl.getUniformLocation(this.program, 'uModelViewMatrix'),
            lightDir: this.gl.getUniformLocation(this.program, 'uLightDir'),
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
        const contours = spineData.contourPath || {};
        const contourLevels = (spineData.contourValues || []).map(Number);

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minVal = Infinity, maxVal = -Infinity;

        const considerXY = (px, py) => {
            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        };

        nodes.forEach(node => {
            const px = Number(node.position[0]);
            const py = Number(node.position[1]);
            const fv = Number(node.functionValue);
            considerXY(px, py);
            minVal = Math.min(minVal, fv);
            maxVal = Math.max(maxVal, fv);
        });

        contourLevels.forEach(level => {
            const paths = contours[level] || [];
            paths.forEach(path => {
                path.forEach(p => considerXY(Number(p[0]), Number(p[1])));
            });
            minVal = Math.min(minVal, level);
            maxVal = Math.max(maxVal, level);
        });

        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;

        // Smooth height field from scattered extrema via inverse-distance weighting
        const gridN = 80;
        const gridM = 80;
        const heights = new Array(gridN * gridM);
        let gridMin = Infinity;
        let gridMax = -Infinity;
        const power = 2.0;
        const epsilon = 1e-6;

        for (let i = 0; i < gridN; i++) {
            const ux = i / (gridN - 1);
            const xWorld = minX + ux * rangeX;
            for (let j = 0; j < gridM; j++) {
                const uy = j / (gridM - 1);
                const yWorld = minY + uy * rangeY;
                let num = 0.0;
                let den = 0.0;
                nodes.forEach(node => {
                    const dx = xWorld - Number(node.position[0]);
                    const dy = yWorld - Number(node.position[1]);
                    const dist2 = dx * dx + dy * dy;
                    const w = 1.0 / Math.pow(dist2 + epsilon, power * 0.5);
                    num += w * Number(node.functionValue);
                    den += w;
                });
                const val = den > 0 ? num / den : minVal;
                heights[i * gridM + j] = val;
                gridMin = Math.min(gridMin, val);
                gridMax = Math.max(gridMax, val);
            }
        }

        // Normalize heights so the minimum sits on the XY plane (z=0)
        minVal = Math.min(minVal, gridMin);
        maxVal = Math.max(maxVal, gridMax);
        const rangeVal = maxVal - minVal || 1;
        const normVal = (v) => (v - minVal) / rangeVal;

        // Build surface mesh (triangle list) with normals for lighting
        const surfacePositions = [];
        const surfaceNormals = [];
        const surfaceValues = [];
        const stepX = 2.0 / (gridN - 1);
        const stepY = 2.0 / (gridM - 1);

        const heightAt = (i, j) => heights[i * gridM + j];
        const normalAt = (i, j) => {
            const im1 = Math.max(i - 1, 0);
            const ip1 = Math.min(i + 1, gridN - 1);
            const jm1 = Math.max(j - 1, 0);
            const jp1 = Math.min(j + 1, gridM - 1);
            const dhx = (heightAt(ip1, j) - heightAt(im1, j)) / (2 * stepX);
            const dhy = (heightAt(i, jp1) - heightAt(i, jm1)) / (2 * stepY);
            const nx = -dhx;
            const ny = 1.0;
            const nz = -dhy;
            const len = Math.hypot(nx, ny, nz) || 1.0;
            return [nx / len, ny / len, nz / len];
        };

        for (let i = 0; i < gridN - 1; i++) {
            for (let j = 0; j < gridM - 1; j++) {
                const verts = [
                    [i, j],
                    [i + 1, j],
                    [i, j + 1],
                    [i + 1, j + 1]
                ];

                const pushVertex = (ii, jj) => {
                    const ux = ii / (gridN - 1);
                    const uy = jj / (gridM - 1);
                    const x = ux * 2 - 1;
                    const y = uy * 2 - 1;
                    const hRaw = heightAt(ii, jj);
                    const hNorm = normVal(hRaw);
                    const z = hNorm; // 0..1 height (min -> 0, max -> 1)
                    surfacePositions.push(x, z, y);
                    surfaceValues.push(hNorm);
                    const n = normalAt(ii, jj);
                    surfaceNormals.push(n[0], n[1], n[2]);
                };

                // Triangle 1: (i,j) (i+1,j) (i,j+1)
                pushVertex(verts[0][0], verts[0][1]);
                pushVertex(verts[1][0], verts[1][1]);
                pushVertex(verts[2][0], verts[2][1]);

                // Triangle 2: (i+1,j) (i+1,j+1) (i,j+1)
                pushVertex(verts[1][0], verts[1][1]);
                pushVertex(verts[3][0], verts[3][1]);
                pushVertex(verts[2][0], verts[2][1]);
            }
        }

        // Nodes
        const nodePositions = [];
        const nodeValues = [];
        nodes.forEach(node => {
            const px = Number(node.position[0]);
            const py = Number(node.position[1]);
            const fv = Number(node.functionValue);
            const x = ((px - minX) / rangeX) * 2 - 1;
            const y = ((py - minY) / rangeY) * 2 - 1;
            const zNorm = normVal(fv);
            const z = zNorm;
            nodePositions.push(x, z, y);
            nodeValues.push(zNorm);
        });

        // Links
        const linkPositions = [];
        const linkValues = [];
        const resolveLinkIndices = (link) => {
            if (link == null) return null;
            if (typeof link === 'string') {
                const parts = link.split('-');
                if (parts.length !== 2) return null;
                const a = Number(parts[0]); const b = Number(parts[1]);
                return (Number.isNaN(a) || Number.isNaN(b)) ? null : { source: a, target: b };
            }
            if (typeof link === 'object') {
                if (link.source !== undefined && link.target !== undefined) {
                    return { source: Number(link.source), target: Number(link.target) };
                }
                if (Array.isArray(link) && link.length === 2) {
                    const a = Number(link[0]); const b = Number(link[1]);
                    return (Number.isNaN(a) || Number.isNaN(b)) ? null : { source: a, target: b };
                }
            }
            return null;
        };

        links.forEach(link => {
            const resolved = resolveLinkIndices(link);
            if (!resolved) return;
            const s = nodes[resolved.source];
            const t = nodes[resolved.target];
            if (!s || !t) return;

            const sx = ((Number(s.position[0]) - minX) / rangeX) * 2 - 1;
            const sy = ((Number(s.position[1]) - minY) / rangeY) * 2 - 1;
            const sz = normVal(Number(s.functionValue));

            const tx = ((Number(t.position[0]) - minX) / rangeX) * 2 - 1;
            const ty = ((Number(t.position[1]) - minY) / rangeY) * 2 - 1;
            const tz = normVal(Number(t.functionValue));

            linkPositions.push(sx, sz, sy, tx, tz, ty);
            const sVal = normVal(Number(s.functionValue));
            const tVal = normVal(Number(t.functionValue));
            linkValues.push(sVal, tVal);
        });

        // Contour fills (triangle fans)
        const contourTriPositions = [];
        const contourTriValues = [];
        const contourTriAlpha = [];
        const eps = 0.001;

        contourLevels.sort((a,b)=>a-b).forEach(level => {
            const paths = contours[level] || [];
            const zNorm = normVal(level);
            const z = zNorm + eps;
            paths.forEach(path => {
                if (!path || path.length < 3) return;
                const cx = (Number(path[0][0]) - minX) / rangeX * 2 - 1;
                const cy = (Number(path[0][1]) - minY) / rangeY * 2 - 1;
                for (let i = 1; i < path.length - 1; i++) {
                    const p1x = (Number(path[i][0]) - minX) / rangeX * 2 - 1;
                    const p1y = (Number(path[i][1]) - minY) / rangeY * 2 - 1;
                    const p2x = (Number(path[i+1][0]) - minX) / rangeX * 2 - 1;
                    const p2y = (Number(path[i+1][1]) - minY) / rangeY * 2 - 1;
                    contourTriPositions.push(cx, z, cy, p1x, z, p1y, p2x, z, p2y);
                    contourTriValues.push(zNorm, zNorm, zNorm);
                    contourTriAlpha.push(0.35, 0.35, 0.35);
                }
            });
        });

        // Contour outlines (lines)
        const contourLinePositions = [];
        const contourLineValues = [];
        const contourLineAlpha = [];
        contourLevels.forEach(level => {
            const paths = contours[level] || [];
            const zNorm = normVal(level);
            const z = zNorm + eps;
            paths.forEach(path => {
                if (!path || path.length < 2) return;
                for (let i = 0; i < path.length; i++) {
                    const a = path[i];
                    const b = path[(i + 1) % path.length];
                    const ax = (Number(a[0]) - minX) / rangeX * 2 - 1;
                    const ay = (Number(a[1]) - minY) / rangeY * 2 - 1;
                    const bx = (Number(b[0]) - minX) / rangeX * 2 - 1;
                    const by = (Number(b[1]) - minY) / rangeY * 2 - 1;
                    contourLinePositions.push(ax, z, ay, bx, z, by);
                    contourLineValues.push(zNorm, zNorm);
                    contourLineAlpha.push(0.9, 0.9);
                }
            });
        });

        // Upload to GPU
        this.buffers.nodes = this.createBuffer(new Float32Array(nodePositions));
        this.buffers.nodeValues = this.createBuffer(new Float32Array(nodeValues));
        this.buffers.links = this.createBuffer(new Float32Array(linkPositions));
        this.buffers.linkValues = this.createBuffer(new Float32Array(linkValues));

        this.buffers.surface = surfacePositions.length ? this.createBuffer(new Float32Array(surfacePositions)) : null;
        this.buffers.surfaceNormals = surfaceNormals.length ? this.createBuffer(new Float32Array(surfaceNormals)) : null;
        this.buffers.surfaceValues = surfaceValues.length ? this.createBuffer(new Float32Array(surfaceValues)) : null;

        this.buffers.contourTris = contourTriPositions.length ? this.createBuffer(new Float32Array(contourTriPositions)) : null;
        this.buffers.contourTriValues = contourTriValues.length ? this.createBuffer(new Float32Array(contourTriValues)) : null;
        this.buffers.contourTriAlpha = contourTriAlpha.length ? this.createBuffer(new Float32Array(contourTriAlpha)) : null;
        this.buffers.contourLines = contourLinePositions.length ? this.createBuffer(new Float32Array(contourLinePositions)) : null;
        this.buffers.contourLineValues = contourLineValues.length ? this.createBuffer(new Float32Array(contourLineValues)) : null;
        this.buffers.contourLineAlpha = contourLineAlpha.length ? this.createBuffer(new Float32Array(contourLineAlpha)) : null;

        this.data.nodeCount = nodes.length;
        this.data.linkCount = links.length * 2;
        this.data.contourTriCount = contourTriValues.length;
        this.data.contourLineCount = contourLineValues.length;
        this.data.surfaceVertexCount = surfaceValues.length;

        this.updateReferenceGeometry();
    }

    setShowSurface(flag) {
        // Toggle surface + contour rendering; nodes/links remain visible
        this.showSurface = !!flag;
        // Kick the render loop once in case it was paused (should normally already be running)
        if (this.render) {
            requestAnimationFrame(this.render);
        }
    }

    createBuffer(data) {
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
        return buffer;
    }

    updateReferenceGeometry() {
        const floorY = 0.0;
        const divisions = 10;
        const step = 2.0 / divisions;

        const gridPositions = [];
        const gridValues = [];
        for (let i = 0; i <= divisions; i++) {
            const offset = -1.0 + i * step;

            // Lines parallel to X axis (varying Z)
            gridPositions.push(-1.0, floorY, offset, 1.0, floorY, offset);
            gridValues.push(-0.1, -0.1);

            // Lines parallel to Z axis (varying X)
            gridPositions.push(offset, floorY, -1.0, offset, floorY, 1.0);
            gridValues.push(-0.1, -0.1);
        }

        if (gridPositions.length > 0) {
            this.buffers.grid = this.createBuffer(new Float32Array(gridPositions));
            this.buffers.gridValues = this.createBuffer(new Float32Array(gridValues));
            this.gridVertexCount = gridValues.length;
        }

        const originX = -1.0;
        const originZ = -1.0;
        const originY = 0.0;
        const maxX = 1.0;
        const maxZ = 1.0;
        const maxY = 1.0;

        const axisPositions = new Float32Array([
            originX, originY, originZ,  maxX,   originY, originZ,  // X axis
            originX, originY, originZ,  originX, maxY,  originZ,  // Y axis (height)
            originX, originY, originZ,  originX, originY, maxZ    // Z axis
        ]);

        const axisValues = new Float32Array([
            -0.6, -0.6, // X axis
            -1.6, -1.6, // Y axis
            -2.6, -2.6  // Z axis
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
            this.camera.distance = Math.max(0.5, Math.min(10.0, this.camera.distance));
        });

        // Toggle surface visibility with the 's' key
        window.addEventListener('keydown', (e) => {
            if (e.key === 's' || e.key === 'S') {
                this.showSurface = !this.showSurface;
            }
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
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        if (!this.program || !this.buffers.nodes) {
            requestAnimationFrame(this.render);
            return;
        }

        this.gl.useProgram(this.program);

        const aspect = this.canvas.width / this.canvas.height;
        const projectionMatrix = Matrix4.perspective(45 * Math.PI / 180, aspect, 0.1, 100.0);

        let modelViewMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, -this.camera.distance, 1
        ]);

        const rotX = Matrix4.rotationX(this.camera.rotationX);
        const rotY = Matrix4.rotationY(this.camera.rotationY);
        let rotation = Matrix4.multiply(rotX, rotY);
        modelViewMatrix = Matrix4.multiply(modelViewMatrix, rotation);

        this.gl.uniformMatrix4fv(this.uniformLocations.projectionMatrix, false, projectionMatrix);
        this.gl.uniformMatrix4fv(this.uniformLocations.modelViewMatrix, false, modelViewMatrix);
        this.gl.uniform3fv(this.uniformLocations.lightDir, new Float32Array([0.3, 0.8, 0.5]));

        const disableNormal = () => this.gl.disableVertexAttribArray(this.attribLocations.vertexNormal);
        const setAlphaConst = (a) => {
            this.gl.disableVertexAttribArray(this.attribLocations.vertexAlpha);
            this.gl.vertexAttrib1f(this.attribLocations.vertexAlpha, a);
        };
        const bindAlphaBuffer = (buf) => {
            if (buf) {
                this.gl.enableVertexAttribArray(this.attribLocations.vertexAlpha);
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);
                this.gl.vertexAttribPointer(this.attribLocations.vertexAlpha, 1, this.gl.FLOAT, false, 0, 0);
            }
        };

        // Grid
        if (this.gridVertexCount > 0 && this.buffers.grid && this.buffers.gridValues) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.grid);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            disableNormal();

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.gridValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            setAlphaConst(1.0);
            this.gl.drawArrays(this.gl.LINES, 0, this.gridVertexCount);
        }

        // Axes
        if (this.axisVertexCount > 0 && this.buffers.axes && this.buffers.axisValues) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.axes);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            disableNormal();

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.axisValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            setAlphaConst(1.0);
            this.gl.drawArrays(this.gl.LINES, 0, this.axisVertexCount);
        }

        // Surface (smooth landscape)
        if (this.showSurface && this.data.surfaceVertexCount > 0 && this.buffers.surface && this.buffers.surfaceValues && this.buffers.surfaceNormals) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.surface);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.surfaceNormals);
            this.gl.vertexAttribPointer(this.attribLocations.vertexNormal, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexNormal);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.surfaceValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            setAlphaConst(1.0);
            this.gl.drawArrays(this.gl.TRIANGLES, 0, this.data.surfaceVertexCount);
        }

        // Contour fills
        if (this.showSurface && this.data.contourTriCount > 0 && this.buffers.contourTris && this.buffers.contourTriValues && this.buffers.contourTriAlpha) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.contourTris);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            this.gl.disableVertexAttribArray(this.attribLocations.vertexNormal);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.contourTriValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            bindAlphaBuffer(this.buffers.contourTriAlpha);
            this.gl.drawArrays(this.gl.TRIANGLES, 0, this.data.contourTriCount);
        }

        // Contour outlines
        if (this.showSurface && this.data.contourLineCount > 0 && this.buffers.contourLines && this.buffers.contourLineValues && this.buffers.contourLineAlpha) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.contourLines);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            this.gl.disableVertexAttribArray(this.attribLocations.vertexNormal);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.contourLineValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            bindAlphaBuffer(this.buffers.contourLineAlpha);
            this.gl.drawArrays(this.gl.LINES, 0, this.data.contourLineCount);
        }

        // Links
        if (this.data.linkCount > 0) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.links);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            disableNormal();

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.linkValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            setAlphaConst(1.0);
            this.gl.drawArrays(this.gl.LINES, 0, this.data.linkCount);
        }

        // Nodes
        if (this.data.nodeCount > 0) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.nodes);
            this.gl.vertexAttribPointer(this.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexPosition);

            disableNormal();

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.nodeValues);
            this.gl.vertexAttribPointer(this.attribLocations.vertexValue, 1, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.attribLocations.vertexValue);

            setAlphaConst(1.0);
            this.gl.drawArrays(this.gl.POINTS, 0, this.data.nodeCount);
        }

        requestAnimationFrame(this.render);
    }
}