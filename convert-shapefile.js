const shapefile = require('shapefile');
const fs = require('fs');
const path = require('path');

async function convertShapefileToGeoJSON() {
    try {
        console.log('Converting shapefile to GeoJSON...');
        
        const shapefilePath = path.join(__dirname, 'postcode_geodata/lcsd000a25a_e/lcsd000a25a_e.shp');
        
        const features = [];
        
        await shapefile.open(shapefilePath)
            .then(source => source.read()
                .then(function log(result) {
                    if (result.done) return;
                    
                    // Filter for GTA postal codes (M for Toronto, L0-L7 for surrounding regions)
                    if (result.value.properties && result.value.properties.PCNAME) {
                        const pc = result.value.properties.PCNAME;
                        const isGTA = pc.startsWith('M') || 
                                     pc.startsWith('L0') ||
                                     pc.startsWith('L1') ||
                                     pc.startsWith('L3') ||
                                     pc.startsWith('L4') ||
                                     pc.startsWith('L5') ||
                                     pc.startsWith('L6') ||
                                     pc.startsWith('L7');
                        
                        if (!isGTA) return source.read().then(log);
                        features.push({
                            type: 'Feature',
                            properties: {
                                postalCode: result.value.properties.PCNAME,
                                province: result.value.properties.PRNAME
                            },
                            geometry: result.value.geometry
                        });
                    }
                    
                    return source.read().then(log);
                }));
        
        const geojson = {
            type: 'FeatureCollection',
            features: features
        };
        
        // Write the GeoJSON file
        fs.writeFileSync(
            path.join(__dirname, 'gta-postal-boundaries.json'),
            JSON.stringify(geojson, null, 2)
        );
        
        console.log(`Converted ${features.length} GTA postal codes to GeoJSON`);
        console.log('Output file: gta-postal-boundaries.json');
        
        // Also create a simplified version with just essential data for faster loading
        const simplified = {
            type: 'FeatureCollection',
            features: features.map(f => ({
                type: 'Feature',
                properties: {
                    code: f.properties.postalCode
                },
                geometry: f.geometry
            }))
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'gta-postal-boundaries-simplified.json'),
            JSON.stringify(simplified)
        );
        
        console.log('Also created simplified version: gta-postal-boundaries-simplified.json');
        
    } catch (error) {
        console.error('Error converting shapefile:', error);
    }
}

convertShapefileToGeoJSON();