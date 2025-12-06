class landscapeComponent extends baseComponent {
  constructor(uuid) {
    super(uuid);
    console.log('landscapeComponent initialized', uuid);

    this.pendingSpineData = null;
    this.pendingSelectionHighlight = null;
    this._handleSpineData = this._handleSpineData.bind(this);
    this._handleNodeSelection = this._handleNodeSelection.bind(this);
    window.addEventListener('topologicalSpineData', this._handleSpineData);
    window.addEventListener('topoNodeSelected', this._handleNodeSelection);

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

    // Wire up surface toggle button
    const toggleBtn = document.querySelector(this.div + ' #toggle-surface');
    const clearBtn = document.querySelector(this.div + ' #landscape-clear-selection');
    let surfaceOn = true;
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        surfaceOn = !surfaceOn;
        toggleBtn.textContent = `Surface: ${surfaceOn ? 'On' : 'Off'}`;
        if (this.landscapeApp && this.landscapeApp.setShowSurface) {
          this.landscapeApp.setShowSurface(surfaceOn);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (this.landscapeApp && this.landscapeApp.applySelectionHighlight) {
          this.landscapeApp.applySelectionHighlight(null, []);
        } else {
          this.pendingSelectionHighlight = { nodeIndex: null, neighbors: [] };
        }
      });
    }

    this.landscapeApp = new LandscapeApp(canvas);
    console.log('LandscapeApp initialized');

    if (this.pendingSpineData) {
      console.log('Applying buffered spine data to landscape');
      this.landscapeApp.setData(this.pendingSpineData);
      this.pendingSpineData = null;
    }

    if (this.pendingSelectionHighlight) {
      const { nodeIndex, neighbors } = this.pendingSelectionHighlight;
      this.landscapeApp.applySelectionHighlight(nodeIndex, neighbors);
      this.pendingSelectionHighlight = null;
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

  _handleNodeSelection(event) {
    const payload = event.detail;
    if (!payload || !payload.node) return;
    const nodeIndex = payload.node.index;
    const neighbors = (payload.neighbors || []).map(n => n.index);

    if (this.landscapeApp && this.landscapeApp.applySelectionHighlight) {
      this.landscapeApp.applySelectionHighlight(nodeIndex, neighbors);
    } else {
      this.pendingSelectionHighlight = { nodeIndex, neighbors };
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
