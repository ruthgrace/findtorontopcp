const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Load geocode cache
const CACHE_FILE = path.join(__dirname, 'geocode-cache.json');
let geocodeCache = {};
try {
    if (fs.existsSync(CACHE_FILE)) {
        geocodeCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        console.log(`Loaded ${Object.keys(geocodeCache).length} cached geocode entries`);
    }
} catch (error) {
    console.error('Error loading geocode cache:', error);
}

// Save cache with atomic write to prevent corruption
function saveCache() {
    try {
        const tempFile = CACHE_FILE + '.tmp.' + Date.now(); // Unique temp file
        fs.writeFileSync(tempFile, JSON.stringify(geocodeCache, null, 2));
        fs.renameSync(tempFile, CACHE_FILE); // Atomic operation
        console.log(`Saved ${Object.keys(geocodeCache).length} geocode entries to cache`);
    } catch (error) {
        console.error('Error saving geocode cache:', error);
        // Try to clean up temp file if it exists
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
    }
}

// Batch save instead of saving after every request
let saveTimer = null;
function scheduleSave() {
    if (saveTimer) {
        clearTimeout(saveTimer);
    }
    // Save after 5 seconds of no new geocoding
    saveTimer = setTimeout(() => {
        saveCache();
        saveTimer = null;
    }, 5000);
}

app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // For parsing JSON bodies

app.get('/api/address-suggest', async (req, res) => {
    try {
        const searchString = req.query.searchString;
        
        if (!searchString) {
            return res.status(400).json({ error: 'searchString parameter is required' });
        }
        
        const url = `https://map.toronto.ca/cotgeocoder/rest/geocoder/suggest?f=json&addressOnly=0&retRowLimit=5&searchString=${encodeURIComponent(searchString)}`;
        
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        const suggestions = data.result?.rows?.map(row => ({
            keyString: row.KEYSTRING,
            address: row.ADDRESS
        })) || [];
        
        res.json({ suggestions });
    } catch (error) {
        console.error('Error fetching address suggestions:', error);
        res.status(500).json({ error: 'Failed to fetch address suggestions' });
    }
});

app.get('/api/geocode', async (req, res) => {
    try {
        const keyString = req.query.keyString;
        
        if (!keyString) {
            return res.status(400).json({ error: 'keyString parameter is required' });
        }
        
        const url = `https://map.toronto.ca/cotgeocoder/rest/geocoder/findAddressCandidates?f=json&keyString=${encodeURIComponent(keyString)}&retRowLimit=10`;
        
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        const candidates = data.result?.rows?.map(row => ({
            address: row.ADDRESS_FULL,
            location: {
                x: row.LONGITUDE,
                y: row.LATITUDE
            },
            score: row.SCORE
        })) || [];
        
        res.json({ candidates });
    } catch (error) {
        console.error('Error geocoding address:', error);
        res.status(500).json({ error: 'Failed to geocode address' });
    }
});

app.post('/api/search', async (req, res) => {
    try {
        const searchParams = new URLSearchParams(req.body);
        
        const response = await fetch('https://register.cpso.on.ca/Get-Search-Results/', {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': 'https://register.cpso.on.ca',
                'referer': 'https://register.cpso.on.ca/Search-Results/',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'x-requested-with': 'XMLHttpRequest'
            },
            body: searchParams.toString()
        });

        const html = await response.text();
        res.send(html);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to fetch doctor data' });
    }
});

// Geoapify API key - set this in environment variable GEOAPIFY_API_KEY
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || '';

app.get('/api/geocode-address', async (req, res) => {
    try {
        const address = req.query.address;
        
        if (!address) {
            return res.status(400).json({ error: 'address parameter is required' });
        }
        
        // Check cache first
        if (geocodeCache.hasOwnProperty(address)) {
            console.log('Cache hit for:', address, '- Result:', geocodeCache[address]);
            res.json(geocodeCache[address]);
            return;
        }
        
        console.log('Cache miss for:', address);
        
        // If we have Geoapify API key, use it for single geocoding
        if (GEOAPIFY_API_KEY) {
            const geoapifyUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&filter=countrycode:ca&apiKey=${GEOAPIFY_API_KEY}`;
            
            console.log('Using Geoapify geocoder for:', address);
            
            const geoapifyResponse = await fetch(geoapifyUrl);
            
            if (geoapifyResponse.ok) {
                const geoapifyData = await geoapifyResponse.json();
                
                if (geoapifyData.features && geoapifyData.features.length > 0) {
                    const coords = {
                        lat: geoapifyData.features[0].geometry.coordinates[1],
                        lng: geoapifyData.features[0].geometry.coordinates[0]
                    };
                    
                    console.log('Got coordinates from Geoapify:', coords);
                    
                    // Cache the result
                    geocodeCache[address] = coords;
                    scheduleSave();
                    
                    res.json(coords);
                    return;
                }
            }
        }
        
        // Fallback to OpenStreetMap
        // Add a small delay to respect rate limits (1 request per second)
        await new Promise(resolve => setTimeout(resolve, 1100));
        
        const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=ca`;
        
        console.log('Using OpenStreetMap geocoder for:', address);
        
        const osmResponse = await fetch(osmUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'TorontoDoctorFinder/1.0' // Required by Nominatim
            }
        });
        
        if (osmResponse.ok) {
            const osmData = await osmResponse.json();
            console.log('OpenStreetMap results count:', osmData.length);
            
            if (osmData.length > 0) {
                const result = osmData[0];
                const coords = {
                    lat: parseFloat(result.lat),
                    lng: parseFloat(result.lon)
                };
                
                console.log('Got coordinates from OpenStreetMap:', coords);
                
                // Cache the result
                geocodeCache[address] = coords;
                scheduleSave();
                
                res.json(coords);
                return;
            } else {
                console.log('OpenStreetMap returned no results');
            }
        } else {
            console.log('OpenStreetMap request failed with status:', osmResponse.status);
        }
        
        // If geocoding fails, DON'T cache null - just return it
        console.log('Could not geocode address - not caching null result');
        res.json(null);
        
    } catch (error) {
        console.error('Geocoding error:', error);
        res.json(null); // Return null instead of error to allow the app to continue
    }
});

// Batch geocode endpoint using Geoapify
app.post('/api/batch-geocode', async (req, res) => {
    try {
        const addresses = req.body.addresses;
        
        if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
            return res.status(400).json({ error: 'addresses array is required' });
        }
        
        if (!GEOAPIFY_API_KEY) {
            return res.status(500).json({ error: 'Geoapify API key not configured' });
        }
        
        console.log(`Starting batch geocoding for ${addresses.length} addresses`);
        
        // Filter out addresses that are already cached
        const uncachedAddresses = addresses.filter(addr => !geocodeCache.hasOwnProperty(addr));
        
        if (uncachedAddresses.length === 0) {
            console.log('All addresses already cached');
            const results = {};
            addresses.forEach(addr => {
                results[addr] = geocodeCache[addr];
            });
            return res.json({ results, cached: true });
        }
        
        console.log(`Need to geocode ${uncachedAddresses.length} uncached addresses`);
        
        // Geoapify batch accepts up to 1000 addresses at once
        const BATCH_SIZE = 1000; // Geoapify's max batch size
        const batches = [];
        for (let i = 0; i < uncachedAddresses.length; i += BATCH_SIZE) {
            batches.push(uncachedAddresses.slice(i, i + BATCH_SIZE));
        }
        
        console.log(`Processing ${uncachedAddresses.length} addresses in ${batches.length} batch(es)`);
        
        const allResults = {};
        
        for (const batch of batches) {
            console.log('Sample addresses from this batch:', batch.slice(0, 3));
            
            // Clean addresses before sending to Geoapify
            const cleanedAddresses = batch.map(addr => {
                // Clean up address for better geocoding
                let cleanAddr = addr;
                
                // Remove hospital/building names (text before first comma if it's not a suite/unit)
                cleanAddr = cleanAddr.replace(/^[^,0-9]+(Hospital|Centre|Center|Clinic|Medical)[^,]*,\s*/i, '');
                
                // Convert "Suite XXX, " to "XXX-" format at the beginning
                cleanAddr = cleanAddr.replace(/^(Suite|Unit|Apt|Room|Office)\s+([0-9A-Za-z]+)[,\s-]+/i, '$2-');
                
                // Convert ", Suite XXX" to proper format
                cleanAddr = cleanAddr.replace(/,\s*(Suite|Unit|Apt|Room|Office)\s+([0-9A-Za-z]+)/i, ', $1 $2');
                
                // Remove extra spaces in postal codes
                cleanAddr = cleanAddr.replace(/([A-Z]\d[A-Z])\s*(\d[A-Z]\d)/g, '$1 $2');
                
                // Remove multiple spaces
                cleanAddr = cleanAddr.replace(/\s+/g, ' ').trim();
                
                // Ensure addresses have Canada context for better geocoding
                if (!cleanAddr.toLowerCase().includes('canada')) {
                    cleanAddr = cleanAddr + ', Canada';
                }
                
                console.log(`Cleaned: "${addr}" -> "${cleanAddr}"`);
                return cleanAddr;
            });
            
            // Submit batch job
            const jobResponse = await fetch(`https://api.geoapify.com/v1/batch/geocode/search?apiKey=${GEOAPIFY_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(cleanedAddresses)
            });
            
            if (!jobResponse.ok) {
                console.error('Failed to submit batch job:', jobResponse.status);
                continue;
            }
            
            const jobData = await jobResponse.json();
            const jobId = jobData.id;
            const jobUrl = jobData.url;
            
            console.log('Batch job submitted, ID:', jobId);
            console.log(`Processing batch of ${batch.length} addresses`);
            
            // Poll for job completion
            let jobComplete = false;
            let attempts = 0;
            const maxAttempts = 60; // Max 1 minute of polling
            
            while (!jobComplete && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                
                const statusResponse = await fetch(jobUrl);
                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    
                    if (statusData.status === 'completed') {
                        jobComplete = true;
                        
                        // Get results
                        const resultsResponse = await fetch(`https://api.geoapify.com/v1/batch/geocode/search?id=${jobId}&apiKey=${GEOAPIFY_API_KEY}`);
                        
                        if (resultsResponse.ok) {
                            const resultsData = await resultsResponse.json();
                            
                            console.log(`Got ${resultsData.length} results from Geoapify for batch of ${batch.length} addresses`);
                            
                            if (resultsData.length !== batch.length) {
                                console.log(`WARNING: Geoapify returned ${resultsData.length} results but we sent ${batch.length} addresses!`);
                            }
                            
                            // Process results
                            resultsData.forEach((result, index) => {
                                const originalAddress = batch[index]; // Use original address as key
                                
                                if (result && result.features && result.features.length > 0) {
                                    const coords = {
                                        lat: result.features[0].geometry.coordinates[1],
                                        lng: result.features[0].geometry.coordinates[0]
                                    };
                                    
                                    geocodeCache[originalAddress] = coords;
                                    allResults[originalAddress] = coords;
                                    console.log(`Geocoded: ${originalAddress} -> ${coords.lat}, ${coords.lng}`);
                                } else {
                                    // Don't cache null results
                                    allResults[originalAddress] = null;
                                    const cleanedAddr = cleanedAddresses[index];
                                    console.log(`Failed to geocode: "${originalAddress}" (sent as: "${cleanedAddr}")`);
                                    if (result) {
                                        console.log(`  Geoapify returned:`, JSON.stringify(result).substring(0, 200));
                                    }
                                }
                            });
                        }
                    } else if (statusData.status === 'failed') {
                        console.error('Batch job failed');
                        break;
                    }
                }
                
                attempts++;
            }
            
            if (!jobComplete) {
                console.error('Batch job timed out');
            }
        }
        
        // Add cached results
        addresses.forEach(addr => {
            if (geocodeCache.hasOwnProperty(addr)) {
                allResults[addr] = geocodeCache[addr];
            }
        });
        
        // Save cache
        scheduleSave();
        
        const successCount = Object.keys(allResults).filter(k => allResults[k] !== null).length;
        const failCount = Object.keys(allResults).filter(k => allResults[k] === null).length;
        console.log(`Batch geocoding complete. Success: ${successCount}, Failed: ${failCount} out of ${uncachedAddresses.length} total`);
        
        res.json({ results: allResults });
        
    } catch (error) {
        console.error('Batch geocoding error:', error);
        res.status(500).json({ error: 'Batch geocoding failed' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open your browser and navigate to the URL above to use the Toronto Doctor Finder');
});

// Save cache on graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    if (saveTimer) {
        clearTimeout(saveTimer);
    }
    saveCache();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    if (saveTimer) {
        clearTimeout(saveTimer);
    }
    saveCache();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});