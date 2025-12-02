import { VolumeLoader } from './volumeLoader.js';
import { FPSCounter } from './utils.js';
import { Texture2DVolumeRenderer } from './techniques/2D_texture_vr.js';
import { Texture3DVolumeRenderer } from './techniques/3D_texture_vr.js';
import { RayMarchingRenderer } from './techniques/ray_marching.js';
import { BoundingBox } from './boundingBox.js';
import { TransferFunctionEditor } from './transferFunction.js';

export class VolumeRenderingApp {
    constructor(canvas = null) {
        this.canvas = canvas || document.getElementById('volRenderCanvas');
        this.gl = this.canvas.getContext('webgl2');

        if (!this.gl) {
            alert('WebGL2 not supported. Please use a modern browser.');
            return;
        }

        this.volume = null;
        this.renderer = null;
        this.boundingBox = null;
        this.currentTechnique = '2d';
        this.fpsCounter = new FPSCounter();
        this.isAnimating = false;
        this.transferFunction = new TransferFunctionEditor(this.gl, {
            canvasId: 'tf-canvas',
            colorInputId: 'tf-color',
            opacityInputId: 'tf-opacity',
            addButtonId: 'tf-add',
            removeButtonId: 'tf-remove'
        });

        // Interaction state
        this.isRotating = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this.setupUI();
        this.setupInteraction();
        this.showControls(this.currentTechnique);

        const loadingLabel = document.getElementById('loading');
        if (loadingLabel) {
            loadingLabel.style.display = 'block';
            loadingLabel.textContent = 'Load a VTK file to begin.';
        }

        this.transferFunction.onChange(() => {
            if (this.renderer && this.renderer.updateTransferFunction) {
                this.renderer.updateTransferFunction(
                    this.transferFunction.getColorTexture(),
                    this.transferFunction.getOpacityTexture()
                );
            }
        });
    }

    setupUI() {
        document.querySelectorAll('.technique-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.technique-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const technique = e.target.dataset.technique;
                this.switchTechnique(technique);
                this.showControls(technique);
            });
        });

        // File input is now handled by filterComponent, not directly here
        // The filterComponent will call loadVolumeFromFile directly

        const opacity3dSlider = document.getElementById('opacity-3d');
        opacity3dSlider.addEventListener('input', (e) => {
            document.getElementById('opacity-3d-value').textContent = e.target.value;
            if (this.renderer && this.currentTechnique === '3d') {
                this.renderer.opacityMultiplier = parseFloat(e.target.value);
            }
        });

        const slices3dSlider = document.getElementById('slices-3d');
        slices3dSlider.addEventListener('input', (e) => {
            document.getElementById('slices-3d-value').textContent = e.target.value;
            if (this.renderer && this.currentTechnique === '3d') {
                this.renderer.setNumSlices(parseInt(e.target.value));
            }
        });

        const stepsizeRaySlider = document.getElementById('stepsize-ray');
        stepsizeRaySlider.addEventListener('input', (e) => {
            document.getElementById('stepsize-ray-value').textContent = e.target.value;
            if (this.renderer && this.currentTechnique === 'ray') {
                this.renderer.stepSize = parseFloat(e.target.value);
            }
        });

        const brightnessSlider = document.getElementById('brightness');
        brightnessSlider.addEventListener('input', (e) => {
            document.getElementById('brightness-value').textContent = e.target.value;
            if (this.renderer) {
                this.renderer.brightness = parseFloat(e.target.value);
            }
        });

        document.getElementById('reset-view').addEventListener('click', () => this.resetView());
    }

    setupInteraction() {
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.isRotating = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        window.addEventListener('mouseup', () => {
            this.isRotating = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isRotating && this.renderer) {
                const deltaX = e.clientX - this.lastMouseX;
                const deltaY = e.clientY - this.lastMouseY;

                this.renderer.rotationY += deltaX * 0.5;
                this.renderer.rotationX += deltaY * 0.5;

                if (this.boundingBox) {
                    this.boundingBox.rotationY = this.renderer.rotationY;
                    this.boundingBox.rotationX = this.renderer.rotationX;
                }

                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this.renderer) {
                this.renderer.zoom += e.deltaY * 0.01;
                this.renderer.zoom = Math.max(0.5, Math.min(10, this.renderer.zoom));

                if (this.boundingBox) {
                    this.boundingBox.zoom = this.renderer.zoom;
                }
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'r' || e.key === 'R') {
                this.resetView();
            }
        });
    }

    async loadVolumeFromFile(file) {
        try {
            document.getElementById('loading').style.display = 'block';
            this.volume = await VolumeLoader.loadVTK(file);
            this.updateVolumeInfo();
            this.initRenderer();
            document.getElementById('loading').style.display = 'none';
            if (!this.isAnimating) {
                this.isAnimating = true;
                this.animate();
            }
        } catch (error) {
            console.error('Failed to load volume:', error);
            alert('Failed to load volume file');
            document.getElementById('loading').style.display = 'none';
        }
    }

    updateVolumeInfo() {
        if (!this.volume) return;

        document.getElementById('dimensions').textContent =
            `${this.volume.width} × ${this.volume.height} × ${this.volume.depth}`;

        document.getElementById('spacing').textContent =
            `${this.volume.spacingX.toFixed(2)}, ${this.volume.spacingY.toFixed(2)}, ${this.volume.spacingZ.toFixed(2)}`;

        document.getElementById('range').textContent =
            `${this.volume.minValue} - ${this.volume.maxValue}`;
    }

    initRenderer() {
        if (this.renderer) {
            this.renderer.cleanup();
            this.renderer = null;
        }

        if (this.boundingBox) {
            this.boundingBox.cleanup();
            this.boundingBox = null;
        }

        this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
        this.gl.enable(this.gl.DEPTH_TEST);

        this.switchTechnique(this.currentTechnique);
        this.boundingBox = new BoundingBox(this.gl);

        document.getElementById('loading').style.display = 'none';
    }

    showControls(technique) {
        document.querySelectorAll('.technique-controls').forEach(ctrl => {
            ctrl.style.display = 'none';
        });

        const controlsElement = document.getElementById(`controls-${technique}`);
        if (controlsElement) controlsElement.style.display = 'block';
    }

    switchTechnique(technique) {
        this.currentTechnique = technique;

        if (!this.volume) return;

        const oldSettings = this.renderer ? {
            rotationX: this.renderer.rotationX,
            rotationY: this.renderer.rotationY,
            zoom: this.renderer.zoom,
            brightness: this.renderer.brightness
        } : null;

        if (this.renderer) {
            this.renderer.cleanup();
            this.renderer = null;
        }

        switch (technique) {
            case '2d':
                this.renderer = new Texture2DVolumeRenderer(this.gl, this.volume);
                break;
            case '3d':
                this.renderer = new Texture3DVolumeRenderer(this.gl, this.volume);
                this.renderer.opacityMultiplier = parseFloat(document.getElementById('opacity-3d').value);
                this.renderer.setNumSlices(parseInt(document.getElementById('slices-3d').value));
                break;
            case 'ray':
                this.renderer = new RayMarchingRenderer(this.gl, this.volume);
                this.renderer.stepSize = parseFloat(document.getElementById('stepsize-ray').value);
                break;
        }

        if (this.renderer && this.renderer.updateTransferFunction) {
            this.renderer.updateTransferFunction(
                this.transferFunction.getColorTexture(),
                this.transferFunction.getOpacityTexture()
            );
        }

        if (oldSettings && this.renderer) {
            Object.assign(this.renderer, oldSettings);
        }

        if (this.boundingBox) {
            this.boundingBox.rotationX = this.renderer ? this.renderer.rotationX : 0;
            this.boundingBox.rotationY = this.renderer ? this.renderer.rotationY : 0;
            this.boundingBox.zoom = this.renderer ? this.renderer.zoom : 2.5;
        }
    }

    resetView() {
        if (this.renderer) {
            this.renderer.rotationX = 0;
            this.renderer.rotationY = 0;
            this.renderer.zoom = 2.5;

            if (this.boundingBox) {
                this.boundingBox.rotationX = 0;
                this.boundingBox.rotationY = 0;
                this.boundingBox.zoom = 2.5;
            }
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        this.gl.viewport(0, 0, width, height);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        if (!this.renderer || !this.volume) return;

        this.renderer.render(width, height);

        if (this.boundingBox) {
            this.boundingBox.render(width, height);
        }

        const fps = this.fpsCounter.update();
        document.getElementById('fps').textContent = `FPS: ${fps}`;
    }
}

// Auto-initialize only if not in a component context
if (typeof window !== 'undefined' && !window.NDDAV_COMPONENT_MODE) {
    window.addEventListener('DOMContentLoaded', () => {
        new VolumeRenderingApp();
    });
}