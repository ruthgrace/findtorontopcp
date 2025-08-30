let allDoctors = [];
let userCoordinates = null;
let lastSearchCoordinates = null; // Track last search location
let addressSearchTimeout = null;
let selectedSuggestionIndex = -1;
let torontoPostalCodes = [];
let postalCodeBoundaries = null;
let fsaBoundaries = null;
let geocodeCache = {}; // Cache for geocoding results

document.addEventListener('DOMContentLoaded', function() {
    const searchForm = document.getElementById('searchForm');
    const addressSearchInput = document.getElementById('addressSearch');
    const addressSuggestionsDiv = document.getElementById('addressSuggestions');
    const filtersSection = document.getElementById('filtersSection');
    const resultsContainer = document.getElementById('resultsContainer');
    const loadingSpinner = document.getElementById('loadingSpinner');
    
    // Load GTA postal codes and boundaries
    loadGTAPostalCodes();
    loadFSABoundaries();
    
    searchForm.addEventListener('submit', handleSearch);
    
    // Update postal codes when radius changes
    document.getElementById('maxDistance').addEventListener('input', function() {
        if (userCoordinates) {
            const radiusKm = parseFloat(this.value) || 5;
            const postalCodesInRadius = findPostalCodesWithinRadius(userCoordinates.lat, userCoordinates.lng, radiusKm);
            displayPostalCodes(postalCodesInRadius);
        }
    });
    
    // Address search functionality
    addressSearchInput.addEventListener('input', function() {
        const query = this.value.trim();
        
        if (addressSearchTimeout) {
            clearTimeout(addressSearchTimeout);
        }
        
        if (query.length < 3) {
            hideSuggestions();
            // Clear coordinates if address is cleared
            if (query.length === 0) {
                document.getElementById('selectedLat').value = '';
                document.getElementById('selectedLng').value = '';
                userCoordinates = null;
            }
            return;
        }
        
        addressSearchTimeout = setTimeout(() => {
            fetchAddressSuggestions(query);
        }, 300);
    });
    
    addressSearchInput.addEventListener('keydown', function(e) {
        const suggestions = addressSuggestionsDiv.querySelectorAll('.address-suggestion-item');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestions.length - 1);
            highlightSuggestion(suggestions);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
            highlightSuggestion(suggestions);
        } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
            e.preventDefault();
            suggestions[selectedSuggestionIndex].click();
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });
    
    // Click outside to close suggestions
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.address-search-container')) {
            hideSuggestions();
        }
    });
    
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            sortResults(this.dataset.sort);
        });
    });
    
    // Gender filter functionality
    const genderFilter = document.getElementById('genderFilter');
    if (genderFilter) {
        genderFilter.addEventListener('change', function() {
            filterAndDisplayResults();
        });
    }
});

async function fetchAddressSuggestions(query) {
    try {
        const response = await fetch(`/api/address-suggest?searchString=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.suggestions && data.suggestions.length > 0) {
            displaySuggestions(data.suggestions);
        } else {
            displayNoMatchesWarning();
        }
    } catch (error) {
        console.error('Error fetching address suggestions:', error);
        hideSuggestions();
    }
}

function displaySuggestions(suggestions) {
    const suggestionsDiv = document.getElementById('addressSuggestions');
    suggestionsDiv.innerHTML = '';
    selectedSuggestionIndex = -1;
    
    suggestions.forEach((suggestion, index) => {
        const div = document.createElement('div');
        div.className = 'address-suggestion-item';
        div.textContent = suggestion.address;
        div.dataset.keyString = suggestion.keyString;
        
        div.addEventListener('click', async function() {
            await selectAddress(suggestion);
        });
        
        suggestionsDiv.appendChild(div);
    });
    
    suggestionsDiv.classList.add('active');
}

function highlightSuggestion(suggestions) {
    suggestions.forEach((item, index) => {
        if (index === selectedSuggestionIndex) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function hideSuggestions() {
    const suggestionsDiv = document.getElementById('addressSuggestions');
    suggestionsDiv.classList.remove('active');
    suggestionsDiv.innerHTML = '';
    selectedSuggestionIndex = -1;
}

function displayNoMatchesWarning() {
    const suggestionsDiv = document.getElementById('addressSuggestions');
    suggestionsDiv.innerHTML = '<div class="no-matches-warning">No matching address found. Type the beginning of an address to see address suggestions.</div>';
    suggestionsDiv.classList.add('active');
    selectedSuggestionIndex = -1;
}

async function selectAddress(suggestion) {
    const addressSearchInput = document.getElementById('addressSearch');
    const selectedLatInput = document.getElementById('selectedLat');
    const selectedLngInput = document.getElementById('selectedLng');
    const maxDistanceInput = document.getElementById('maxDistance');
    
    addressSearchInput.value = suggestion.address;
    hideSuggestions();
    
    // Check if this address is already cached
    if (geocodeCache[suggestion.address]) {
        console.log('Using cached coordinates for user address:', suggestion.address);
        const cachedCoords = geocodeCache[suggestion.address];
        selectedLatInput.value = cachedCoords.lat;
        selectedLngInput.value = cachedCoords.lng;
        userCoordinates = { lat: cachedCoords.lat, lng: cachedCoords.lng };
        
        // Find and display postal codes within radius
        const radiusKm = parseFloat(maxDistanceInput.value) || 5;
        const postalCodesInRadius = findPostalCodesWithinRadius(userCoordinates.lat, userCoordinates.lng, radiusKm);
        displayPostalCodes(postalCodesInRadius);
        return;
    }
    
    try {
        const response = await fetch(`/api/geocode?keyString=${encodeURIComponent(suggestion.keyString)}`);
        const data = await response.json();
        
        if (data.candidates && data.candidates.length > 0) {
            const location = data.candidates[0].location;
            selectedLatInput.value = location.y;
            selectedLngInput.value = location.x;
            userCoordinates = { lat: location.y, lng: location.x };
            
            // Cache the user address coordinates
            geocodeCache[suggestion.address] = { lat: location.y, lng: location.x };
            console.log('Cached user address:', suggestion.address);
            
            // Find and display postal codes within radius
            const radiusKm = parseFloat(maxDistanceInput.value) || 5;
            const postalCodesInRadius = findPostalCodesWithinRadius(location.y, location.x, radiusKm);
            displayPostalCodes(postalCodesInRadius);
        }
    } catch (error) {
        console.error('Error geocoding address:', error);
    }
}

async function handleSearch(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const doctorTypeRaw = formData.get('doctorType');
    const language = formData.get('language');
    const maxDistance = parseFloat(formData.get('maxDistance'));
    
    // Parse the doctor type selection
    let doctorType = 'Any';
    let specialistType = null;
    if (doctorTypeRaw.startsWith('Specialist:')) {
        doctorType = 'Specialist';
        specialistType = doctorTypeRaw.substring('Specialist:'.length);
    } else {
        doctorType = doctorTypeRaw;
    }
    const selectedLat = formData.get('selectedLat');
    const selectedLng = formData.get('selectedLng');
    
    // Check if coordinates are available from address search or current location
    if (selectedLat && selectedLng) {
        userCoordinates = { lat: parseFloat(selectedLat), lng: parseFloat(selectedLng) };
    }
    
    if (!userCoordinates) {
        displayError('Please select an address.');
        return;
    }
    
    // Check if searching from a different location than last time
    if (lastSearchCoordinates && 
        (lastSearchCoordinates.lat !== userCoordinates.lat || 
         lastSearchCoordinates.lng !== userCoordinates.lng)) {
        console.log('Different address detected, clearing previous results');
        // Clear previous results
        allDoctors = [];
        displayResults([]);
    }
    
    // Store current search coordinates
    lastSearchCoordinates = { lat: userCoordinates.lat, lng: userCoordinates.lng };
    
    showLoading(true);
    
    try {
        // Find postal codes within radius
        const postalCodesInRadius = findPostalCodesWithinRadius(userCoordinates.lat, userCoordinates.lng, maxDistance);
        
        console.log(`Searching for doctors in ${postalCodesInRadius.length} postal codes using parallel search...`);
        
        // Use the new parallel search endpoint
        const postalCodesToSearch = postalCodesInRadius.map(pc => pc.code);
        
        const parallelResponse = await fetch('/api/parallel-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                postalCodes: postalCodesToSearch,
                doctorType: doctorType,
                specialistType: specialistType,
                language: language
            })
        });
        
        if (!parallelResponse.ok) {
            throw new Error(`Parallel search failed: ${parallelResponse.status}`);
        }
        
        const parallelData = await parallelResponse.json();
        const allDoctorsResults = parallelData.results || [];
        
        console.log(`Parallel search completed in ${parallelData.searchTime}ms, found ${allDoctorsResults.length} doctors`);
        
        // Debug: Check sample of results
        console.log('Sample doctors from parallel search:', allDoctorsResults.slice(0, 3));
        
        // Debug: Check address fields
        const addressSample = allDoctorsResults.slice(0, 10).map(d => ({
            name: d.name,
            address: d.address,
            addressType: typeof d.address,
            addressLength: d.address ? d.address.length : 0
        }));
        console.log('Address field analysis:', addressSample);
        
        if (allDoctorsResults.length === 0) {
            const typeMessage = specialistType ? specialistType : (doctorType === 'Family Doctor' ? 'family doctors' : 'doctors');
            displayError(`No ${typeMessage} found in the selected postal codes.`);
            showLoading(false);
            return;
        }
        
        // Save ALL doctors to database (async, don't wait)
        if (allDoctorsResults.length > 0) {
            saveDoctorsToDatabase(allDoctorsResults);
        }
        
        // Use batch geocoding for all doctors
        console.log('Starting geocoding and distance calculation...');
        const enrichedDoctors = await enrichDoctorsWithDistance(allDoctorsResults, userCoordinates, maxDistance);
        console.log(`Geocoding complete, ${enrichedDoctors.length} doctors within range`);
        
        // enrichDoctorsWithDistance already filters by distance, so just use the results
        // Transform the data to match what displayResults expects
        const doctorsWithDistance = enrichedDoctors.map(doc => ({
            name: doc.name || 'Unknown',
            specialty: doc.specialties || 'General Practice',  // Map specialties to specialty
            address: doc.address || '',
            phone: doc.phonenumber || '',  // Map phonenumber to phone
            status: doc.registrationstatus || 'Active',
            cpsoNumber: doc.cpsonumber || '',
            gender: doc.gender,  // Include gender data from API
            distance: doc.distance,
            coordinates: doc.coordinates,
            searchPostalCode: doc.searchPostalCode
        }));
        
        console.log(`${doctorsWithDistance.length} doctors within ${maxDistance}km`);
        
        // Debug: Log first few doctors with distances
        console.log('First 3 doctors with distances:', 
            doctorsWithDistance.slice(0, 3).map(d => ({
                name: d.name,
                distance: d.distance,
                address: d.address
            }))
        );
        
        allDoctors = doctorsWithDistance;
        displayResults(doctorsWithDistance);
        
        // Update the gender filter and start background gender fetching
        updateGenderFilter(allDoctors);
        
        // Start background gender enhancement after a short delay
        setTimeout(() => {
            startGenderEnhancement();
        }, 500);
        
        if (doctorsWithDistance.length > 0) {
            document.getElementById('filtersSection').style.display = 'block';
        }
        
        // Don't display postal codes anymore since we have the actual doctors
        // displayPostalCodes(postalCodesInRadius);
        
    } catch (error) {
        console.error('Search error:', error);
        displayError('Failed to search for doctors. Please try again.');
    } finally {
        showLoading(false);
    }
}

function parseJSONResults(data) {
    const doctors = [];
    
    console.log('Parsing JSON response, total count:', data.totalcount);
    
    if (data.results && Array.isArray(data.results)) {
        // Log the first result to see available fields
        if (data.results.length > 0) {
            console.log('Sample doctor data:', data.results[0]);
            console.log('Phone number field:', data.results[0].phonenumber);
        }
        
        data.results.forEach(result => {
            // Debug log to see what fields we're getting
            if (doctors.length === 0) {
                console.log('First result from server:', result);
                console.log('Specialties field:', result.specialties);
                console.log('Phone field:', result.phonenumber);
            }
            
            const doctor = {
                name: result.name || 'Unknown',
                specialty: result.specialties || 'General Practice',
                address: [
                    result.street1,
                    result.street2,
                    result.city,
                    result.province,
                    result.postalcode
                ].filter(Boolean).join(', '),
                phone: result.phonenumber || '',
                status: result.status || 'Active',
                cpsoNumber: result.cpsonumber || ''
            };
            
            if (doctor.address && doctor.address.length > 5) {
                doctors.push(doctor);
            }
        });
    }
    
    console.log(`Parsed ${doctors.length} doctors from JSON`);
    return doctors;
}

function parseSearchResults(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const doctors = [];
    
    console.log('Parsing HTML response, length:', html.length);
    
    const doctorElements = doc.querySelectorAll('.doctor-result');
    console.log('Found doctor elements:', doctorElements.length);
    
    doctorElements.forEach(elem => {
        const doctor = {
            name: elem.querySelector('.doctor-name')?.textContent?.trim() || 'Unknown',
            specialty: elem.querySelector('.specialty')?.textContent?.trim() || 'General Practice',
            address: elem.querySelector('.address')?.textContent?.trim() || '',
            phone: elem.querySelector('.phone')?.textContent?.trim() || '',
            status: elem.querySelector('.status')?.textContent?.trim() || 'Active',
            cpsoNumber: elem.querySelector('.cpso-number')?.textContent?.trim() || '',
        };
        
        if (doctor.address) {
            doctors.push(doctor);
        }
    });
    
    if (doctors.length === 0) {
        console.error('No doctors found in CPSO response. HTML may have changed format.');
        console.log('First 500 chars of response:', html.substring(0, 500));
    }
    
    return doctors;
}

async function getCoordinatesFromPostalCode(postalCode) {
    try {
        const response = await fetch(`https://geocode.maps.co/search?q=${encodeURIComponent(postalCode + ', Toronto, Ontario, Canada')}`);
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
    } catch (error) {
        console.error('Geocoding error:', error);
    }
    return null;
}

async function getCoordinatesFromAddress(address) {
    // Check cache first
    if (geocodeCache[address]) {
        console.log('Using cached coordinates for:', address);
        return geocodeCache[address];
    }
    
    try {
        // Use our server endpoint to avoid CORS issues
        const response = await fetch(`/api/geocode-address?address=${encodeURIComponent(address)}`);
        const data = await response.json();
        
        // Cache the result (including null results to avoid re-querying)
        geocodeCache[address] = data;
        
        return data;
    } catch (error) {
        console.error('Geocoding error:', error);
        geocodeCache[address] = null; // Cache the failure
    }
    return null;
}

async function geocodeAddressBatch(addresses, batchSize = 100) {
    try {
        // Use the new batch endpoint for parallel geocoding
        const response = await fetch('/api/geocode-batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ addresses })
        });
        
        if (!response.ok) {
            throw new Error('Batch geocoding failed');
        }
        
        const data = await response.json();
        console.log(`Batch geocoding stats:`, data.stats);
        
        return data.results;
    } catch (error) {
        console.error('Batch geocoding error:', error);
        
        // Fallback to old sequential method if batch endpoint fails
        console.log('Falling back to sequential geocoding...');
        const results = {};
        
        for (let i = 0; i < addresses.length; i += batchSize) {
            const batch = addresses.slice(i, i + batchSize);
            const promises = batch.map(address => 
                fetch(`/api/geocode-address?address=${encodeURIComponent(address)}`)
                    .then(response => response.json())
                    .then(data => ({ address, coords: data }))
                    .catch(error => {
                        console.error('Geocoding error for:', address, error);
                        return { address, coords: null };
                    })
            );
            
            const batchResults = await Promise.all(promises);
            for (const result of batchResults) {
                results[result.address] = result.coords;
            }
            
            // Small delay between batches to avoid overwhelming the server
            if (i + batchSize < addresses.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    }
}

async function enrichDoctorsWithDistance(doctors, userCoords, maxDistance) {
    // Filter out doctors with invalid addresses and collect unique addresses
    const validDoctors = doctors.filter(d => d.address && typeof d.address === 'string' && d.address.trim());
    const uniqueAddresses = [...new Set(validDoctors.map(d => d.address))];
    
    // Filter addresses that aren't already cached
    const uncachedAddresses = uniqueAddresses.filter(addr => !geocodeCache[addr]);
    
    // Geocode all uncached addresses in parallel batches
    if (uncachedAddresses.length > 0) {
        console.log(`Geocoding ${uncachedAddresses.length} uncached addresses using parallel processing...`);
        const startTime = Date.now();
        
        const geocodedResults = await geocodeAddressBatch(uncachedAddresses);
        
        // Update cache with results
        for (const [address, coords] of Object.entries(geocodedResults)) {
            if (coords) {
                geocodeCache[address] = coords;
            }
        }
        
        const duration = Date.now() - startTime;
        console.log(`Geocoding complete in ${duration}ms. Total cached addresses: ${Object.keys(geocodeCache).length}`);
    }
    
    // Now calculate distances using cached coordinates - only for valid doctors
    for (const doctor of validDoctors) {
        const doctorCoords = geocodeCache[doctor.address];
        
        if (doctorCoords) {
            doctor.coordinates = doctorCoords;
            doctor.distance = calculateDistance(
                userCoords.lat,
                userCoords.lng,
                doctorCoords.lat,
                doctorCoords.lng
            );
        } else {
            doctor.distance = null;
        }
    }
    
    validDoctors.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
    });
    
    const withCoords = validDoctors.filter(d => d.distance !== null).length;
    const withinRange = validDoctors.filter(d => d.distance !== null && d.distance <= maxDistance).length;
    console.log(`Geocoding results: ${withCoords} doctors with coordinates, ${withinRange} within ${maxDistance}km range`);
    
    // Only return doctors that have valid coordinates and are within range
    return validDoctors.filter(d => d.distance !== null && d.distance <= maxDistance);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return Math.round(distance * 10) / 10;
}

function toRad(deg) {
    return deg * (Math.PI/180);
}

function sortResults(sortBy) {
    let sorted = [...allDoctors];
    
    if (sortBy === 'distance') {
        sorted.sort((a, b) => {
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });
    } else if (sortBy === 'name') {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    displayResults(sorted);
}

function displayResults(doctors) {
    const container = document.getElementById('resultsContainer');
    
    if (doctors.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <h3>No doctors found</h3>
                <p>Try adjusting your search criteria or increasing the maximum distance.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = doctors.map(doctor => `
        <div class="doctor-card">
            <div class="doctor-header">
                <div>
                    <div class="doctor-name">${doctor.name}</div>
                    <div class="doctor-specialty">${doctor.specialty}</div>
                    ${doctor.searchPostalCode ? `<div class="doctor-postal">${doctor.searchPostalCode}</div>` : ''}
                </div>
                ${doctor.distance !== null && doctor.distance !== undefined ? 
                    `<div class="distance-badge">${doctor.distance} km</div>` : ''}
            </div>
            
            <div class="doctor-info">
                <div class="info-row">
                    <span class="info-label">Address:</span>
                    <span>${doctor.address}</span>
                </div>
                ${doctor.distance !== null && doctor.distance !== undefined ? `
                <div class="info-row">
                    <span class="info-label">Distance:</span>
                    <span>${doctor.distance} km</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">Phone:</span>
                    <span>${doctor.phone}</span>
                </div>
                ${doctor.cpsoNumber ? `
                <div class="info-row">
                    <span class="info-label">CPSO #:</span>
                    <span>${doctor.cpsoNumber}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">Gender:</span>
                    <span class="gender-display" data-cpso="${doctor.cpsoNumber || ''}">${getGenderDisplay(doctor.gender)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function displayError(message) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = `<div class="error-message">${message}</div>`;
}

function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    const container = document.getElementById('resultsContainer');
    
    if (show) {
        spinner.style.display = 'block';
        container.innerHTML = '';
    } else {
        spinner.style.display = 'none';
    }
}

async function loadGTAPostalCodes() {
    try {
        // Try to load GTA postal codes first, fall back to Toronto-only if not found
        let response = await fetch('/gta-postal-codes.json');
        if (!response.ok) {
            console.log('GTA postal codes not found, falling back to Toronto postal codes');
            response = await fetch('/toronto-postal-codes.json');
        }
        const data = await response.json();
        torontoPostalCodes = data.postalCodes;
        console.log(`Loaded ${torontoPostalCodes.length} postal codes`);
    } catch (error) {
        console.error('Error loading postal codes:', error);
    }
}

async function loadFSABoundaries() {
    try {
        // Try to load GTA FSA boundaries first, fall back to Toronto-only if not found
        let response = await fetch('/gta-fsa-boundaries.min.json');
        if (!response.ok) {
            console.log('GTA FSA boundaries not found, falling back to Toronto FSA boundaries');
            response = await fetch('/toronto-fsa-boundaries.min.json');
        }
        const data = await response.json();
        fsaBoundaries = data;
        console.log(`Loaded ${fsaBoundaries.features.length} FSA boundaries`);
        
        // Pre-compute bounding boxes for faster intersection checks
        computeFSABoundingBoxes();
    } catch (error) {
        console.error('Error loading FSA boundaries:', error);
    }
}

// Pre-compute bounding boxes for all FSA boundaries when they're loaded
function computeFSABoundingBoxes() {
    if (!fsaBoundaries || !fsaBoundaries.features) return;
    
    console.log('Computing bounding boxes for FSA boundaries...');
    const startTime = Date.now();
    
    for (const feature of fsaBoundaries.features) {
        // turf.bbox returns [minX, minY, maxX, maxY] = [minLng, minLat, maxLng, maxLat]
        const bbox = turf.bbox(feature);
        feature.properties.bbox = {
            minLng: bbox[0],
            minLat: bbox[1],
            maxLng: bbox[2],
            maxLat: bbox[3]
        };
    }
    
    const duration = Date.now() - startTime;
    console.log(`Computed ${fsaBoundaries.features.length} bounding boxes in ${duration}ms`);
}

// Fast bounding box intersection check
function bboxIntersectsCircle(bbox, centerLat, centerLng, radiusKm) {
    // Convert radius to approximate degrees (1 degree latitude ≈ 111km)
    const radiusDeg = radiusKm / 111;
    
    // Create bounding box for the circle
    const circleBbox = {
        minLat: centerLat - radiusDeg,
        maxLat: centerLat + radiusDeg,
        minLng: centerLng - radiusDeg / Math.cos(centerLat * Math.PI / 180),
        maxLng: centerLng + radiusDeg / Math.cos(centerLat * Math.PI / 180)
    };
    
    // Check if bounding boxes overlap
    return !(bbox.maxLat < circleBbox.minLat || 
             bbox.minLat > circleBbox.maxLat ||
             bbox.maxLng < circleBbox.minLng || 
             bbox.minLng > circleBbox.maxLng);
}

function findPostalCodesWithinRadius(centerLat, centerLng, radiusKm) {
    console.log('Finding postal codes within radius:', { centerLat, centerLng, radiusKm });
    console.log('FSA boundaries loaded?', fsaBoundaries ? 'Yes' : 'No');
    console.log('GTA postal codes loaded?', torontoPostalCodes.length > 0 ? `Yes (${torontoPostalCodes.length} codes)` : 'No');
    
    if (!fsaBoundaries) {
        console.log('Using fallback center point method - FSA boundaries not loaded');
        // Fallback to center point method if boundaries not loaded
        const postalCodesInRadius = [];
        
        for (const postalCode of torontoPostalCodes) {
            const distance = calculateDistance(centerLat, centerLng, postalCode.lat, postalCode.lng);
            if (distance <= radiusKm) {
                postalCodesInRadius.push({
                    code: postalCode.code,
                    distance: Math.round(distance * 10) / 10
                });
            }
        }
        
        postalCodesInRadius.sort((a, b) => a.distance - b.distance);
        console.log(`Found ${postalCodesInRadius.length} postal codes using center point method`);
        return postalCodesInRadius;
    }
    
    // Ensure bounding boxes are computed
    if (fsaBoundaries.features[0] && !fsaBoundaries.features[0].properties.bbox) {
        computeFSABoundingBoxes();
    }
    
    // Use Turf.js to check FSA boundary intersections
    const searchPoint = turf.point([centerLng, centerLat]);
    const searchCircle = turf.circle(searchPoint, radiusKm, { units: 'kilometers' });
    
    console.log('Search point:', [centerLng, centerLat]);
    console.log('Search circle created with radius:', radiusKm, 'km');
    
    const fsasInRadius = new Set();
    const postalCodesInRadius = [];
    let bboxChecks = 0;
    let polygonChecks = 0;
    
    // First, find all FSAs that intersect with the search radius
    for (const feature of fsaBoundaries.features) {
        bboxChecks++;
        
        // Quick bounding box check first
        if (!bboxIntersectsCircle(feature.properties.bbox, centerLat, centerLng, radiusKm)) {
            continue; // Skip expensive polygon check if bounding boxes don't overlap
        }
        
        // Only do expensive polygon intersection if bounding boxes overlap
        polygonChecks++;
        try {
            const intersects = turf.booleanIntersects(searchCircle, feature);
            
            if (intersects) {
                fsasInRadius.add(feature.properties.fsa);
            }
        } catch (error) {
            console.error('Error checking intersection for FSA:', feature.properties.fsa, error);
        }
    }
    
    console.log(`Bounding box checks: ${bboxChecks}, Polygon checks: ${polygonChecks} (${Math.round(100 * polygonChecks / bboxChecks)}%)`);
    console.log('FSAs found within radius:', Array.from(fsasInRadius));
    
    // Now include all FSAs found in the radius
    const addedFSAs = new Set();
    for (const postalCode of torontoPostalCodes) {
        // Check if this FSA code is in our radius
        if (fsasInRadius.has(postalCode.code) && !addedFSAs.has(postalCode.code)) {
            const distance = calculateDistance(centerLat, centerLng, postalCode.lat, postalCode.lng);
            // Use the FSA code directly (it's already 3 characters)
            postalCodesInRadius.push({
                code: postalCode.code,
                distance: Math.round(distance * 10) / 10
            });
            addedFSAs.add(postalCode.code);
        }
    }
    
    // Sort by distance to center
    postalCodesInRadius.sort((a, b) => a.distance - b.distance);
    
    console.log(`Final result: ${postalCodesInRadius.length} postal codes found`);
    
    return postalCodesInRadius;
}

function displayPostalCodes(postalCodes) {
    const postalCodesSection = document.getElementById('postalCodesSection');
    const postalCodesList = document.getElementById('postalCodesList');
    
    // Check if elements exist before trying to use them
    if (!postalCodesSection || !postalCodesList) {
        console.log('Postal codes display elements not found in HTML');
        return;
    }
    
    if (postalCodes.length > 0) {
        postalCodesSection.style.display = 'block';
        postalCodesList.innerHTML = postalCodes.map(pc => 
            `<span class="postal-code-item">${pc.code} (${pc.distance}km)</span>`
        ).join(' ');
    } else {
        postalCodesSection.style.display = 'none';
    }
}

// Batch geocode all addresses that don't have coordinates
async function batchGeocodeAddresses() {
    const batchBtn = document.getElementById('batchGeocodeBtn');
    const batchStatus = document.getElementById('batchStatus');
    
    if (!allDoctors || allDoctors.length === 0) {
        batchStatus.textContent = 'Please search for doctors first';
        return;
    }
    
    // Collect all unique addresses
    const uniqueAddresses = [...new Set(allDoctors.map(d => d.address))];
    
    // Filter addresses that don't have coordinates yet
    const addressesToGeocode = [];
    for (const address of uniqueAddresses) {
        const coords = geocodeCache[address];
        if (!coords) {
            addressesToGeocode.push(address);
        }
    }
    
    if (addressesToGeocode.length === 0) {
        batchStatus.textContent = 'All addresses already have coordinates!';
        return;
    }
    
    batchBtn.disabled = true;
    batchStatus.textContent = `Geocoding ${addressesToGeocode.length} addresses...`;
    
    try {
        const response = await fetch('/api/batch-geocode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ addresses: addressesToGeocode })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Batch geocoding failed');
        }
        
        const data = await response.json();
        const results = data.results;
        
        // Update the geocode cache
        let successCount = 0;
        for (const [address, coords] of Object.entries(results)) {
            if (coords) {
                geocodeCache[address] = coords;
                successCount++;
            }
        }
        
        batchStatus.textContent = `Geocoded ${successCount} of ${addressesToGeocode.length} addresses`;
        
        // Re-enrich doctors with the new coordinates
        if (userCoordinates && allDoctors.length > 0) {
            const maxDistance = parseFloat(document.getElementById('maxDistance').value) || 5;
            const enrichedDoctors = await enrichDoctorsWithDistance(allDoctors, userCoordinates, maxDistance);
            displayResults(enrichedDoctors);
            checkBatchGeocoding();
        }
        
    } catch (error) {
        console.error('Batch geocoding error:', error);
        batchStatus.textContent = error.message.includes('API key') ? 
            'Set GEOAPIFY_API_KEY environment variable first' : 
            `Error: ${error.message}`;
    } finally {
        batchBtn.disabled = false;
    }
}

// Check if batch geocoding is available and show the section
async function checkBatchGeocoding() {
    // Show the batch geocoding section if we have doctors with missing coordinates
    if (allDoctors && allDoctors.length > 0) {
        const hasNullCoordinates = allDoctors.some(d => !geocodeCache[d.address]);
        if (hasNullCoordinates) {
            document.getElementById('batchGeocodeSection').style.display = 'block';
        }
    }
}

// Save doctors to database
async function saveDoctorsToDatabase(doctors) {
    try {
        const response = await fetch('/api/save-doctors', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ doctors })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`Saved ${data.count} doctors to database`);
        }
    } catch (error) {
        console.error('Error saving doctors to database:', error);
    }
}

// Get database statistics
async function getDatabaseStats() {
    try {
        const response = await fetch('/api/stats');
        if (response.ok) {
            const stats = await response.json();
            console.log('Database statistics:', stats);
            return stats;
        }
    } catch (error) {
        console.error('Error getting database stats:', error);
    }
    return null;
}

// Gender-related functions
function getGenderDisplay(gender) {
    if (!gender || gender === null || gender === '') {
        return 'Data still processing...';
    }
    return gender;
}

function updateGenderFilter(doctors) {
    const genderFilter = document.getElementById('genderFilter');
    if (!genderFilter) return;
    
    const currentValue = genderFilter.value; // Preserve selection
    
    // Get unique gender values from current results
    const genders = new Set();
    let hasProcessing = false;
    
    doctors.forEach(doctor => {
        if (doctor.gender === null || doctor.gender === '' || !doctor.gender) {
            hasProcessing = true;
        } else {
            genders.add(doctor.gender);
        }
    });
    
    // Rebuild filter options
    genderFilter.innerHTML = '<option value="">All Genders</option>';
    
    // Add actual gender options (sorted)
    Array.from(genders).sort().forEach(gender => {
        const option = document.createElement('option');
        option.value = gender;
        option.textContent = gender;
        genderFilter.appendChild(option);
    });
    
    // Add "Data still processing" if there are null values
    if (hasProcessing) {
        const option = document.createElement('option');
        option.value = 'processing';
        option.textContent = 'Data still processing...';
        genderFilter.appendChild(option);
    }
    
    // Restore previous selection if still valid
    if (currentValue && [...genderFilter.options].some(opt => opt.value === currentValue)) {
        genderFilter.value = currentValue;
    }
}

function filterAndDisplayResults() {
    const genderFilter = document.getElementById('genderFilter');
    const selectedGender = genderFilter ? genderFilter.value : '';
    
    let filtered = [...allDoctors];
    
    // Apply gender filter
    if (selectedGender) {
        if (selectedGender === 'processing') {
            filtered = filtered.filter(doctor => 
                doctor.gender === null || doctor.gender === '' || !doctor.gender
            );
        } else {
            filtered = filtered.filter(doctor => doctor.gender === selectedGender);
        }
    }
    
    // Apply current sorting
    const activeSortBtn = document.querySelector('.sort-btn.active');
    const sortBy = activeSortBtn ? activeSortBtn.dataset.sort : 'distance';
    
    if (sortBy === 'distance') {
        filtered.sort((a, b) => {
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });
    } else if (sortBy === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    displayResults(filtered);
}

// Background gender fetching
async function startGenderEnhancement() {
    // Only start if we have doctors with missing gender
    const doctorsNeedingGender = allDoctors.filter(d => 
        d.cpsoNumber && (!d.gender || d.gender === null || d.gender === '')
    );
    
    if (doctorsNeedingGender.length === 0) {
        console.log('All doctors already have gender data');
        return;
    }
    
    console.log(`Starting background gender fetching for ${doctorsNeedingGender.length} doctors...`);
    
    // Process in small batches to avoid overwhelming the server
    const BATCH_SIZE = 3;
    const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds
    
    for (let i = 0; i < doctorsNeedingGender.length; i += BATCH_SIZE) {
        const batch = doctorsNeedingGender.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        await Promise.allSettled(batch.map(async (doctor) => {
            try {
                const response = await fetch(`/api/doctor-gender/${doctor.cpsoNumber}`);
                if (response.ok) {
                    const data = await response.json();
                    
                    // Update the doctor object in our local array
                    const doctorIndex = allDoctors.findIndex(d => d.cpsoNumber === doctor.cpsoNumber);
                    if (doctorIndex !== -1) {
                        allDoctors[doctorIndex].gender = data.gender;
                        
                        // Update the UI for this specific doctor
                        updateDoctorGenderInUI(doctor.cpsoNumber, data.gender);
                    }
                }
            } catch (error) {
                console.log(`Failed to get gender for CPSO #${doctor.cpsoNumber}:`, error.message);
            }
        }));
        
        // Update the gender filter after each batch
        updateGenderFilter(allDoctors);
        
        // Re-apply current filter to show newly matching doctors
        filterAndDisplayResults();
        
        // Rate limiting - wait between batches
        if (i + BATCH_SIZE < doctorsNeedingGender.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
    }
    
    console.log('Background gender fetching completed');
}

// Update gender display for a specific doctor in the UI
function updateDoctorGenderInUI(cpsoNumber, gender) {
    const genderSpan = document.querySelector(`[data-cpso="${cpsoNumber}"]`);
    if (genderSpan) {
        genderSpan.textContent = getGenderDisplay(gender);
    }
}

