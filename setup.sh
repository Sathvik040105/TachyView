#!/bin/bash
# Complete TachyView Installation Script (Robust ANN Fix)

set -e  # Exit on error

echo "=========================================="
echo "TachyView Installation Script"
echo "=========================================="

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Create virtual environment
echo -e "\n[1/9] Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Step 2: Upgrade pip
echo -e "\n[2/9] Upgrading pip..."
pip install --upgrade pip

# Step 3: Install Python dependencies
echo -e "\n[3/9] Installing Python dependencies..."
# Ensure numpy<2 is installed to prevent ABI issues
pip install "numpy<2.0"
pip install -r requirements.txt

# Step 4: Create directories
echo -e "\n[4/9] Creating directory structure..."
mkdir -p external_libs
mkdir -p topological_spines/{backend,frontend,lib}
mkdir -p integration

# Step 5: Install System Dependencies
echo -e "\n[5/9] Installing system dependencies..."
if command -v apt-get &> /dev/null; then
    echo "Installing build tools..."
    sudo apt-get update
    sudo apt-get install -y cmake swig graphviz g++
fi

# Step 6: Clone hdtopology
echo -e "\n[6/9] Cloning hdtopology..."
cd "$SCRIPT_DIR/external_libs"

if [ ! -d "hdtopology" ]; then
    git clone https://github.com/LLNL/hdtopology.git
fi

cd "$SCRIPT_DIR"

# Step 7: Manually Build Bundled ANN
echo -e "\n[7/9] Manually building bundled ANN library..."
cd "$SCRIPT_DIR/external_libs/hdtopology"

# 7a. Patch the missing include in ANN source
echo "Patching bundled ANN library source..."
if [ -f "external/annlibs/src/kd_dump.cpp" ]; then
    # Check if patch is already applied to avoid duplication
    if ! grep -q "#include <cstring>" external/annlibs/src/kd_dump.cpp; then
        sed -i '/#include "bd_tree.h"/a #include <cstring>' external/annlibs/src/kd_dump.cpp
        echo "✓ Applied patch to kd_dump.cpp"
    else
        echo "✓ Patch already applied"
    fi
else
    echo "WARNING: Could not find kd_dump.cpp to patch."
fi

# 7b. Compile ANN manually with -fPIC
ANN_SRC_DIR="$PWD/external/annlibs"
ANN_BUILD_DIR="$PWD/external/annlibs/build_manual"

mkdir -p "$ANN_BUILD_DIR"
cd "$ANN_BUILD_DIR"

echo "Compiling ANN objects..."
# Compile all .cpp files in src/ with -fPIC and include path
g++ -c -fPIC -O3 -I"$ANN_SRC_DIR/include" "$ANN_SRC_DIR"/src/*.cpp

echo "Creating static library libANN.a..."
ar rcs libANN.a *.o

if [ ! -f "libANN.a" ]; then
    echo "ERROR: Failed to create libANN.a"
    exit 1
fi

echo "✓ ANN library built at: $PWD/libANN.a"

# --- FIX: Return to script root using absolute path ---
cd "$SCRIPT_DIR"

# Step 8: Build hdtopology with Python bindings
echo -e "\n[8/9] Building hdtopology..."
cd "$SCRIPT_DIR/external_libs/hdtopology"

# Clean previous build
rm -rf build
mkdir -p build
cd build

PYTHON_EXEC=$(which python3)
PYTHON_INCLUDE=$(python3 -c "from sysconfig import get_paths; print(get_paths()['include'])")
PYTHON_LIB=$(python3 -c "import sysconfig; print(sysconfig.get_config_var('LIBDIR'))")

# Paths to our manually built ANN
MY_ANN_LIB="$ANN_BUILD_DIR/libANN.a"
MY_ANN_INC="$ANN_SRC_DIR/include"

echo "Configuring CMake..."
# We explicitly provide ANN_INCLUDE_DIR and ANN_LIBRARY
# This treats our manual build as an "external" library, ensuring correct linking
cmake .. \
    -DENABLE_PYTHON=ON \
    -DPYTHON_EXECUTABLE=$PYTHON_EXEC \
    -DPYTHON_INCLUDE_DIR=$PYTHON_INCLUDE \
    -DPYTHON_LIBRARY=$PYTHON_LIB \
    -DANN_INCLUDE_DIR="$MY_ANN_INC" \
    -DANN_LIBRARY="$MY_ANN_LIB" \
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
    -DCMAKE_INSTALL_PREFIX=$SCRIPT_DIR/venv

echo "Compiling..."
make -j$(nproc)
make install

cd "$SCRIPT_DIR"

# Step 9: Link hdanalysis
echo -e "\n[9/9] Linking NDDAV hdanalysis..."
cd "$SCRIPT_DIR/topological_spines/lib"
# Remove existing link if it exists to avoid errors
rm -f hdanalysis
ln -sf /home/vikku/Desktop/Graph_Viz/Project/NDDAV/hdanalysis ./hdanalysis
cd "$SCRIPT_DIR"

echo -e "\n=========================================="
echo "Installation complete!"
echo "=========================================="
echo "To activate environment: source activate_tachyview.sh"
echo "Or add alias to ~/.bashrc:"
echo "  alias tachyview='source $SCRIPT_DIR/activate_tachyview.sh'"
