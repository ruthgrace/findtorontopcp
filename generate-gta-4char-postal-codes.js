const fs = require('fs');

// Load the existing FSA-level postal codes
const existingData = JSON.parse(fs.readFileSync('gta-postal-codes.json'));

// Extract unique FSAs from the existing data
const fsas = new Set();
existingData.postalCodes.forEach(pc => {
    const fsa = pc.code.substring(0, 3);
    fsas.add(fsa);
});

console.log(`Found ${fsas.size} unique FSAs in GTA`);

// Generate 4-character postal codes (FSA + space + digit)
// Each FSA gets 10 codes (0-9)
const fourCharCodes = [];

fsas.forEach(fsa => {
    // Find the original coordinates for this FSA
    const originalCode = existingData.postalCodes.find(pc => pc.code === fsa || pc.code.startsWith(fsa));
    
    if (originalCode) {
        // Generate codes for digits 0-9
        for (let digit = 0; digit <= 9; digit++) {
            fourCharCodes.push({
                code: `${fsa} ${digit}`,
                lat: originalCode.lat,
                lng: originalCode.lng,
                fsa: fsa
            });
        }
    }
});

// Sort by code
fourCharCodes.sort((a, b) => a.code.localeCompare(b.code));

console.log(`Generated ${fourCharCodes.length} 4-character postal codes`);

// Write the new file
const output = {
    postalCodes: fourCharCodes
};

fs.writeFileSync('gta-4char-postal-codes.json', JSON.stringify(output, null, 2));
console.log('Output file: gta-4char-postal-codes.json');

// Show sample
console.log('\nSample postal codes:');
fourCharCodes.slice(0, 10).forEach(pc => {
    console.log(`  ${pc.code} (${pc.lat}, ${pc.lng})`);
});