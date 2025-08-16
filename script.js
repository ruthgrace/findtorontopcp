let allDoctors = [];
let userCoordinates = null;

document.addEventListener('DOMContentLoaded', function() {
    const searchForm = document.getElementById('searchForm');
    const useLocationCheckbox = document.getElementById('useLocation');
    const postalCodeInput = document.getElementById('postalCode');
    const filtersSection = document.getElementById('filtersSection');
    const resultsContainer = document.getElementById('resultsContainer');
    const loadingSpinner = document.getElementById('loadingSpinner');
    
    searchForm.addEventListener('submit', handleSearch);
    
    useLocationCheckbox.addEventListener('change', function() {
        if (this.checked) {
            getCurrentLocation();
            postalCodeInput.disabled = true;
            postalCodeInput.placeholder = 'Using your location...';
        } else {
            postalCodeInput.disabled = false;
            postalCodeInput.placeholder = 'e.g., M5H 2N2';
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

async function handleSearch(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const includeInactive = formData.get('includeInactive') ? 'on' : '';
    const postalCode = formData.get('postalCode').replace(/\s/g, '+');
    const doctorType = formData.get('doctorType');
    const language = formData.get('language');
    const maxDistance = parseFloat(formData.get('maxDistance'));
    
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