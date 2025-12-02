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
            originZ: 0.0,
            physicalWidth: 0.0,
            physicalHeight: 0.0,
            physicalDepth: 0.0,
            scaleX: 1.0,
            scaleY: 1.0,
            scaleZ: 1.0
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
        
        // Read scalar data (as floats first)
        const totalPoints = volume.width * volume.height * volume.depth;
        const rawData = [];
        
        let count = 0;
        for (let i = dataStartIdx; i < lines.length && count < totalPoints; i++) {
            const values = lines[i].trim().split(/\s+/);
            for (const val of values) {
                if (val && count < totalPoints) {
                    rawData.push(parseFloat(val));
                    count++;
                }
            }
        }
        
        // Find min/max of raw data
        let minVal = Infinity, maxVal = -Infinity;
        for (let i = 0; i < rawData.length; i++) {
            minVal = Math.min(minVal, rawData[i]);
            maxVal = Math.max(maxVal, rawData[i]);
        }
        
        // Normalize to 0-255 range
        volume.data = new Uint8Array(totalPoints);
        const range = maxVal - minVal;
        if (range > 0) {
            for (let i = 0; i < rawData.length; i++) {
                const normalized = (rawData[i] - minVal) / range;
                volume.data[i] = Math.floor(normalized * 255);
            }
        }
        
        volume.minValue = 0;
        volume.maxValue = 255;
        
        // Calculate physical dimensions
        volume.physicalWidth = volume.width * volume.spacingX;
        volume.physicalHeight = volume.height * volume.spacingY;
        volume.physicalDepth = volume.depth * volume.spacingZ;
        
        // Calculate scale factors to normalize the largest dimension to 1.0
        const maxDim = Math.max(volume.physicalWidth, volume.physicalHeight, volume.physicalDepth);
        volume.scaleX = volume.physicalWidth / maxDim;
        volume.scaleY = volume.physicalHeight / maxDim;
        volume.scaleZ = volume.physicalDepth / maxDim;
        
        console.log(`Loaded volume: ${volume.width}x${volume.height}x${volume.depth}`);
        console.log(`Spacing: ${volume.spacingX}, ${volume.spacingY}, ${volume.spacingZ}`);
        console.log(`Physical dimensions: ${volume.physicalWidth.toFixed(2)} x ${volume.physicalHeight.toFixed(2)} x ${volume.physicalDepth.toFixed(2)}`);
        console.log(`Scale factors: ${volume.scaleX.toFixed(3)}, ${volume.scaleY.toFixed(3)}, ${volume.scaleZ.toFixed(3)}`);
        console.log(`Raw data range: ${minVal.toFixed(6)} - ${maxVal.toFixed(6)}`);
        console.log(`Normalized range: ${volume.minValue} - ${volume.maxValue}`);
        
        return volume;
    }
}