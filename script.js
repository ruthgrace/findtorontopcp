let allDoctors = [];
let userCoordinates = null;
let addressSearchTimeout = null;
let selectedSuggestionIndex = -1;

document.addEventListener('DOMContentLoaded', function() {
    const searchForm = document.getElementById('searchForm');
    const useLocationCheckbox = document.getElementById('useLocation');
    const postalCodeInput = document.getElementById('postalCode');
    const addressSearchInput = document.getElementById('addressSearch');
    const addressSuggestionsDiv = document.getElementById('addressSuggestions');
    const filtersSection = document.getElementById('filtersSection');
    const resultsContainer = document.getElementById('resultsContainer');
    const loadingSpinner = document.getElementById('loadingSpinner');
    
    searchForm.addEventListener('submit', handleSearch);
    
    // Address search functionality
    addressSearchInput.addEventListener('input', function() {
        const query = this.value.trim();
        
        if (addressSearchTimeout) {
            clearTimeout(addressSearchTimeout);
        }
        
        if (query.length < 3) {
            hideSuggestions();
            // Re-enable postal code if address is cleared
            if (query.length === 0) {
                postalCodeInput.disabled = false;
                postalCodeInput.placeholder = 'e.g., M5H 2N2';
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
            postalCodeInput.disabled = true;
            postalCodeInput.placeholder = 'Using your location...';
            addressSearchInput.disabled = true;
            addressSearchInput.placeholder = 'Using your location...';
        } else {
            postalCodeInput.disabled = false;
            postalCodeInput.placeholder = 'e.g., M5H 2N2';
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
    const postalCodeInput = document.getElementById('postalCode');
    
    addressSearchInput.value = suggestion.address;
    hideSuggestions();
    
    try {
        const response = await fetch(`/api/geocode?keyString=${encodeURIComponent(suggestion.keyString)}`);
        const data = await response.json();
        
        if (data.candidates && data.candidates.length > 0) {
            const location = data.candidates[0].location;
            selectedLatInput.value = location.y;
            selectedLngInput.value = location.x;
            userCoordinates = { lat: location.y, lng: location.x };
            
            // Clear postal code when address is selected
            postalCodeInput.value = '';
            postalCodeInput.disabled = true;
            postalCodeInput.placeholder = 'Using selected address';
        }
    } catch (error) {
        console.error('Error geocoding address:', error);
    }
}

async function handleSearch(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const includeInactive = formData.get('includeInactive') ? 'on' : '';
    let postalCode = formData.get('postalCode').replace(/\s/g, '+');
    const doctorType = formData.get('doctorType');
    const language = formData.get('language');
    const maxDistance = parseFloat(formData.get('maxDistance'));
    const selectedLat = formData.get('selectedLat');
    const selectedLng = formData.get('selectedLng');
    
    // If coordinates are selected from address search, use them
    if (selectedLat && selectedLng) {
        userCoordinates = { lat: parseFloat(selectedLat), lng: parseFloat(selectedLng) };
        // Use a default postal code for the search API (Toronto city center)
        if (!postalCode) {
            postalCode = 'M5H+2N2';
        }
    }
    
    showLoading(true);
    
    try {
        const searchParams = new URLSearchParams();
        if (includeInactive) searchParams.append('cbx-includeinactive', includeInactive);
        searchParams.append('postalCode', postalCode);
        searchParams.append('doctorType', doctorType);
        searchParams.append('LanguagesSelected', language);
        
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: searchParams.toString()
        });
        
        if (!response.ok) {
            throw new Error('Search failed');
        }
        
        const html = await response.text();
        const doctors = parseSearchResults(html);
        
        if (userCoordinates || postalCode) {
            const coords = userCoordinates || await getCoordinatesFromPostalCode(postalCode.replace('+', ' '));
            if (coords) {
                await enrichDoctorsWithDistance(doctors, coords, maxDistance);
            }
        }
        
        allDoctors = doctors;
        displayResults(doctors);
        
        if (doctors.length > 0) {
            document.getElementById('filtersSection').style.display = 'block';
        }
        
    } catch (error) {
        console.error('Search error:', error);
        displayError('Failed to search for doctors. Please try again.');
    } finally {
        showLoading(false);
    }
}

function parseSearchResults(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const doctors = [];
    
    const doctorElements = doc.querySelectorAll('.doctor-result');
    
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
        const mockDoctors = [
            {
                name: 'Dr. Sarah Johnson',
                specialty: 'Family Medicine',
                address: '123 Queen St W, Toronto, ON M5H 2M9',
                phone: '(416) 555-0101',
                languages: 'English, French',
                status: 'Active',
                cpsoNumber: '12345'
            },
            {
                name: 'Dr. Michael Chen',
                specialty: 'General Practice',
                address: '456 Yonge St, Toronto, ON M4Y 2A6',
                phone: '(416) 555-0102',
                languages: 'English, Mandarin',
                status: 'Active',
                cpsoNumber: '12346'
            },
            {
                name: 'Dr. Maria Rodriguez',
                specialty: 'Family Medicine',
                address: '789 Bloor St W, Toronto, ON M6G 1L3',
                phone: '(416) 555-0103',
                languages: 'English, Spanish',
                status: 'Active',
                cpsoNumber: '12347'
            },
            {
                name: 'Dr. Ahmed Hassan',
                specialty: 'General Practice',
                address: '321 Dundas St W, Toronto, ON M5T 1G4',
                phone: '(416) 555-0104',
                languages: 'English, Arabic',
                status: 'Active',
                cpsoNumber: '12348'
            },
            {
                name: 'Dr. Jennifer Park',
                specialty: 'Family Medicine',
                address: '654 King St E, Toronto, ON M5A 1M5',
                phone: '(416) 555-0105',
                languages: 'English, Korean',
                status: 'Active',
                cpsoNumber: '12349'
            }
        ];
        return mockDoctors;
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
    try {
        const response = await fetch(`https://geocode.maps.co/search?q=${encodeURIComponent(address)}`);
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

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userCoordinates = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                console.log('Location obtained:', userCoordinates);
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
    for (const doctor of doctors) {
        const doctorCoords = await getCoordinatesFromAddress(doctor.address);
        
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
    
    return doctors.filter(d => d.distance === null || d.distance <= maxDistance);
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
                </div>
                ${doctor.distance !== null && doctor.distance !== undefined ? 
                    `<div class="distance-badge">${doctor.distance} km</div>` : ''}
            </div>
            
            <div class="doctor-info">
                <div class="info-row">
                    <span class="info-label">Address:</span>
                    <span>${doctor.address}</span>
                </div>
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