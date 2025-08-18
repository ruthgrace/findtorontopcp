const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

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

app.get('/api/geocode-address', async (req, res) => {
    try {
        const address = req.query.address;
        
        if (!address) {
            return res.status(400).json({ error: 'address parameter is required' });
        }
        
        // Check cache first
        if (geocodeCache[address]) {
            console.log('Cache hit for:', address);
            res.json(geocodeCache[address]);
            return;
        }
        
        // First try to get suggestions from Toronto geocoder
        const suggestUrl = `https://map.toronto.ca/cotgeocoder/rest/geocoder/suggest?f=json&addressOnly=0&retRowLimit=1&searchString=${encodeURIComponent(address)}`;
        
        const suggestResponse = await fetch(suggestUrl, {
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Content-Type': 'application/json',
            }
        });
        
        if (!suggestResponse.ok) {
            throw new Error(`HTTP error! status: ${suggestResponse.status}`);
        }
        
        const suggestData = await suggestResponse.json();
        
        if (suggestData.result?.rows?.length > 0) {
            const keyString = suggestData.result.rows[0].KEYSTRING;
            
            // Now get the actual coordinates
            const geocodeUrl = `https://map.toronto.ca/cotgeocoder/rest/geocoder/findAddressCandidates?f=json&keyString=${encodeURIComponent(keyString)}&retRowLimit=1`;
            
            const geocodeResponse = await fetch(geocodeUrl, {
                headers: {
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Content-Type': 'application/json',
                }
            });
            
            if (geocodeResponse.ok) {
                const geocodeData = await geocodeResponse.json();
                
                if (geocodeData.result?.rows?.length > 0) {
                    const location = geocodeData.result.rows[0];
                    const coords = {
                        lat: location.LATITUDE,
                        lng: location.LONGITUDE
                    };
                    
                    // Cache the result
                    geocodeCache[address] = coords;
                    scheduleSave();
                    
                    res.json(coords);
                    return;
                }
            }
        }
        
        // If Toronto geocoder doesn't work, cache and return null
        geocodeCache[address] = null;
        scheduleSave();
        res.json(null);
        
    } catch (error) {
        console.error('Geocoding error:', error);
        res.json(null); // Return null instead of error to allow the app to continue
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