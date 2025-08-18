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
                    
                    // Filter for Toronto postal codes (starting with M)
                    if (result.value.properties && result.value.properties.PCNAME && 
                        result.value.properties.PCNAME.startsWith('M')) {
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
            path.join(__dirname, 'toronto-postal-boundaries.json'),
            JSON.stringify(geojson, null, 2)
        );
        
        console.log(`Converted ${features.length} Toronto postal codes to GeoJSON`);
        console.log('Output file: toronto-postal-boundaries.json');
        
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
            path.join(__dirname, 'toronto-postal-boundaries-simplified.json'),
            JSON.stringify(simplified)
        );
        
        console.log('Also created simplified version: toronto-postal-boundaries-simplified.json');
        
    } catch (error) {
        console.error('Error converting shapefile:', error);
    }
}

convertShapefileToGeoJSON();