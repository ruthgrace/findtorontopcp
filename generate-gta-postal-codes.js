const fs = require('fs');

// GTA postal codes with approximate center coordinates
// These are based on the FSA (first 3 characters) and represent general areas
// In production, you would generate these from actual postal code data or geocoding services

const gtaPostalCodes = {
  // Toronto (M codes) - Complete list of all Toronto FSAs
  "Toronto": [
    // Scarborough (M1)
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
    {"code": "M1X", "lat": 43.8361247, "lng": -79.2056361},
    // North York (M2, M3)
    {"code": "M2H", "lat": 43.8037622, "lng": -79.3634517},
    {"code": "M2J", "lat": 43.7785175, "lng": -79.3465557},
    {"code": "M2K", "lat": 43.7869692, "lng": -79.3852072},
    {"code": "M2L", "lat": 43.7574902, "lng": -79.3747141},
    {"code": "M2M", "lat": 43.789053, "lng": -79.4084928},
    {"code": "M2N", "lat": 43.7701199, "lng": -79.4084928},
    {"code": "M2P", "lat": 43.7527583, "lng": -79.4000493},
    {"code": "M2R", "lat": 43.7827364, "lng": -79.4422593},
    {"code": "M3A", "lat": 43.7532586, "lng": -79.3296565},
    {"code": "M3B", "lat": 43.7459058, "lng": -79.352188},
    {"code": "M3C", "lat": 43.7258997, "lng": -79.340923},
    {"code": "M3H", "lat": 43.7543283, "lng": -79.4422593},
    {"code": "M3J", "lat": 43.7679803, "lng": -79.4872619},
    {"code": "M3K", "lat": 43.7374732, "lng": -79.4647633},
    {"code": "M3L", "lat": 43.7390146, "lng": -79.5069436},
    {"code": "M3M", "lat": 43.7284964, "lng": -79.4956974},
    {"code": "M3N", "lat": 43.7616313, "lng": -79.5209994},
    // East York/Downtown East (M4)
    {"code": "M4A", "lat": 43.7258997, "lng": -79.3155716},
    {"code": "M4B", "lat": 43.7063972, "lng": -79.309937},
    {"code": "M4C", "lat": 43.6953439, "lng": -79.3183887},
    {"code": "M4E", "lat": 43.6763574, "lng": -79.2930312},
    {"code": "M4G", "lat": 43.7090604, "lng": -79.3634517},
    {"code": "M4H", "lat": 43.7053689, "lng": -79.3493719},
    {"code": "M4J", "lat": 43.685347, "lng": -79.3381065},
    {"code": "M4K", "lat": 43.6795571, "lng": -79.352188},
    {"code": "M4L", "lat": 43.6689985, "lng": -79.3155716},
    {"code": "M4M", "lat": 43.6595255, "lng": -79.340923},
    {"code": "M4N", "lat": 43.7280797, "lng": -79.3887901},
    {"code": "M4P", "lat": 43.7127511, "lng": -79.3901975},
    {"code": "M4R", "lat": 43.7153834, "lng": -79.4056784},
    {"code": "M4S", "lat": 43.7043365, "lng": -79.3887901},
    {"code": "M4T", "lat": 43.6895743, "lng": -79.3831599},
    {"code": "M4V", "lat": 43.6864123, "lng": -79.4000493},
    {"code": "M4W", "lat": 43.6795626, "lng": -79.3775294},
    {"code": "M4X", "lat": 43.667967, "lng": -79.3676753},
    {"code": "M4Y", "lat": 43.6658599, "lng": -79.3831599},
    // Downtown Core (M5)
    {"code": "M5A", "lat": 43.6542599, "lng": -79.3606359},
    {"code": "M5B", "lat": 43.6571618, "lng": -79.3789371},
    {"code": "M5C", "lat": 43.6514939, "lng": -79.3754179},
    {"code": "M5E", "lat": 43.6447708, "lng": -79.3733064},
    {"code": "M5G", "lat": 43.6579524, "lng": -79.3873826},
    {"code": "M5H", "lat": 43.6505712, "lng": -79.3845675},
    {"code": "M5J", "lat": 43.6408157, "lng": -79.3817523},
    {"code": "M5K", "lat": 43.6471768, "lng": -79.3815764},
    {"code": "M5L", "lat": 43.6481985, "lng": -79.3798169},
    {"code": "M5M", "lat": 43.7332825, "lng": -79.4197497},
    {"code": "M5N", "lat": 43.7116948, "lng": -79.4169356},
    {"code": "M5P", "lat": 43.6969476, "lng": -79.4113072},
    {"code": "M5R", "lat": 43.6727097, "lng": -79.4056784},
    {"code": "M5S", "lat": 43.6626956, "lng": -79.4000493},
    {"code": "M5T", "lat": 43.6532057, "lng": -79.4000493},
    {"code": "M5V", "lat": 43.6289467, "lng": -79.3944199},
    {"code": "M5W", "lat": 43.6464352, "lng": -79.3749758},
    {"code": "M5X", "lat": 43.6484292, "lng": -79.3822802},
    // West Toronto/Parkdale (M6)
    {"code": "M6A", "lat": 43.718518, "lng": -79.4647633},
    {"code": "M6B", "lat": 43.709577, "lng": -79.4450726},
    {"code": "M6C", "lat": 43.6937813, "lng": -79.4281914},
    {"code": "M6E", "lat": 43.6890256, "lng": -79.453512},
    {"code": "M6G", "lat": 43.669542, "lng": -79.4225311},
    {"code": "M6H", "lat": 43.6690051, "lng": -79.4422593},
    {"code": "M6J", "lat": 43.6479267, "lng": -79.4197497},
    {"code": "M6K", "lat": 43.6368472, "lng": -79.4281914},
    {"code": "M6L", "lat": 43.7137562, "lng": -79.4900738},
    {"code": "M6M", "lat": 43.6911158, "lng": -79.4760133},
    {"code": "M6N", "lat": 43.6731853, "lng": -79.4872619},
    {"code": "M6P", "lat": 43.6616083, "lng": -79.4647633},
    {"code": "M6R", "lat": 43.6489597, "lng": -79.456336},
    {"code": "M6S", "lat": 43.6515706, "lng": -79.4844499},
    // M7 codes - special purpose/Queen's Park area
    {"code": "M7A", "lat": 43.6641, "lng": -79.3920}, // Queen's Park (Provincial Government)
    {"code": "M7Y", "lat": 43.6286, "lng": -79.4183}, // Special purpose code
    // Etobicoke (M8, M9)
    {"code": "M8V", "lat": 43.6056466, "lng": -79.5013207},
    {"code": "M8W", "lat": 43.6024137, "lng": -79.5434841},
    {"code": "M8X", "lat": 43.6536536, "lng": -79.5069436},
    {"code": "M8Y", "lat": 43.6362579, "lng": -79.4985091},
    {"code": "M8Z", "lat": 43.6288408, "lng": -79.5209994},
    {"code": "M9A", "lat": 43.6678556, "lng": -79.5322424},
    {"code": "M9B", "lat": 43.6509432, "lng": -79.5547244},
    {"code": "M9C", "lat": 43.6435152, "lng": -79.5772008},
    {"code": "M9L", "lat": 43.7563033, "lng": -79.5659633},
    {"code": "M9M", "lat": 43.7247659, "lng": -79.5322424},
    {"code": "M9N", "lat": 43.706876, "lng": -79.5181847},
    {"code": "M9P", "lat": 43.696319, "lng": -79.5322424},
    {"code": "M9R", "lat": 43.6889054, "lng": -79.5547244},
    {"code": "M9V", "lat": 43.7394164, "lng": -79.5884369},
    {"code": "M9W", "lat": 43.7067483, "lng": -79.5940544}
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
  // York Region (L3, L4, L6A codes)
  "L3L6": [
    {"code": "L3L", "lat": 43.8561, "lng": -79.5443}, // Vaughan
    {"code": "L3P", "lat": 43.8343, "lng": -79.4653}, // Markham
    {"code": "L3R", "lat": 43.8477, "lng": -79.4281}, // Markham
    {"code": "L3S", "lat": 43.8255, "lng": -79.4371}, // Markham
    {"code": "L3T", "lat": 43.8255, "lng": -79.3950}, // Thornhill
    {"code": "L3X", "lat": 43.8600, "lng": -79.3370}, // Markham East
    {"code": "L3Y", "lat": 43.8230, "lng": -79.4560}, // Newmarket
    {"code": "L6A", "lat": 43.8537, "lng": -79.5366}, // Vaughan/Maple
    {"code": "L6B", "lat": 43.9048, "lng": -79.3845}, // Markham North
    {"code": "L6C", "lat": 43.8936, "lng": -79.4371}, // Markham Central
    {"code": "L6E", "lat": 43.9210, "lng": -79.4513}, // Markham Northwest
    {"code": "L6G", "lat": 43.8789, "lng": -79.3280}  // Markham Northeast
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