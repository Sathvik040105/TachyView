# TachyView

TachyView is a web-based visualization tool that combines topological spines and volume rendering to enable intuitive, interactive exploration of scalar fields directly in a browser.

## Installation

This project relies on a Python backend for topology computation (`hdtopology`) and a JavaScript frontend for visualization. A setup script is provided to handle the compilation of C++ libraries and Python dependencies.

### Prerequisites
*   Linux (Ubuntu/Debian recommended)
*   Python 3.8+
*   Git
*   `sudo` privileges (for installing build tools like CMake and SWIG)

### Setup
Run the automated setup script to create the virtual environment and compile necessary libraries:

```bash
chmod +x setup.sh
./setup.sh
```

This script will:
1.  Create a local virtual environment (`venv`).
2.  Install Python dependencies (ensuring `numpy<2.0` for binary compatibility).
3.  Download and patch the `ANN` library.
4.  Compile hdtopology with Python bindings.
5.  Link NDDAV core modules.

## Development Environment

To work on the project or run the backend, you must activate the environment using the provided script. This sets up `PYTHONPATH` and library paths correctly.

```bash
source activate_tachyview.sh
```

*Optional: You can add an alias to your `~/.bashrc` for quicker access:*
```bash
alias tachyview='source /path/to/TachyView/activate_tachyview.sh'
```

## Running the Application

The application consists of a Python backend (for topology) and a web frontend.

### 1. Start the Backend
(Ensure environment is activated)
```bash
# Navigate to the backend directory (example)
python topological_spines/backend/spine_server.py
```

### 2. Start the Frontend
Open a new terminal and start a static file server in the project root:
```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/` in a WebGL-capable browser.

## Features

*   **Volume Rendering**: 2D-texture based, 3D-texture based (view-aligned slicing), and ray marching implementations.
*   **Topological Analysis**: Computation of topological spines via hdtopology.

## Roadmap

*   [x] Volume Rendering Engine
*   [ ] Topology Backend Compilation
*   [ ] Integration of Topological Spine UI
*   [ ] Bidirectional linking between Volume and Topology views