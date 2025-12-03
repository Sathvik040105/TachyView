ROOT=$(pwd)
ELIB_DIR="$ROOT/external_libs"

# Making sure that you have build tools installed
sudo apt update
sudo apt install build-essential cmake

# Creating python's virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Setup external libraries
cd $ELIB_DIR

## ANNLIB
cd annlib
mkdir lib
make linux-g++

## HDTOPOLOGY
cd ../hdtopology
mkdir build
cd build
cmake .. -DENABLE_PYTHON=ON -DANN_INCLUDE_DIR="$ELIB_DIR/annlib/include" -DANN_LIBRARY="$ELIB_DIR/annlib/lib/libANN.a"
make install

## Go back to root
cd $ROOT

echo "Setup completed"