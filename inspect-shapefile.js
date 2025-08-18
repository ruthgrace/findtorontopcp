const shapefile = require('shapefile');
const path = require('path');

async function inspectShapefile() {
    try {
        console.log('Inspecting shapefile...');
        
        const shapefilePath = path.join(__dirname, 'postcode_geodata/lfsa000b21a_e/lfsa000b21a_e.shp');
        
        let count = 0;
        let sampleProperties = null;
        
        await shapefile.open(shapefilePath)
            .then(source => source.read()
                .then(function log(result) {
                    if (result.done) return;
                    
                    count++;
                    
                    // Get sample properties from first few records
                    if (count <= 5) {
                        console.log(`\nRecord ${count}:`);
                        console.log('Properties:', result.value.properties);
                        if (!sampleProperties) {
                            sampleProperties = Object.keys(result.value.properties);
                        }
                    }
                    
                    // Stop after 10 records to avoid too much output
                    if (count >= 10) return;
                    
                    return source.read().then(log);
                }));
        
        console.log('\n---Summary---');
        console.log('Total records inspected:', count);
        console.log('Available fields:', sampleProperties);
        
    } catch (error) {
        console.error('Error inspecting shapefile:', error);
    }
}

inspectShapefile();