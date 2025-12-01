"""
VTK to TXT Converter
Converts VTK structured points format to x y z f format for topological spine analysis
"""

def parse_vtk_file(vtk_path):
    """
    Parse a VTK structured points file and extract metadata and scalar data.
    
    Args:
        vtk_path: Path to the .vtk file
        
    Returns:
        dict with keys: dimensions, spacing, origin, scalars (list of values)
    """
    with open(vtk_path, 'r') as f:
        lines = f.readlines()
    
    dimensions = None
    spacing = None
    origin = None
    scalars = []
    reading_scalars = False
    scalar_count = 0
    
    for i, line in enumerate(lines):
        line = line.strip()
        
        # Parse dimensions
        if line.startswith('DIMENSIONS'):
            parts = line.split()
            dimensions = [int(parts[1]), int(parts[2]), int(parts[3])]
            
        # Parse spacing
        elif line.startswith('SPACING') or line.startswith('ASPECT_RATIO'):
            parts = line.split()
            spacing = [float(parts[1]), float(parts[2]), float(parts[3])]
            
        # Parse origin
        elif line.startswith('ORIGIN'):
            parts = line.split()
            origin = [float(parts[1]), float(parts[2]), float(parts[3])]
            
        # Start reading scalar data
        elif line.startswith('LOOKUP_TABLE') or (reading_scalars and line):
            if line.startswith('LOOKUP_TABLE'):
                reading_scalars = True
                continue
                
            if reading_scalars:
                # Read scalar values
                values = line.split()
                for val in values:
                    try:
                        scalars.append(float(val))
                        scalar_count += 1
                    except ValueError:
                        pass
                        
        elif line.startswith('SCALARS'):
            # Next meaningful line after LOOKUP_TABLE will have data
            reading_scalars = False
    
    # Set default values if not found
    if spacing is None:
        spacing = [1.0, 1.0, 1.0]
    if origin is None:
        origin = [0.0, 0.0, 0.0]
        
    return {
        'dimensions': dimensions,
        'spacing': spacing,
        'origin': origin,
        'scalars': scalars
    }


def vtk_to_txt(vtk_path, txt_path):
    """
    Convert VTK structured points file to x y z f text format.
    
    Args:
        vtk_path: Path to input .vtk file
        txt_path: Path to output .txt file
        
    Returns:
        Number of points written
    """
    # Parse VTK file
    data = parse_vtk_file(vtk_path)
    
    dimensions = data['dimensions']
    spacing = data['spacing']
    origin = data['origin']
    scalars = data['scalars']
    
    if dimensions is None:
        raise ValueError("Could not parse DIMENSIONS from VTK file")
    
    # Calculate total expected points
    expected_points = dimensions[0] * dimensions[1] * dimensions[2]
    
    if len(scalars) != expected_points:
        print(f"Warning: Expected {expected_points} scalar values but got {len(scalars)}")
    
    # Write to text file in x y z f format
    with open(txt_path, 'w') as f:
        scalar_idx = 0
        
        for k in range(dimensions[2]):  # z
            for j in range(dimensions[1]):  # y
                for i in range(dimensions[0]):  # x
                    # Calculate world coordinates
                    x = origin[0] + i * spacing[0]
                    y = origin[1] + j * spacing[1]
                    z = origin[2] + k * spacing[2]
                    
                    # Get scalar value
                    if scalar_idx < len(scalars):
                        f_val = scalars[scalar_idx]
                    else:
                        f_val = 0.0
                    
                    # Write in x y z f format
                    f.write(f"{x} {y} {z} {f_val}\n")
                    scalar_idx += 1
    
    return scalar_idx


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python VTKConverter.py <input.vtk> <output.txt>")
        sys.exit(1)
    
    vtk_file = sys.argv[1]
    txt_file = sys.argv[2]
    
    num_points = vtk_to_txt(vtk_file, txt_file)
    print(f"Converted {num_points} points from {vtk_file} to {txt_file}")
