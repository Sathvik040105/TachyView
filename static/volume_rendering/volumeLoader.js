/**
 * VTK file loader for volume data
 */
export class VolumeLoader {
    static async loadVTK(file) {
        const text = await file.text();
        return VolumeLoader.parseVTK(text);
    }
    
    static parseVTK(text) {
        const lines = text.split('\n');
        const volume = {
            data: null,
            width: 0,
            height: 0,
            depth: 0,
            spacingX: 1.0,
            spacingY: 1.0,
            spacingZ: 1.0,
            originX: 0.0,
            originY: 0.0,
            originZ: 0.0
        };
        
        // Parse DIMENSIONS
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('DIMENSIONS')) {
                const parts = lines[i].trim().split(/\s+/);
                volume.width = parseInt(parts[1]);
                volume.height = parseInt(parts[2]);
                volume.depth = parseInt(parts[3]);
                break;
            }
        }
        
        // Parse SPACING
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('SPACING')) {
                const parts = lines[i].trim().split(/\s+/);
                volume.spacingX = parseFloat(parts[1]);
                volume.spacingY = parseFloat(parts[2]);
                volume.spacingZ = parseFloat(parts[3]);
                break;
            }
        }
        
        // Parse ORIGIN
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('ORIGIN')) {
                const parts = lines[i].trim().split(/\s+/);
                volume.originX = parseFloat(parts[1]);
                volume.originY = parseFloat(parts[2]);
                volume.originZ = parseFloat(parts[3]);
                break;
            }
        }
        
        // Find data start
        let dataStartIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('LOOKUP_TABLE') || lines[i].includes('COLOR_SCALARS')) {
                dataStartIdx = i + 1;
                break;
            }
        }
        
        if (dataStartIdx === -1) {
            throw new Error('Could not find data in VTK file');
        }
        
        // Read scalar data
        const totalPoints = volume.width * volume.height * volume.depth;
        volume.data = new Uint8Array(totalPoints);
        
        let count = 0;
        for (let i = dataStartIdx; i < lines.length && count < totalPoints; i++) {
            const values = lines[i].trim().split(/\s+/);
            for (const val of values) {
                if (val && count < totalPoints) {
                    let v = parseInt(val);
                    v = Math.max(0, Math.min(255, v));
                    volume.data[count++] = v;
                }
            }
        }
        
        // Calculate data range
        let min = 255, max = 0;
        for (let i = 0; i < volume.data.length; i++) {
            min = Math.min(min, volume.data[i]);
            max = Math.max(max, volume.data[i]);
        }
        volume.minValue = min;
        volume.maxValue = max;
        
        console.log(`Loaded volume: ${volume.width}x${volume.height}x${volume.depth}`);
        console.log(`Spacing: ${volume.spacingX}, ${volume.spacingY}, ${volume.spacingZ}`);
        console.log(`Range: ${min}-${max}`);
        
        return volume;
    }
}