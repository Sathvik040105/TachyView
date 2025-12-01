class volumeRenderingComponent extends baseComponent {
  constructor(uuid) {
    super(uuid);
    console.log("########## volumeRenderingComponent class ###########");
    this._setupUI();
  }

  _setupUI() {
    // Initialize after template and sidebar elements are loaded
    const checkInterval = setInterval(() => {
      const canvas = document.querySelector(this.div + ' canvas');
      const tfCanvas = document.getElementById('tf-canvas');
      const vtkFileInput = document.getElementById('vtk-file-input');
      // Wait for both component canvas and sidebar elements to be ready
      if (canvas && tfCanvas && vtkFileInput) {
        clearInterval(checkInterval);
        this._initVolumeRenderer();
      }
    }, 100);
  }

  async _initVolumeRenderer() {
    // Dynamically import the volume rendering app
    const { VolumeRenderingApp } = await import('../../static/volume_rendering/main.js');
    
    const canvas = document.querySelector(this.div + ' canvas#volRenderCanvas');
    if (!canvas) {
      console.error('Volume rendering canvas not found');
      return;
    }

    // Mark that we're in component mode to prevent auto-initialization
    window.NDDAV_COMPONENT_MODE = true;
    
    // Initialize the volume renderer with the canvas in this component
    this.volumeApp = new VolumeRenderingApp(canvas);
    console.log('Volume rendering initialized:', this.volumeApp);
    
    // Store reference globally for file upload handler
    window.volumeRendererComponent = this;
  }

  parseFunctionReturn(msg) {
    // Handle any server responses if needed
  }

  parseSignalCallback(msg) {
    // Handle any signal callbacks if needed
  }

  resize() {
    // Handle resize events
    if (this.volumeApp && this.volumeApp.resize) {
      this.volumeApp.resize();
    }
  }
}
