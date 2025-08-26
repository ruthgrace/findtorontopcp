const fetch = require('node-fetch');

async function testPostalCode(code) {
    const response = await fetch('https://register.cpso.on.ca/Get-Search-Results/', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-requested-with': 'XMLHttpRequest'
        },
        body: `postalCode=${encodeURIComponent(code)}&doctorType=Any&LanguagesSelected=ENGLISH`
    });
    
    const data = await response.json();
    return data.totalcount;
}

async function main() {
    console.log('Testing L3T postal codes with 4th digit:');
    let total = 0;
    let tooMany = [];
    
    for (let digit = 0; digit <= 9; digit++) {
        const code = `L3T ${digit}`;
        const count = await testPostalCode(code);
        console.log(`${code}: ${count} results`);
        
        if (count === -1) {
            tooMany.push(code);
        } else {
            total += count;
        }
    }
    
    console.log(`\nTotal doctors found: ${total}`);
    if (tooMany.length > 0) {
        console.log(`Postal codes with >100 results: ${tooMany.join(', ')}`);
    }
}

main().catch(console.error);