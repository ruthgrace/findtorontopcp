const turf = require('@turf/turf');
const fs = require('fs');

// Load the postal codes with center points
const postalCodes = JSON.parse(fs.readFileSync('toronto-postal-codes.json')).postalCodes;

// Create approximate boundaries using buffers around center points
// Using 1.5km radius for each postal code area (adjustable based on density)
const features = postalCodes.map(pc => {
    const point = turf.point([pc.lng, pc.lat]);
    const buffered = turf.buffer(point, 1.5, { units: 'kilometers' });
    
    return {
        type: 'Feature',
        properties: {
            code: pc.code
        },
        geometry: buffered.geometry
    };
});

const geojson = {
    type: 'FeatureCollection',
    features: features
};

// Save the GeoJSON with boundaries
fs.writeFileSync('toronto-postal-boundaries.json', JSON.stringify(geojson, null, 2));

console.log(`Created approximate boundaries for ${features.length} Toronto postal codes`);
console.log('Output: toronto-postal-boundaries.json');

// Also create a minified version for production
fs.writeFileSync('toronto-postal-boundaries.min.json', JSON.stringify(geojson));
console.log('Created minified version: toronto-postal-boundaries.min.json');