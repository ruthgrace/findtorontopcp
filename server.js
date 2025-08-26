const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();
const db = require('./database');
const { GOOGLE_MAPS_API_KEY } = require('./constants');

const app = express();
const PORT = process.env.PORT || 3002;

// Initialize database and load geocode cache
let geocodeCache = {};
let dbInitialized = false;

// Initialize database on startup
(async () => {
    try {
        await db.initDatabase();
        dbInitialized = true;
        
        // Load all existing geocoding into memory cache for fast access
        geocodeCache = await db.getAllGeocodedAddresses();
        console.log(`Loaded ${Object.keys(geocodeCache).length} geocoded addresses from database`);
        
        // Get and display database stats
        const stats = await db.getDatabaseStats();
        console.log('Database statistics:', stats);
    } catch (error) {
        console.error('Failed to initialize database:', error);
        // Fall back to in-memory cache only
        geocodeCache = {};
    }
})();

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

// New endpoint to save doctor data to database
app.post('/api/save-doctors', async (req, res) => {
    try {
        const doctors = req.body.doctors;
        
        if (!doctors || !Array.isArray(doctors)) {
            return res.status(400).json({ error: 'doctors array is required' });
        }
        
        if (!dbInitialized) {
            return res.status(503).json({ error: 'Database not initialized' });
        }
        
        await db.saveDoctorsBatch(doctors);
        
        res.json({ success: true, count: doctors.length });
    } catch (error) {
        console.error('Error saving doctors:', error);
        res.status(500).json({ error: 'Failed to save doctors' });
    }
});

// New endpoint to get database statistics
app.get('/api/stats', async (req, res) => {
    try {
        if (!dbInitialized) {
            return res.status(503).json({ error: 'Database not initialized' });
        }
        
        const stats = await db.getDatabaseStats();
        res.json(stats);
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Google Maps API key is loaded from constants.js

app.get('/api/geocode-address', async (req, res) => {
    try {
        const address = req.query.address;
        
        if (!address) {
            return res.status(400).json({ error: 'address parameter is required' });
        }
        
        // Check in-memory cache first
        if (geocodeCache.hasOwnProperty(address)) {
            console.log('Cache hit for:', address, '- Result:', geocodeCache[address]);
            res.json(geocodeCache[address]);
            return;
        }
        
        // Check database if not in memory cache
        if (dbInitialized) {
            const dbCoords = await db.getGeocoding(address);
            if (dbCoords) {
                console.log('Database hit for:', address, '- Result:', dbCoords);
                geocodeCache[address] = dbCoords; // Add to memory cache
                res.json(dbCoords);
                return;
            }
        }
        
        console.log('Cache miss for:', address);
        
        // Use Google Maps Geocoding API
        if (GOOGLE_MAPS_API_KEY) {
            const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=ca&key=${GOOGLE_MAPS_API_KEY}`;
            
            console.log('Using Google Maps geocoder for:', address);
            
            const googleResponse = await fetch(googleUrl);
            
            if (googleResponse.ok) {
                const googleData = await googleResponse.json();
                
                if (googleData.status === 'OK' && googleData.results && googleData.results.length > 0) {
                    const location = googleData.results[0].geometry.location;
                    const coords = {
                        lat: location.lat,
                        lng: location.lng
                    };
                    
                    console.log('Got coordinates from Google Maps:', coords);
                    
                    // Cache the result in memory and database
                    geocodeCache[address] = coords;
                    if (dbInitialized) {
                        db.saveGeocoding(address, coords.lat, coords.lng, 'google').catch(err => {
                            console.error('Error saving to database:', err);
                        });
                    }
                    
                    res.json(coords);
                    return;
                } else if (googleData.status === 'ZERO_RESULTS') {
                    console.log('Google Maps returned no results for:', address);
                } else if (googleData.status === 'OVER_QUERY_LIMIT') {
                    console.error('Google Maps API quota exceeded');
                } else {
                    console.log('Google Maps API status:', googleData.status);
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
                
                // Cache the result in memory and database
                geocodeCache[address] = coords;
                if (dbInitialized) {
                    db.saveGeocoding(address, coords.lat, coords.lng, 'openstreetmap').catch(err => {
                        console.error('Error saving to database:', err);
                    });
                }
                
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


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open your browser and navigate to the URL above to use the Toronto Doctor Finder');
});

// Save cache on graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    
    if (dbInitialized) {
        await db.closeDatabase();
    }
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down server...');
    
    if (dbInitialized) {
        await db.closeDatabase();
    }
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});