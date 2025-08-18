const shapefile = require('shapefile');
const fs = require('fs');
const path = require('path');
const proj4 = require('proj4');
const turf = require('@turf/turf');

// Function to reproject geometry from one projection to another
function reprojectGeometry(geometry, fromProj, toProj) {
    const type = geometry.type;
    
    if (type === 'Polygon') {
        return {
            type: 'Polygon',
            coordinates: geometry.coordinates.map(ring =>
                ring.map(coord => proj4(fromProj, toProj, coord))
            )
        };
    } else if (type === 'MultiPolygon') {
        return {
            type: 'MultiPolygon',
            coordinates: geometry.coordinates.map(polygon =>
                polygon.map(ring =>
                    ring.map(coord => proj4(fromProj, toProj, coord))
                )
            )
        };
    }
    
    return geometry;
}

async function convertFSAShapefileToGeoJSON() {
    try {
        console.log('Converting FSA shapefile to GeoJSON with projection transformation...');
        
        // Define the projection transformation
        // From: NAD83 / Statistics Canada Lambert
        // To: WGS84 (standard lat/lng)
        const fromProj = '+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +datum=NAD83 +units=m +no_defs';
        const toProj = 'EPSG:4326'; // WGS84
        
        const shapefilePath = path.join(__dirname, 'postcode_geodata/lfsa000b21a_e/lfsa000b21a_e.shp');
        
        const features = [];
        let torontoCount = 0;
        let totalCount = 0;
        
        await shapefile.open(shapefilePath)
            .then(source => source.read()
                .then(function log(result) {
                    if (result.done) return;
                    
                    totalCount++;
                    
                    // Filter for Toronto FSAs (starting with M) and Ontario
                    if (result.value.properties && 
                        result.value.properties.CFSAUID && 
                        result.value.properties.CFSAUID.startsWith('M') &&
                        result.value.properties.PRNAME && 
                        result.value.properties.PRNAME.includes('Ontario')) {
                        
                        torontoCount++;
                        console.log(`Found Toronto FSA: ${result.value.properties.CFSAUID}`);
                        
                        // Reproject the geometry from Statistics Canada Lambert to WGS84
                        const reprojectedGeometry = reprojectGeometry(result.value.geometry, fromProj, toProj);
                        
                        features.push({
                            type: 'Feature',
                            properties: {
                                fsa: result.value.properties.CFSAUID,
                                province: result.value.properties.PRNAME,
                                landArea: result.value.properties.LANDAREA
                            },
                            geometry: reprojectedGeometry
                        });
                    }
                    
                    return source.read().then(log);
                }));
        
        const geojson = {
            type: 'FeatureCollection',
            features: features
        };
        
        // Write the full GeoJSON file
        fs.writeFileSync(
            path.join(__dirname, 'toronto-fsa-boundaries.json'),
            JSON.stringify(geojson, null, 2)
        );
        
        console.log(`\nConverted ${torontoCount} Toronto FSAs from ${totalCount} total records`);
        console.log('Output file: toronto-fsa-boundaries.json');
        
        // Also create a minified version for production
        fs.writeFileSync(
            path.join(__dirname, 'toronto-fsa-boundaries.min.json'),
            JSON.stringify(geojson)
        );
        
        console.log('Created minified version: toronto-fsa-boundaries.min.json');
        
        // List all FSAs found
        console.log('\nToronto FSAs found:');
        features.forEach(f => console.log(`  ${f.properties.fsa} - Land area: ${f.properties.landArea} km²`));
        
    } catch (error) {
        console.error('Error converting FSA shapefile:', error);
    }
}

convertFSAShapefileToGeoJSON();