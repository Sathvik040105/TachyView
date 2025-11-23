#!/bin/bash
# TachyView Environment Activation Script with hdtopology

echo "=========================================="
echo "Activating TachyView Environment"
echo "=========================================="

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Activate virtual environment
source "$SCRIPT_DIR/venv/bin/activate"

# Set environment variables
export TACHYVIEW_ROOT="$SCRIPT_DIR"
export PYTHONPATH="$SCRIPT_DIR:$SCRIPT_DIR/topological_spines/lib:$PYTHONPATH"

# Add NDDAV to path for hdanalysis imports
export PYTHONPATH="/home/vikku/Desktop/Graph_Viz/Project/NDDAV:$PYTHONPATH"

# Set library path for compiled libraries
export LD_LIBRARY_PATH="$SCRIPT_DIR/venv/lib:/usr/local/lib:$LD_LIBRARY_PATH"

echo "✓ Virtual environment activated"
echo "✓ Python: $(which python3)"
echo "✓ TACHYVIEW_ROOT: $TACHYVIEW_ROOT"
echo ""

# Test imports
echo "Testing critical imports..."
python3 -c "import numpy; print('✓ NumPy')" 2>/dev/null || echo "✗ NumPy FAILED"
python3 -c "import scipy; print('✓ SciPy')" 2>/dev/null || echo "✗ SciPy FAILED"
python3 -c "import vtk; print('✓ VTK')" 2>/dev/null || echo "✗ VTK FAILED"
python3 -c "import hdtopology; print('✓ hdtopology')" 2>/dev/null || echo "✗ hdtopology FAILED"
python3 -c "from hdanalysis.core import ExtremumGraph; print('✓ hdanalysis')" 2>/dev/null || echo "✗ hdanalysis FAILED"

echo ""
echo "=========================================="
echo "Environment ready!"
echo "To deactivate: deactivate"
echo "=========================================="