class landscapeComponent extends baseComponent {
  constructor(uuid) {
    super(uuid);
    console.log('landscapeComponent initialized', uuid);

    this.pendingSpineData = null;
    this._handleSpineData = this._handleSpineData.bind(this);
    window.addEventListener('topologicalSpineData', this._handleSpineData);

    this._setupUI();
  }

  _setupUI() {
    const checkInterval = setInterval(() => {
      const canvas = document.querySelector(this.div + ' canvas');
      if (canvas) {
        console.log('Landscape canvas detected, initializing app');
        clearInterval(checkInterval);
        this._initLandscapeApp();
      }
    }, 100);
  }

  async _initLandscapeApp() {
    console.log('Initializing LandscapeApp...');
    const { LandscapeApp } = await import('../../static/landscape/main.js');

    const canvas = document.querySelector(this.div + ' canvas#landscapeCanvas');
    if (!canvas) {
      console.error('Landscape canvas not found');
      return;
    }

    this.landscapeApp = new LandscapeApp(canvas);
    console.log('LandscapeApp initialized');

    if (this.pendingSpineData) {
      console.log('Applying buffered spine data to landscape');
      this.landscapeApp.setData(this.pendingSpineData);
      this.pendingSpineData = null;
    }
  }

  _handleSpineData(event) {
    const spineData = event.detail;
    if (!spineData) {
      return;
    }

    console.log('LandscapeComponent received spine data via event');
    if (this.landscapeApp) {
      this.landscapeApp.setData(spineData);
    } else {
      this.pendingSpineData = spineData;
    }
  }

  parseSignalCallback(msg) {
    // Landscape component listens for spine data broadcast events instead
  }

  parseFunctionReturn(msg) {
    // No direct module calls handled here
  }

  resize() {
    if (this.landscapeApp && this.landscapeApp.resize) {
      this.landscapeApp.resize();
    }
  }
}
