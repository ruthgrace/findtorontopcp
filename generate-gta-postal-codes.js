const fs = require('fs');

// GTA postal codes with approximate center coordinates
// These are based on the FSA (first 3 characters) and represent general areas
// In production, you would generate these from actual postal code data or geocoding services

const gtaPostalCodes = {
  // Toronto (M codes) - existing codes
  "M1": [
    {"code": "M1B", "lat": 43.8066863, "lng": -79.1943534},
    {"code": "M1C", "lat": 43.7845351, "lng": -79.1604971},
    {"code": "M1E", "lat": 43.7635726, "lng": -79.1887115},
    {"code": "M1G", "lat": 43.7709921, "lng": -79.2169174},
    {"code": "M1H", "lat": 43.773136, "lng": -79.2394761},
    {"code": "M1J", "lat": 43.7447342, "lng": -79.2394761},
    {"code": "M1K", "lat": 43.7279292, "lng": -79.2620294},
    {"code": "M1L", "lat": 43.7111117, "lng": -79.2845772},
    {"code": "M1M", "lat": 43.716316, "lng": -79.2394761},
    {"code": "M1N", "lat": 43.692657, "lng": -79.2648481},
    {"code": "M1P", "lat": 43.7574902, "lng": -79.273304},
    {"code": "M1R", "lat": 43.7500715, "lng": -79.3095874},
    {"code": "M1S", "lat": 43.7942003, "lng": -79.2620294},
    {"code": "M1T", "lat": 43.7816375, "lng": -79.3043021},
    {"code": "M1V", "lat": 43.8152522, "lng": -79.2845772},
    {"code": "M1W", "lat": 43.7995252, "lng": -79.3183887},
    {"code": "M1X", "lat": 43.8361247, "lng": -79.2056361}
  ],
  // Durham Region (L1 codes)
  "L1": [
    {"code": "L1S", "lat": 43.8501, "lng": -79.0204}, // Ajax SW
    {"code": "L1T", "lat": 43.8682, "lng": -79.0366}, // Ajax NW
    {"code": "L1Z", "lat": 43.8585, "lng": -79.0087}, // Ajax East
    {"code": "L1V", "lat": 43.8971, "lng": -79.0870}, // Pickering SW
    {"code": "L1W", "lat": 43.8354, "lng": -79.0869}, // Pickering South
    {"code": "L1X", "lat": 43.9000, "lng": -79.1229}, // Pickering Central
    {"code": "L1Y", "lat": 43.9154, "lng": -79.1163}, // Pickering North
    {"code": "L1M", "lat": 43.9146, "lng": -78.9429}, // Whitby North
    {"code": "L1N", "lat": 43.8971, "lng": -78.9429}, // Whitby SE
    {"code": "L1P", "lat": 43.8682, "lng": -78.9177}, // Whitby SW
    {"code": "L1R", "lat": 43.8971, "lng": -78.9658}, // Whitby Central
    {"code": "L1G", "lat": 43.8971, "lng": -78.8658}, // Oshawa Central
    {"code": "L1H", "lat": 43.8971, "lng": -78.8658}, // Oshawa SE
    {"code": "L1J", "lat": 43.9146, "lng": -78.8985}, // Oshawa SW
    {"code": "L1K", "lat": 43.9348, "lng": -78.8658}, // Oshawa East
    {"code": "L1B", "lat": 43.9141, "lng": -78.6874}, // Bowmanville
    {"code": "L1E", "lat": 43.9374, "lng": -78.5901}, // Courtice
  ],
  // York Region (L3, L4 codes)
  "L3": [
    {"code": "L3R", "lat": 43.8477, "lng": -79.4281}, // Markham
    {"code": "L3S", "lat": 43.8255, "lng": -79.4371}, // Markham
    {"code": "L3T", "lat": 43.8255, "lng": -79.3950}, // Thornhill
    {"code": "L3L", "lat": 43.8561, "lng": -79.5443}, // Vaughan
    {"code": "L3P", "lat": 43.8343, "lng": -79.4653}  // Markham
  ],
  "L4": [
    {"code": "L4A", "lat": 43.9693, "lng": -79.2465}, // Stouffville
    {"code": "L4B", "lat": 43.8826, "lng": -79.4419}, // Richmond Hill SE
    {"code": "L4C", "lat": 43.8706, "lng": -79.4371}, // Richmond Hill SW
    {"code": "L4E", "lat": 43.9220, "lng": -79.4593}, // Richmond Hill
    {"code": "L4G", "lat": 43.9955, "lng": -79.4663}, // Aurora
    {"code": "L4H", "lat": 43.8577, "lng": -79.5878}, // Woodbridge/Kleinburg
    {"code": "L4J", "lat": 43.7706, "lng": -79.5239}, // Vaughan/Maple
    {"code": "L4K", "lat": 43.8438, "lng": -79.5028}, // Concord
    {"code": "L4L", "lat": 43.8423, "lng": -79.5883}, // Woodbridge South
    {"code": "L4S", "lat": 43.8615, "lng": -79.4281}  // Richmond Hill Central
  ],
  // Mississauga (L5 codes)
  "L5": [
    {"code": "L5A", "lat": 43.5960, "lng": -79.6494}, // Mississauga Valley
    {"code": "L5B", "lat": 43.5890, "lng": -79.6444}, // City Centre
    {"code": "L5C", "lat": 43.5670, "lng": -79.6631}, // Central Erin Mills
    {"code": "L5E", "lat": 43.5773, "lng": -79.5763}, // Lakeview
    {"code": "L5G", "lat": 43.5645, "lng": -79.5985}, // SW Lakeview
    {"code": "L5H", "lat": 43.5489, "lng": -79.6010}, // Port Credit
    {"code": "L5J", "lat": 43.5150, "lng": -79.6417}, // Clarkson
    {"code": "L5K", "lat": 43.5365, "lng": -79.6808}, // West Sheridan
    {"code": "L5L", "lat": 43.5579, "lng": -79.7193}, // Churchill Meadows
    {"code": "L5M", "lat": 43.5830, "lng": -79.7611}, // Central Erin Mills
    {"code": "L5N", "lat": 43.5998, "lng": -79.7611}, // Lisgar/Meadowvale
    {"code": "L5R", "lat": 43.6062, "lng": -79.7136}, // Meadowvale North
    {"code": "L5S", "lat": 43.6534, "lng": -79.6963}, // NE Gateway
    {"code": "L5T", "lat": 43.6495, "lng": -79.6596}, // East Gateway
    {"code": "L5V", "lat": 43.6122, "lng": -79.7204}, // Meadowvale West
    {"code": "L5W", "lat": 43.6020, "lng": -79.7193}, // Meadowvale Village
    {"code": "L4T", "lat": 43.7117, "lng": -79.6248}, // Malton
    {"code": "L4V", "lat": 43.6360, "lng": -79.6087}, // Wildwood
    {"code": "L4W", "lat": 43.6881, "lng": -79.6461}, // Airport Corporate
    {"code": "L4X", "lat": 43.6055, "lng": -79.5545}, // Applewood
    {"code": "L4Y", "lat": 43.5979, "lng": -79.5884}, // West Applewood
    {"code": "L4Z", "lat": 43.6089, "lng": -79.5659}  // Rathwood
  ],
  // Brampton (L6 codes)
  "L6": [
    {"code": "L6P", "lat": 43.7638, "lng": -79.7467}, // North Brampton
    {"code": "L6R", "lat": 43.7258, "lng": -79.7796}, // Northwest Brampton
    {"code": "L6S", "lat": 43.7091, "lng": -79.7356}, // North Central Brampton
    {"code": "L6T", "lat": 43.6969, "lng": -79.7188}, // East Brampton
    {"code": "L6V", "lat": 43.7311, "lng": -79.7622}, // Central Brampton
    {"code": "L6W", "lat": 43.6777, "lng": -79.7363}, // Southeast Brampton
    {"code": "L6X", "lat": 43.7152, "lng": -79.8027}, // Northwest Brampton
    {"code": "L6Y", "lat": 43.6677, "lng": -79.7602}, // South Brampton
    {"code": "L6Z", "lat": 43.6736, "lng": -79.7913}, // West Central Brampton
    {"code": "L7A", "lat": 43.6852, "lng": -79.8593}  // West Brampton
  ],
  // Burlington/Oakville (L7 codes)
  "L7": [
    {"code": "L7L", "lat": 43.3255, "lng": -79.7990}, // Burlington
    {"code": "L7M", "lat": 43.3387, "lng": -79.8218}, // Burlington Central
    {"code": "L7N", "lat": 43.3665, "lng": -79.7752}, // Burlington North
    {"code": "L7P", "lat": 43.3665, "lng": -79.8371}, // Burlington NW
    {"code": "L7R", "lat": 43.3255, "lng": -79.8371}, // Burlington SW
    {"code": "L7S", "lat": 43.3869, "lng": -79.8087}, // Burlington NE
    {"code": "L7T", "lat": 43.3112, "lng": -79.8602}  // Burlington/Aldershot
  ],
  // Rural GTA areas (L0 codes) - Selected key areas
  "L0": [
    {"code": "L0B", "lat": 44.0501, "lng": -78.7373}, // East Durham Region
    {"code": "L0C", "lat": 43.9710, "lng": -79.3695}, // West Durham Region
    {"code": "L0H", "lat": 44.0068, "lng": -79.2860}, // York/Durham Boundary
    {"code": "L0J", "lat": 43.8532, "lng": -79.7542}, // Peel/York Boundary
    {"code": "L0P", "lat": 43.5726, "lng": -79.8760}  // Halton Region North
  ]
};

// Combine all postal codes into a single array
const allPostalCodes = [];
Object.values(gtaPostalCodes).forEach(region => {
  allPostalCodes.push(...region);
});

// Sort by postal code
allPostalCodes.sort((a, b) => a.code.localeCompare(b.code));

// Write to file
const output = {
  postalCodes: allPostalCodes
};

fs.writeFileSync('gta-postal-codes.json', JSON.stringify(output, null, 2));
console.log(`Generated ${allPostalCodes.length} GTA postal codes`);
console.log('Output file: gta-postal-codes.json');

// Also keep the original toronto-postal-codes.json for backward compatibility
// by extracting only M codes
const torontoOnlyCodes = allPostalCodes.filter(pc => pc.code.startsWith('M'));
const torontoOutput = {
  postalCodes: torontoOnlyCodes
};

fs.writeFileSync('toronto-postal-codes.json', JSON.stringify(torontoOutput, null, 2));
console.log(`Also maintained ${torontoOnlyCodes.length} Toronto-only postal codes`);
console.log('Output file: toronto-postal-codes.json');