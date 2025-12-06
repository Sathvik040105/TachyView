const COLOR_SAMPLES = 256;

function hexToRgb(hex) {
    const value = hex.replace('#', '');
    const bigint = parseInt(value, 16);
    return [
        ((bigint >> 16) & 255) / 255,
        ((bigint >> 8) & 255) / 255,
        (bigint & 255) / 255
    ];
}

function rgbToHex([r, g, b]) {
    const to255 = v => Math.round(Math.min(Math.max(v, 0), 1) * 255);
    return `#${[r, g, b].map(v => to255(v).toString(16).padStart(2, '0')).join('')}`;
}

export class TransferFunctionEditor {
    constructor(gl, opts) {
        this.gl = gl;
        this.canvas = document.getElementById(opts.canvasId);
        this.colorInput = document.getElementById(opts.colorInputId);
        this.opacityInput = document.getElementById(opts.opacityInputId);
        this.addButton = document.getElementById(opts.addButtonId);
        this.removeButton = document.getElementById(opts.removeButtonId);
        this.curveHeight = this.canvas.height - 34;
        this.points = [
            { iso: 0.0, color: [1, 1, 1], opacity: 0.0 },
            { iso: 1.0, color: [0, 0, 0], opacity: 1.0 }
        ];
        this.selectedIndex = 1;
        this.dragging = false;
        this.listeners = new Set();

        this.ctx = this.canvas.getContext('2d');
        this.highlightWindow = null;
        this.initTextures();
        this.attachEvents();
        this.sortPoints();
        this.syncUI();
        this.updateTextures();
    }

    initTextures() {
        const gl = this.gl;
        
        this.colorTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, COLOR_SAMPLES, 1, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null);

        this.opacityTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.opacityTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, COLOR_SAMPLES, 1, 0,
            gl.RED, gl.UNSIGNED_BYTE, null);
    }

    attachEvents() {
        this.canvas.addEventListener('mousedown', e => this.handlePointerDown(e));
        window.addEventListener('mousemove', e => this.handlePointerMove(e));
        window.addEventListener('mouseup', () => this.handlePointerUp());
        this.canvas.addEventListener('mouseleave', () => this.handlePointerUp());

        this.colorInput.addEventListener('input', () => {
            const point = this.points[this.selectedIndex];
            point.color = hexToRgb(this.colorInput.value);
            this.updateTextures();
        });

        this.opacityInput.addEventListener('input', () => {
            const point = this.points[this.selectedIndex];
            point.opacity = parseFloat(this.opacityInput.value);
            this.updateTextures();
        });

        this.addButton.addEventListener('click', () => this.addPoint());
        this.removeButton.addEventListener('click', () => this.removePoint());
    }

    handlePointerDown(event) {
        const { iso, opacity, x, y } = this.pointerToIsoOpacity(event);
        let closest = -1;
        let minDist = Infinity;
        for (let i = 0; i < this.points.length; i++) {
            const pt = this.points[i];
            const px = pt.iso * this.canvas.width;
            const py = (1 - pt.opacity) * this.curveHeight;
            const dx = px - x;
            const dy = py - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist && dist < 10) {
                minDist = dist;
                closest = i;
            }
        }
        if (closest !== -1) {
            this.selectedIndex = closest;
            this.dragging = true;
            this.syncUI();
            this.draw();
        }
    }

    handlePointerMove(event) {
        if (!this.dragging) return;
        const point = this.points[this.selectedIndex];
        if (!point) return;

        const result = this.pointerToIsoOpacity(event);
        point.iso = this.clamp(result.iso, 0, 1);
        point.opacity = this.clamp(result.opacity, 0, 1);

        if (this.selectedIndex === 0) {
            point.iso = 0;
            point.opacity = 0;
        }
        if (this.selectedIndex === this.points.length - 1) {
            point.iso = 1;
            point.opacity = 1;
        }

        const ref = point;
        this.sortPoints();
        this.selectedIndex = this.points.indexOf(ref);
        this.syncUI();
        this.updateTextures();
    }

    handlePointerUp() {
        this.dragging = false;
    }

    pointerToIsoOpacity(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        const iso = this.clamp(x / this.canvas.width, 0, 1);
        const opacity = this.clamp(1 - (y / this.curveHeight), 0, 1);
        return { iso, opacity, x, y };
    }

    addPoint() {
        const newPoint = {
            iso: 0.5,
            color: [1, 0.3, 0.3],
            opacity: 0.5
        };
        this.points.push(newPoint);
        this.sortPoints();
        this.selectedIndex = this.points.indexOf(newPoint);
        this.syncUI();
        this.updateTextures();
    }

    removePoint() {
        if (this.selectedIndex <= 0 || this.selectedIndex >= this.points.length - 1) return;
        this.points.splice(this.selectedIndex, 1);
        this.selectedIndex = Math.min(this.selectedIndex, this.points.length - 1);
        this.syncUI();
        this.updateTextures();
    }

    sortPoints() {
        this.points.sort((a, b) => a.iso - b.iso);
    }

    clamp(v, min, max) {
        return Math.min(Math.max(v, min), max);
    }

    sampleColor(t) {
        if (t <= this.points[0].iso) return this.points[0].color.slice();
        if (t >= this.points[this.points.length - 1].iso) return this.points[this.points.length - 1].color.slice();

        let i = 0;
        while (i < this.points.length - 1 && this.points[i + 1].iso < t) i++;
        const p0 = this.points[i];
        const p1 = this.points[i + 1];
        const range = p1.iso - p0.iso || 1e-5;
        const local = (t - p0.iso) / range;
        return [
            p0.color[0] + (p1.color[0] - p0.color[0]) * local,
            p0.color[1] + (p1.color[1] - p0.color[1]) * local,
            p0.color[2] + (p1.color[2] - p0.color[2]) * local
        ];
    }

    sampleOpacity(t) {
        if (t <= this.points[0].iso) return this.points[0].opacity;
        if (t >= this.points[this.points.length - 1].iso) return this.points[this.points.length - 1].opacity;

        let i = 0;
        while (i < this.points.length - 1 && this.points[i + 1].iso < t) i++;
        const p0 = this.points[i];
        const p1 = this.points[i + 1];
        const range = p1.iso - p0.iso || 1e-5;
        const local = (t - p0.iso) / range;
        return p0.opacity + (p1.opacity - p0.opacity) * local;
    }

    updateTextures() {
        const gl = this.gl;
        
        const colorData = new Uint8Array(COLOR_SAMPLES * 4);
        const opacityData = new Uint8Array(COLOR_SAMPLES);
        const hw = this.highlightWindow;
        const highlightColor = hw && hw.color ? hw.color : [1, 0.4, 0.1];
        const highlightWidth = hw ? hw.width : 0;

        for (let i = 0; i < COLOR_SAMPLES; i++) {
            const iso = i / (COLOR_SAMPLES - 1);
            let color = this.sampleColor(iso);
            let opacity = this.sampleOpacity(iso);

            if (hw) {
                const dist = Math.abs(iso - hw.iso);
                if (dist <= highlightWidth) {
                    const t = 1 - dist / Math.max(highlightWidth, 1e-6);
                    const blend = 0.65 * t;
                    color = [
                        color[0] * (1 - blend) + highlightColor[0] * blend,
                        color[1] * (1 - blend) + highlightColor[1] * blend,
                        color[2] * (1 - blend) + highlightColor[2] * blend,
                    ];
                    opacity = this.clamp(opacity + 0.35 * t, 0, 1);
                }
            }

            colorData[i * 4 + 0] = Math.round(this.clamp(color[0], 0, 1) * 255);
            colorData[i * 4 + 1] = Math.round(this.clamp(color[1], 0, 1) * 255);
            colorData[i * 4 + 2] = Math.round(this.clamp(color[2], 0, 1) * 255);
            colorData[i * 4 + 3] = 255;
            opacityData[i] = Math.round(this.clamp(opacity, 0, 1) * 255);
        }

        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLOR_SAMPLES, 1,
            gl.RGBA, gl.UNSIGNED_BYTE, colorData);

        gl.bindTexture(gl.TEXTURE_2D, this.opacityTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLOR_SAMPLES, 1,
            gl.RED, gl.UNSIGNED_BYTE, opacityData);

        this.draw();
        this.notify();
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#101010';
        ctx.fillRect(0, 0, w, this.curveHeight);
        ctx.fillStyle = '#181818';
        ctx.fillRect(0, this.curveHeight, w, h - this.curveHeight);

        // Draw color bar
        for (let x = 0; x < w; x++) {
            const iso = x / (w - 1);
            const [r, g, b] = this.sampleColor(iso);
            ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
            ctx.fillRect(x, this.curveHeight, 1, h - this.curveHeight);
        }

        // Draw opacity grid
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
            const y = (i / 5) * this.curveHeight;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Draw opacity curve
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#9ad8ff';
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            const iso = x / (w - 1);
            const opacity = this.sampleOpacity(iso);
            const y = (1 - opacity) * this.curveHeight;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw points
        for (let i = 0; i < this.points.length; i++) {
            const pt = this.points[i];
            const x = pt.iso * w;
            const y = (1 - pt.opacity) * this.curveHeight;
            const selected = i === this.selectedIndex;
            ctx.fillStyle = selected ? '#ffffff' : '#f05a28';
            ctx.beginPath();
            ctx.arc(x, y, selected ? 6 : 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.stroke();
        }
    }

    syncUI() {
        const point = this.points[this.selectedIndex];
        this.colorInput.value = rgbToHex(point.color);
        this.opacityInput.value = point.opacity.toFixed(2);
        this.removeButton.disabled = (this.selectedIndex === 0 || this.selectedIndex === this.points.length - 1);
    }

    notify() {
        for (const cb of this.listeners) cb();
    }

    setHighlightWindow(iso, width = 0.05, color = [1, 0.4, 0.1]) {
        this.highlightWindow = {
            iso: this.clamp(iso, 0, 1),
            width: Math.max(width, 0.001),
            color
        };
        this.updateTextures();
    }

    clearHighlightWindow() {
        this.highlightWindow = null;
        this.updateTextures();
    }

    onChange(callback) {
        this.listeners.add(callback);
    }

    offChange(callback) {
        this.listeners.delete(callback);
    }

    getColorTexture() {
        return this.colorTexture;
    }

    getOpacityTexture() {
        return this.opacityTexture;
    }

    dispose() {
        const gl = this.gl;
        gl.deleteTexture(this.colorTexture);
        gl.deleteTexture(this.opacityTexture);
    }
}