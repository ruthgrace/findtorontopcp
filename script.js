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
    const useLocationCheckbox = document.getElementById('useLocation');
    const addressSearchInput = document.getElementById('addressSearch');
    const addressSuggestionsDiv = document.getElementById('addressSuggestions');
    const filtersSection = document.getElementById('filtersSection');
    const resultsContainer = document.getElementById('resultsContainer');
    const loadingSpinner = document.getElementById('loadingSpinner');
    
    // Load Toronto postal codes and boundaries
    loadTorontoPostalCodes();
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
    
    useLocationCheckbox.addEventListener('change', function() {
        if (this.checked) {
            getCurrentLocation();
            addressSearchInput.disabled = true;
            addressSearchInput.placeholder = 'Using your location...';
        } else {
            addressSearchInput.disabled = false;
            addressSearchInput.placeholder = 'Enter an address in Toronto...';
            userCoordinates = null;
        }
    });
    
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            sortResults(this.dataset.sort);
        });
    });
});

async function fetchAddressSuggestions(query) {
    try {
        const response = await fetch(`/api/address-suggest?searchString=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.suggestions && data.suggestions.length > 0) {
            displaySuggestions(data.suggestions);
        } else {
            hideSuggestions();
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
    const includeInactive = formData.get('includeInactive') ? 'on' : '';
    const doctorType = formData.get('doctorType');
    const language = formData.get('language');
    const maxDistance = parseFloat(formData.get('maxDistance'));
    const selectedLat = formData.get('selectedLat');
    const selectedLng = formData.get('selectedLng');
    
    // Check if coordinates are available from address search or current location
    if (selectedLat && selectedLng) {
        userCoordinates = { lat: parseFloat(selectedLat), lng: parseFloat(selectedLng) };
    }
    
    if (!userCoordinates) {
        displayError('Please select an address or use your current location.');
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
        
        console.log(`Searching for doctors in ${postalCodesInRadius.length} postal codes...`);
        
        // Search for doctors in all postal codes
        const allDoctorsResults = [];
        
        // Process postal codes in batches to avoid overwhelming the server
        for (const pc of postalCodesInRadius) {
            try {
                const searchParams = new URLSearchParams();
                if (includeInactive) searchParams.append('cbx-includeinactive', includeInactive);
                searchParams.append('postalCode', pc.code.replace(' ', '+'));
                searchParams.append('doctorType', doctorType);
                searchParams.append('LanguagesSelected', language);
                
                const response = await fetch('/api/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: searchParams.toString()
                });
                
                if (response.ok) {
                    const responseText = await response.text();
                    let doctors = [];
                    
                    // Check if response is JSON or HTML
                    if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
                        // It's JSON
                        const data = JSON.parse(responseText);
                        doctors = parseJSONResults(data);
                    } else {
                        // It's HTML
                        doctors = parseSearchResults(responseText);
                    }
                    
                    if (doctors.length > 0) {
                        // Add postal code info to each doctor
                        doctors.forEach(doc => {
                            doc.searchPostalCode = pc.code;
                        });
                        
                        allDoctorsResults.push(...doctors);
                    } else {
                        console.warn(`No doctors found for postal code ${pc.code}`);
                    }
                }
            } catch (error) {
                console.error(`Error searching postal code ${pc.code}:`, error);
            }
        }
        
        console.log(`Found ${allDoctorsResults.length} doctors total`);
        
        if (allDoctorsResults.length === 0) {
            displayError('No doctors found in the selected postal codes. The CPSO API may have changed or there may be no doctors in this area.');
            showLoading(false);
            return;
        }
        
        // Save ALL doctors to database before filtering (async, don't wait)
        if (allDoctorsResults.length > 0) {
            saveDoctorsToDatabase(allDoctorsResults);
        }
        
        // Use batch geocoding for all doctors
        const enrichedDoctors = await enrichDoctorsWithDistance(allDoctorsResults, userCoordinates, maxDistance);
        
        // enrichDoctorsWithDistance already filters by distance, so just use the results
        const doctorsWithDistance = enrichedDoctors;
        
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
                languages: result.languages || 'English',
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
            languages: elem.querySelector('.languages')?.textContent?.trim() || 'English',
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

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userCoordinates = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                console.log('Location obtained:', userCoordinates);
                
                // Find and display postal codes within radius
                const maxDistanceInput = document.getElementById('maxDistance');
                const radiusKm = parseFloat(maxDistanceInput.value) || 5;
                const postalCodesInRadius = findPostalCodesWithinRadius(userCoordinates.lat, userCoordinates.lng, radiusKm);
                displayPostalCodes(postalCodesInRadius);
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert('Unable to get your location. Please enter a postal code.');
                document.getElementById('useLocation').checked = false;
                document.getElementById('postalCode').disabled = false;
            }
        );
    } else {
        alert('Geolocation is not supported by your browser.');
        document.getElementById('useLocation').checked = false;
    }
}

async function enrichDoctorsWithDistance(doctors, userCoords, maxDistance) {
    // Collect all unique addresses
    const uniqueAddresses = [...new Set(doctors.map(d => d.address))];
    
    // Filter addresses that aren't already cached
    const uncachedAddresses = uniqueAddresses.filter(addr => !geocodeCache[addr]);
    
    // Geocode all uncached addresses individually
    if (uncachedAddresses.length > 0) {
        console.log(`Geocoding ${uncachedAddresses.length} uncached addresses...`);
        
        for (const address of uncachedAddresses) {
            const coords = await getCoordinatesFromAddress(address);
            if (coords) {
                geocodeCache[address] = coords;
            }
        }
        
        console.log(`Geocoding complete. Total cached addresses: ${Object.keys(geocodeCache).length}`);
    }
    
    // Now calculate distances using cached coordinates
    for (const doctor of doctors) {
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
    
    doctors.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
    });
    
    const withCoords = doctors.filter(d => d.distance !== null).length;
    const withinRange = doctors.filter(d => d.distance !== null && d.distance <= maxDistance).length;
    console.log(`Geocoding results: ${withCoords} doctors with coordinates, ${withinRange} within ${maxDistance}km range`);
    
    // Only return doctors that have valid coordinates and are within range
    return doctors.filter(d => d.distance !== null && d.distance <= maxDistance);
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
                <div class="info-row">
                    <span class="info-label">Languages:</span>
                    <span>${doctor.languages}</span>
                </div>
                ${doctor.cpsoNumber ? `
                <div class="info-row">
                    <span class="info-label">CPSO #:</span>
                    <span>${doctor.cpsoNumber}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="doctor-status ${doctor.status === 'Active' ? 'status-active' : 'status-inactive'}">
                ${doctor.status}
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

async function loadTorontoPostalCodes() {
    try {
        const response = await fetch('/toronto-postal-codes.json');
        const data = await response.json();
        torontoPostalCodes = data.postalCodes;
    } catch (error) {
        console.error('Error loading postal codes:', error);
    }
}

async function loadFSABoundaries() {
    try {
        const response = await fetch('/toronto-fsa-boundaries.min.json');
        const data = await response.json();
        fsaBoundaries = data;
    } catch (error) {
        console.error('Error loading FSA boundaries:', error);
    }
}

function findPostalCodesWithinRadius(centerLat, centerLng, radiusKm) {
    console.log('Finding postal codes within radius:', { centerLat, centerLng, radiusKm });
    console.log('FSA boundaries loaded?', fsaBoundaries ? 'Yes' : 'No');
    console.log('Toronto postal codes loaded?', torontoPostalCodes.length > 0 ? `Yes (${torontoPostalCodes.length} codes)` : 'No');
    
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
    
    // Use Turf.js to check FSA boundary intersections
    const searchPoint = turf.point([centerLng, centerLat]);
    const searchCircle = turf.circle(searchPoint, radiusKm, { units: 'kilometers' });
    
    console.log('Search point:', [centerLng, centerLat]);
    console.log('Search circle created with radius:', radiusKm, 'km');
    console.log('Number of FSA features:', fsaBoundaries.features.length);
    
    // Check first few FSAs for debugging
    if (fsaBoundaries.features.length > 0) {
        console.log('Sample FSA:', fsaBoundaries.features[0].properties.fsa);
        console.log('Sample FSA geometry type:', fsaBoundaries.features[0].geometry.type);
    }
    
    const fsasInRadius = new Set();
    const postalCodesInRadius = [];
    
    // First, find all FSAs that intersect with the search radius
    for (const feature of fsaBoundaries.features) {
        // Check if the search circle intersects with the FSA boundary
        try {
            const intersects = turf.booleanIntersects(searchCircle, feature);
            
            if (intersects) {
                console.log('FSA intersects:', feature.properties.fsa);
                fsasInRadius.add(feature.properties.fsa);
            }
            
            // For debugging: check distance to closest FSAs
            if (feature.properties.fsa && (feature.properties.fsa === 'M2M' || feature.properties.fsa === 'M2N' || feature.properties.fsa === 'M2R')) {
                const centroid = turf.centroid(feature);
                const distance = turf.distance(searchPoint, centroid, { units: 'kilometers' });
                console.log(`Distance to ${feature.properties.fsa}: ${distance.toFixed(2)} km`);
            }
        } catch (error) {
            console.error('Error checking intersection for FSA:', feature.properties.fsa, error);
        }
    }
    
    console.log('FSAs found within radius:', Array.from(fsasInRadius));
    
    // Now include all postal codes that belong to these FSAs
    for (const postalCode of torontoPostalCodes) {
        // Get the FSA (first 3 characters) from the postal code
        const fsa = postalCode.code.substring(0, 3);
        
        if (fsasInRadius.has(fsa)) {
            const distance = calculateDistance(centerLat, centerLng, postalCode.lat, postalCode.lng);
            postalCodesInRadius.push({
                code: postalCode.code,
                distance: Math.round(distance * 10) / 10
            });
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

