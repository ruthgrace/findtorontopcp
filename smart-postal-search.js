const fetch = require('node-fetch');

/**
 * Search CPSO API with a postal code
 * Returns { totalcount: number, results: array }
 */
async function searchCPSO(postalCode, doctorType = 'Any', language = 'ENGLISH') {
    const response = await fetch('https://register.cpso.on.ca/Get-Search-Results/', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-requested-with': 'XMLHttpRequest'
        },
        body: `postalCode=${encodeURIComponent(postalCode)}&doctorType=${doctorType}&LanguagesSelected=${language}`
    });
    
    return await response.json();
}

/**
 * Smart search that expands postal codes when too many results
 * Returns array of all doctors found
 */
async function smartPostalSearch(basePostalCode, doctorType = 'Any', language = 'ENGLISH') {
    const allDoctors = [];
    const postalCodesToSearch = [basePostalCode];
    const searchedCodes = new Set();
    
    while (postalCodesToSearch.length > 0) {
        const code = postalCodesToSearch.shift();
        
        // Skip if already searched
        if (searchedCodes.has(code)) continue;
        searchedCodes.add(code);
        
        console.log(`Searching: ${code}`);
        const result = await searchCPSO(code, doctorType, language);
        
        if (result.totalcount === -1) {
            // Too many results, need to expand
            console.log(`  └─ Too many results (>100), expanding...`);
            
            const expanded = expandPostalCode(code);
            if (expanded.length > 0) {
                postalCodesToSearch.push(...expanded);
            } else {
                console.log(`  └─ Cannot expand further! Code ${code} has >100 results at maximum specificity`);
            }
        } else if (result.totalcount === 0) {
            console.log(`  └─ No doctors found`);
        } else {
            console.log(`  └─ Found ${result.totalcount} doctors`);
            allDoctors.push(...result.results);
        }
    }
    
    return allDoctors;
}

/**
 * Expand a postal code to be more specific
 * L3T -> L3T 0, L3T 1, ..., L3T 9
 * L3T 0 -> L3T 0A, L3T 0B, ..., L3T 0Z
 * L3T 0A -> L3T 0A0, L3T 0A1, ..., L3T 0A9
 */
function expandPostalCode(code) {
    const expanded = [];
    
    // Remove any existing spaces for consistent handling
    const cleanCode = code.replace(/\s+/g, '');
    
    if (cleanCode.length === 3) {
        // FSA only - add 4th digit (0-9)
        for (let i = 0; i <= 9; i++) {
            expanded.push(`${cleanCode} ${i}`);
        }
    } else if (cleanCode.length === 4) {
        // Has 4th digit - add 5th letter (A-Z)
        // Skip certain letters that aren't used in Canadian postal codes
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.replace(/[DFIOQU]/g, ''); // Remove D,F,I,O,Q,U
        for (const letter of letters) {
            expanded.push(`${cleanCode.slice(0, 3)} ${cleanCode[3]}${letter}`);
        }
    } else if (cleanCode.length === 5) {
        // Has 5th letter - add 6th digit (0-9)
        for (let i = 0; i <= 9; i++) {
            expanded.push(`${cleanCode.slice(0, 3)} ${cleanCode.slice(3)}${i}`);
        }
    }
    // If length is 6, we can't expand further
    
    return expanded;
}

// Test the function
async function test() {
    console.log('Testing smart postal search for L3T:\n');
    const doctors = await smartPostalSearch('L3T');
    console.log(`\nTotal doctors found: ${doctors.length}`);
    
    // Show breakdown by postal code
    const byPostalCode = {};
    doctors.forEach(doc => {
        const pc = doc.postalcode || 'Unknown';
        byPostalCode[pc] = (byPostalCode[pc] || 0) + 1;
    });
    
    console.log('\nDoctors by postal code:');
    Object.entries(byPostalCode)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 10)
        .forEach(([pc, count]) => {
            console.log(`  ${pc}: ${count} doctors`);
        });
}

// Export for use in other files
module.exports = { smartPostalSearch, searchCPSO };

// Run test if called directly
if (require.main === module) {
    test().catch(console.error);
}