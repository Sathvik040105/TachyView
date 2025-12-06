#!/bin/bash
set -e  # Exit on any error

ROOT=$(pwd)
ELIB_DIR="$ROOT/external_libs"

echo "========================================="
echo "Starting TachyView Setup"
echo "========================================="

# Making sure that you have build tools installed
echo ""
echo "[1/6] Updating apt and installing system dependencies..."
sudo apt update
sudo apt install -y build-essential cmake swig graphviz

# Verify installations
echo ""
echo "Verifying system dependencies..."
command -v cmake >/dev/null 2>&1 || { echo "ERROR: cmake not found"; exit 1; }
command -v swig >/dev/null 2>&1 || { echo "ERROR: swig not found"; exit 1; }
command -v dot >/dev/null 2>&1 || { echo "ERROR: graphviz (dot) not found"; exit 1; }
echo "✓ cmake found: $(cmake --version | head -n1)"
echo "✓ swig found: $(swig -version | head -n2 | tail -n1)"
echo "✓ graphviz found: $(dot -V 2>&1)"

# Creating python's virtual environment
echo ""
echo "[2/6] Creating Python virtual environment..."
python3 -m venv .venv
source .venv/bin/activate

# Verify virtual environment
echo "✓ Virtual environment activated: $VIRTUAL_ENV"

echo ""
echo "[3/6] Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
echo "✓ Python packages installed"

# Setup external libraries
echo ""
echo "[4/6] Building ANNLIB..."
cd $ELIB_DIR/annlib
mkdir -p lib
make linux-g++
if [ ! -f "lib/libANN.a" ]; then
    echo "ERROR: libANN.a not found after build"
    exit 1
fi
echo "✓ ANNLIB built successfully"

# HDTOPOLOGY
echo ""
echo "[5/6] Building HDTOPOLOGY..."
cd $ELIB_DIR/hdtopology
rm -rf build  # Clean build directory
mkdir build
cd build
cmake .. -DENABLE_PYTHON=ON \
         -DANN_INCLUDE_DIR="$ELIB_DIR/annlib/include" \
         -DANN_LIBRARY="$ELIB_DIR/annlib/lib/libANN.a"
make install
echo "✓ HDTOPOLOGY built and installed successfully"

# Go back to root
cd $ROOT

echo ""
echo "[6/6] Running post-installation checks..."
echo "Checking if hdfileformat module is accessible..."
python3 -c "import hdfileformat; print('✓ hdfileformat module imported successfully')" || {
    echo "WARNING: hdfileformat module not found. Python bindings may not be installed correctly."
}

echo ""
echo "========================================="
echo "Setup completed successfully!"
echo "========================================="
echo ""
echo "To activate the virtual environment, run:"
echo "  source .venv/bin/activate"
echo ""
echo "To start the server, run:"
echo "  python3 nddavServer.py"
echo ""