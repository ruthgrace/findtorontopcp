const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();
const db = require('./database');
const { GOOGLE_MAPS_API_KEY } = require('./constants');
const ParallelCPSOSearcher = require('./parallel-cpso-search');
const ParallelGeocoder = require('./parallel-geocoder');
const { fetchGenderFromCPSO } = require('./gender-fetcher');

const app = express();
const PORT = process.env.PORT || 3002;

// Initialize database and load geocode cache
let geocodeCache = {};
let dbInitialized = false;
let parallelGeocoder = null;

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
        
        // Initialize parallel geocoder
        parallelGeocoder = new ParallelGeocoder({
            apiKey: GOOGLE_MAPS_API_KEY,
            concurrency: 20, // 20 parallel requests (well under 50/sec limit)
            cache: geocodeCache,
            dbSaveFunction: db.saveGeocoding.bind(db)
        });
        console.log('Parallel geocoder initialized with concurrency:', 20);
    } catch (error) {
        console.error('Failed to initialize database:', error);
        // Fall back to in-memory cache only
        geocodeCache = {};
        
        // Still initialize geocoder without database
        parallelGeocoder = new ParallelGeocoder({
            apiKey: GOOGLE_MAPS_API_KEY,
            concurrency: 20,
            cache: geocodeCache
        });
    }
})();

app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' })); // For parsing JSON bodies

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
        
        // Cache the top candidate (user selected address) in database
        if (candidates.length > 0 && candidates[0].location) {
            const topCandidate = candidates[0];
            const coords = {
                lat: topCandidate.location.y,
                lng: topCandidate.location.x
            };
            
            // Save to memory cache
            geocodeCache[topCandidate.address] = coords;
            
            // Save to database
            if (dbInitialized) {
                db.saveGeocoding(topCandidate.address, coords.lat, coords.lng, 'toronto-geocoder').catch(err => {
                    console.error('Error saving user address to database:', err);
                });
                console.log('Cached user search address:', topCandidate.address);
            }
        }
        
        res.json({ candidates });
    } catch (error) {
        console.error('Error geocoding address:', error);
        res.status(500).json({ error: 'Failed to geocode address' });
    }
});

// Smart search endpoint that handles >100 results by expanding postal codes
app.post('/api/smart-search', async (req, res) => {
    try {
        const { postalCode, doctorType, specialistType, language } = req.body;
        console.log('Smart search for:', postalCode, 'Type:', doctorType, 'Specialist:', specialistType);
        
        const allDoctors = [];
        const postalCodesToSearch = [postalCode];
        const searchedCodes = new Set();
        
        while (postalCodesToSearch.length > 0) {
            const code = postalCodesToSearch.shift();
            
            if (searchedCodes.has(code)) continue;
            searchedCodes.add(code);
            
            const searchParams = new URLSearchParams();
            searchParams.append('postalCode', code);
            searchParams.append('doctorType', doctorType || 'Any');
            if (specialistType) {
                searchParams.append('SpecialistType', specialistType);
            }
            searchParams.append('LanguagesSelected', language || 'ENGLISH');
            
            console.log(`  Searching: ${code}`);
            
            const response = await fetch('https://register.cpso.on.ca/Get-Search-Results/', {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'x-requested-with': 'XMLHttpRequest'
                },
                body: searchParams.toString()
            });
            
            const data = await response.json();
            
            if (data.totalcount === -1) {
                // Too many results, expand the postal code
                console.log(`    Too many results for ${code}, expanding...`);
                const expanded = expandPostalCode(code);
                postalCodesToSearch.push(...expanded);
            } else if (data.totalcount > 0) {
                console.log(`    Found ${data.totalcount} doctors in ${code}`);
                allDoctors.push(...data.results);
            }
        }
        
        res.json({ totalcount: allDoctors.length, results: allDoctors });
    } catch (error) {
        console.error('Smart search error:', error);
        res.status(500).json({ error: 'Smart search failed' });
    }
});

// New parallel search endpoint for multiple postal codes
app.post('/api/parallel-search', async (req, res) => {
    try {
        const { postalCodes, doctorType, specialistType, language } = req.body;
        console.log(`Hybrid search for ${postalCodes.length} postal codes, Type: ${doctorType}, Specialist: ${specialistType}`);
        
        const startTime = Date.now();
        
        // Step 1: Always get fresh data from CPSO (definitive doctor list)
        console.log('Fetching fresh data from CPSO...');
        const searcher = new ParallelCPSOSearcher({
            concurrency: 20,
            delayBetweenBatches: 0,
            retryAttempts: 3,
            retryDelay: 1000
        });
        
        const cpsoDoctors = await searcher.smartSearchWithParallel(
            postalCodes,
            doctorType || 'Any',
            specialistType,
            language || 'ENGLISH'
        );
        
        console.log(`Found ${cpsoDoctors.length} doctors from CPSO`);
        
        // Step 2: Get existing doctors from database for gender data
        // Extract CPSO numbers from the CPSO API results
        const cpsoNumbers = cpsoDoctors.map(d => d.cpsonumber || d.cpsoNumber).filter(n => n);
        const existingDoctors = await db.getDoctorsByCpsoNumbers(cpsoNumbers);
        console.log(`Found ${existingDoctors.length} doctors in database`);
        
        // Step 3: Create lookup map for existing database doctors (by CPSO number)
        const databaseMap = new Map();
        existingDoctors.forEach(doctor => {
            if (doctor.cpsoNumber) {
                databaseMap.set(doctor.cpsoNumber, doctor);
            }
        });
        
        // Step 4: Enhance CPSO doctors with database data (especially gender)
        const finalDoctors = cpsoDoctors.map(cpsoDoctor => {
            const cpsoNumber = cpsoDoctor.cpsonumber || cpsoDoctor.cpsoNumber;
            const existingDoctor = databaseMap.get(cpsoNumber);
            
            // If we have this doctor in database, use their gender data
            if (existingDoctor) {
                return {
                    ...cpsoDoctor,
                    gender: existingDoctor.gender // Add gender from database
                };
            }
            
            // New doctor, no gender data yet
            return cpsoDoctor;
        });
        
        // Step 5: Save/update all doctors to database (with gender data preserved)
        console.log(`Saving ${finalDoctors.length} doctors to database...`);
        await db.saveDoctorsBatch(finalDoctors);
        
        const duration = Date.now() - startTime;
        const doctorsWithGender = finalDoctors.filter(d => d.gender && d.gender !== null).length;
        
        console.log(`Search completed in ${duration}ms:`);
        console.log(`  - ${cpsoDoctors.length} doctors from CPSO (definitive list)`);
        console.log(`  - ${doctorsWithGender} doctors have gender data from database`);
        console.log(`  - ${finalDoctors.length - doctorsWithGender} doctors need gender fetching`);
        
        const response = { 
            totalcount: finalDoctors.length, 
            results: finalDoctors,
            searchTime: duration,
            withGender: doctorsWithGender,
            needsGender: finalDoctors.length - doctorsWithGender
        };
        
        const responseSize = JSON.stringify(response).length;
        console.log(`Sending response: ${responseSize} bytes, ${finalDoctors.length} doctors`);
        
        res.json(response);
    } catch (error) {
        console.error('Parallel search error:', error);
        res.status(500).json({ error: 'Parallel search failed' });
    }
});

// Helper function to expand postal codes
function expandPostalCode(code) {
    const expanded = [];
    const cleanCode = code.replace(/\s+/g, '');
    
    if (cleanCode.length === 3) {
        // Add 4th digit (0-9)
        for (let i = 0; i <= 9; i++) {
            expanded.push(`${cleanCode} ${i}`);
        }
    } else if (cleanCode.length === 4) {
        // Add 5th letter (skip D,F,I,O,Q,U per Canadian postal code rules)
        const letters = 'ABCEGHJKLMNPRSTVWXYZ';
        for (const letter of letters) {
            expanded.push(`${cleanCode.slice(0, 3)} ${cleanCode[3]}${letter}`);
        }
    } else if (cleanCode.length === 5) {
        // Add 6th digit (0-9)
        for (let i = 0; i <= 9; i++) {
            expanded.push(`${cleanCode.slice(0, 3)} ${cleanCode.slice(3)}${i}`);
        }
    }
    
    return expanded;
}

app.post('/api/search', async (req, res) => {
    try {
        const searchParams = new URLSearchParams(req.body);
        console.log('CPSO API Request:', searchParams.toString());
        
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
        console.log('CPSO API Response status:', response.status);
        console.log('CPSO API Response length:', html.length);
        console.log('CPSO API Response sample:', html.substring(0, 500));
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

// Gender API endpoint
app.get('/api/doctor-gender/:cpsoNumber', async (req, res) => {
    try {
        const { cpsoNumber } = req.params;
        
        if (!cpsoNumber) {
            return res.status(400).json({ error: 'CPSO number is required' });
        }
        
        console.log(`Fetching gender for CPSO #${cpsoNumber}`);
        
        // Fetch gender from CPSO website
        const gender = await fetchGenderFromCPSO(cpsoNumber);
        
        // Save to database if we got a valid result
        if (gender && !gender.startsWith('Unknown')) {
            try {
                await db.updateDoctorGender(cpsoNumber, gender);
                console.log(`Updated gender for CPSO #${cpsoNumber}: ${gender}`);
            } catch (dbError) {
                console.error(`Error updating database for CPSO #${cpsoNumber}:`, dbError);
                // Don't fail the request if database update fails
            }
        }
        
        res.json({ cpsoNumber, gender });
        
    } catch (error) {
        console.error('Error fetching gender:', error);
        res.status(500).json({ error: 'Failed to fetch gender data' });
    }
});

// Batch gender endpoint for better parallelization
app.post('/api/doctors-gender', async (req, res) => {
    try {
        const { cpsoNumbers } = req.body;
        
        if (!cpsoNumbers || !Array.isArray(cpsoNumbers) || cpsoNumbers.length === 0) {
            return res.status(400).json({ error: 'cpsoNumbers array is required' });
        }
        
        if (cpsoNumbers.length > 10) {
            return res.status(400).json({ error: 'Maximum 10 CPSO numbers per batch' });
        }
        
        console.log(`Batch fetching gender for ${cpsoNumbers.length} doctors`);
        
        // Process with controlled concurrency and backoff
        const results = [];
        const BATCH_SIZE = 10; // Increased parallelism for faster processing
        
        for (let i = 0; i < cpsoNumbers.length; i += BATCH_SIZE) {
            const batch = cpsoNumbers.slice(i, i + BATCH_SIZE);
            
            const batchResults = await Promise.allSettled(
                batch.map(async (cpsoNumber) => {
                    try {
                        const gender = await fetchGenderFromCPSO(cpsoNumber);
                        
                        // Save to database if valid
                        if (gender && !gender.startsWith('Unknown')) {
                            try {
                                await db.updateDoctorGender(cpsoNumber, gender);
                            } catch (dbError) {
                                console.error(`DB error for CPSO #${cpsoNumber}:`, dbError);
                            }
                        }
                        
                        return { cpsoNumber, gender, success: true };
                    } catch (error) {
                        console.error(`Error fetching gender for CPSO #${cpsoNumber}:`, error);
                        return { cpsoNumber, gender: 'Unknown - Fetch error', success: false };
                    }
                })
            );
            
            // Collect results
            batchResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    results.push({ 
                        cpsoNumber: 'unknown', 
                        gender: 'Unknown - Processing error', 
                        success: false 
                    });
                }
            });
            
            // Small delay between batches
            if (i + BATCH_SIZE < cpsoNumbers.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        console.log(`Batch gender fetch complete: ${results.length} processed`);
        res.json({ results, totalProcessed: results.length });
        
    } catch (error) {
        console.error('Error in batch gender fetch:', error);
        res.status(500).json({ error: 'Failed to fetch batch gender data' });
    }
});

// Google Maps API key is loaded from constants.js

// New batch geocoding endpoint with parallel processing
app.post('/api/geocode-batch', async (req, res) => {
    try {
        const { addresses } = req.body;
        
        if (!addresses || !Array.isArray(addresses)) {
            return res.status(400).json({ error: 'addresses array is required' });
        }
        
        if (!parallelGeocoder) {
            return res.status(503).json({ error: 'Geocoding service not initialized' });
        }
        
        console.log(`Batch geocoding request for ${addresses.length} addresses`);
        const startTime = Date.now();
        
        const results = await parallelGeocoder.geocodeBatch(addresses);
        
        const duration = Date.now() - startTime;
        const successCount = Object.values(results).filter(coords => coords !== null).length;
        
        console.log(`Batch geocoding completed in ${duration}ms. Success: ${successCount}/${addresses.length}`);
        
        res.json({
            results,
            stats: {
                total: addresses.length,
                success: successCount,
                failed: addresses.length - successCount,
                duration
            }
        });
    } catch (error) {
        console.error('Batch geocoding error:', error);
        res.status(500).json({ error: 'Batch geocoding failed' });
    }
});

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
                
                // Log the full response when it's not OK to help debug
                if (googleData.status !== 'OK') {
                    console.log('Google Maps API full response:', JSON.stringify(googleData, null, 2));
                }
                
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
        
        // If Google Maps geocoding fails, just return null immediately
        // No OpenStreetMap fallback - we're okay with missing data
        console.log('Could not geocode address with Google Maps - returning null');
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