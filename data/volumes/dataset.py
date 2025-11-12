import OpenVisus as ov
import shutil, os

def idx_to_vtk_direct(idx_url, output_vtk_name, cache_dir="."):
    """Convert IDX dataset directly to VTK without intermediate .raw file"""
    
    print(f"Loading dataset from {idx_url}...")
    dataset = ov.load_dataset(idx_url, cache_dir=cache_dir)
    
    # Read data directly into memory
    data = dataset.read()
    print(f"Dataset shape: {data.shape}")
    print(f"Data type: {data.dtype}")
    print(f"Min: {data.min()}, Max: {data.max()}")
    
    # Get dimensions
    if len(data.shape) == 3:
        depth, height, width = data.shape
    else:
        print("Error: Expected 3D data!")
        return
    
    # VTK parameters
    dimensions = f"{width} {height} {depth}"
    spacing = "1 1 1"
    origin = f"{-width/2.0} {-height/2.0} {-depth/2.0}"
    total_points = width * height * depth
    
    # Write VTK file directly from memory
    print(f"Writing VTK file: {output_vtk_name}")
    with open(output_vtk_name, 'w') as f:
        f.write("# vtk DataFile Version 5.1\n")
        f.write("Volume Data\n")
        f.write("ASCII\n")
        f.write("DATASET STRUCTURED_POINTS\n")
        f.write(f"DIMENSIONS {dimensions}\n")
        f.write(f"SPACING {spacing}\n")
        f.write(f"ORIGIN {origin}\n")
        f.write(f"POINT_DATA {total_points}\n")
        f.write("SCALARS scalars unsigned_char 1\n")
        f.write("LOOKUP_TABLE default\n")
        
        # Write data directly from numpy array
        for val in data.flatten():
            f.write(f"{val}\n")
    
    print(f"✓ VTK file created successfully: {output_vtk_name}")
    print(f"  Dimensions: {width}x{height}x{depth}")
    print(f"  Total points: {total_points}")
    # delete the ../IdxDiskAccess folder created by OpenVisus
    shutil.rmtree(os.path.join(cache_dir, "IdxDiskAccess"), ignore_errors=True)
    return output_vtk_name

if __name__ == "__main__":
    idx_to_vtk_direct(
        "http://klacansky.com/open-scivis-datasets/fuel/fuel.idx", 
        "fuel_volume.vtk"
    )

    # idx_to_vtk_direct(
    #     "http://klacansky.com/open-scivis-datasets/bonsai/bonsai.idx",
    #     "bonsai_volume.vtk"
    # )