const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, 'doctors.db');

let db = null;

// Initialize database connection and create tables
async function initDatabase() {
    try {
        // Open database with sqlite wrapper for async/await support
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Connected to SQLite database:', DB_PATH);
        
        // Enable WAL mode for better concurrency with 30,000+ doctors
        await db.exec('PRAGMA journal_mode = WAL');
        await db.exec('PRAGMA synchronous = NORMAL');
        await db.exec('PRAGMA cache_size = 10000');
        await db.exec('PRAGMA temp_store = MEMORY');

        // Create doctors table (stores doctor info without coordinates)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS doctors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                specialty TEXT,
                address TEXT NOT NULL,
                phone TEXT,
                languages TEXT,
                status TEXT,
                cpso_number TEXT,
                postal_code TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create geocoding table (maps addresses to coordinates)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS geocoding (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                address TEXT NOT NULL UNIQUE,
                latitude REAL,
                longitude REAL,
                geocoded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'geoapify'
            )
        `);

        // Create indexes for better performance with 30,000+ doctors
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_doctors_address ON doctors(address);
            CREATE INDEX IF NOT EXISTS idx_doctors_postal_code ON doctors(postal_code);
            CREATE INDEX IF NOT EXISTS idx_doctors_cpso ON doctors(cpso_number);
            CREATE INDEX IF NOT EXISTS idx_doctors_status ON doctors(status);
            CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON doctors(specialty);
            CREATE INDEX IF NOT EXISTS idx_doctors_updated ON doctors(updated_at);
            CREATE INDEX IF NOT EXISTS idx_geocoding_address ON geocoding(address);
        `);

        console.log('Database tables and indexes created successfully');
        
        // Migrate existing cache if it exists
        await migrateExistingCache();
        
        return db;
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

// Migrate existing JSON cache to SQLite
async function migrateExistingCache() {
    const fs = require('fs');
    const CACHE_FILE = path.join(__dirname, 'geocode-cache.json');
    
    try {
        if (fs.existsSync(CACHE_FILE)) {
            console.log('Found existing geocode cache file, migrating to SQLite...');
            
            const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            let migrated = 0;
            let skipped = 0;
            
            for (const [address, coords] of Object.entries(cacheData)) {
                if (coords && coords.lat && coords.lng) {
                    try {
                        await db.run(
                            `INSERT OR IGNORE INTO geocoding (address, latitude, longitude, source) 
                             VALUES (?, ?, ?, ?)`,
                            [address, coords.lat, coords.lng, 'migrated']
                        );
                        migrated++;
                    } catch (err) {
                        skipped++;
                    }
                }
            }
            
            console.log(`Migration complete: ${migrated} addresses migrated, ${skipped} skipped`);
            
            // Rename the old cache file to backup
            const backupFile = CACHE_FILE + '.backup.' + Date.now();
            fs.renameSync(CACHE_FILE, backupFile);
            console.log(`Old cache file backed up to: ${backupFile}`);
        }
    } catch (error) {
        console.error('Error migrating cache:', error);
    }
}

// Save or update doctor information
async function saveDoctor(doctorData) {
    try {
        const result = await db.run(
            `INSERT OR REPLACE INTO doctors 
             (name, specialty, address, phone, languages, status, cpso_number, postal_code, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                doctorData.name,
                doctorData.specialty,
                doctorData.address,
                doctorData.phone,
                doctorData.languages,
                doctorData.status,
                doctorData.cpsoNumber || doctorData.cpsonumber,
                doctorData.searchPostalCode || null
            ]
        );
        return result;
    } catch (error) {
        console.error('Error saving doctor:', error);
        throw error;
    }
}

// Batch save doctors - optimized for large datasets
async function saveDoctorsBatch(doctors) {
    try {
        const startTime = Date.now();
        await db.run('BEGIN TRANSACTION');
        
        // Create a composite key for uniquely identifying doctors (name + address)
        const getDoctorKey = (doc) => `${doc.name}|${doc.address}`;
        
        // Get all existing doctors we might update
        const doctorKeys = doctors.map(d => getDoctorKey(d));
        
        // Fetch existing doctors in batches (SQLite has parameter limit)
        const BATCH_SIZE = 500;
        const existingMap = new Map();
        
        // We need to check by name AND address combo since multiple doctors can share an address
        const existingDoctors = await db.all(
            `SELECT name, specialty, address, phone, languages, status, cpso_number, postal_code 
             FROM doctors`
        );
        
        existingDoctors.forEach(doc => {
            const key = getDoctorKey(doc);
            existingMap.set(key, doc);
        });
        
        let inserted = 0, updated = 0, skipped = 0;
        const updateBatch = [];
        const insertBatch = [];
        
        for (const doctor of doctors) {
            // Skip doctors with invalid addresses
            if (!doctor.address || typeof doctor.address !== 'string' || !doctor.address.trim()) {
                skipped++;
                continue;
            }
            
            const doctorKey = getDoctorKey(doctor);
            const existing = existingMap.get(doctorKey);
            
            if (!existing) {
                insertBatch.push(doctor);
                inserted++;
            } else if (hasDataChanged(existing, doctor)) {
                updateBatch.push(doctor);
                updated++;
            } else {
                skipped++;
            }
        }
        
        // Batch inserts
        if (insertBatch.length > 0) {
            const insertStmt = await db.prepare(
                `INSERT INTO doctors 
                 (name, specialty, address, phone, languages, status, cpso_number, postal_code, gender, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
            );
            
            for (const doctor of insertBatch) {
                await insertStmt.run(
                    doctor.name,
                    doctor.specialty,
                    doctor.address,
                    doctor.phone,
                    doctor.languages,
                    doctor.status,
                    doctor.cpsoNumber || doctor.cpsonumber,
                    doctor.searchPostalCode || null,
                    doctor.gender || null
                );
            }
            await insertStmt.finalize();
        }
        
        // Batch updates
        if (updateBatch.length > 0) {
            // Prepare different update statements based on whether we have gender data
            for (const doctor of updateBatch) {
                if (doctor.gender && doctor.gender !== '') {
                    // Update including gender (when we have new gender data)
                    await db.run(
                        `UPDATE doctors SET
                         specialty = ?, phone = ?, languages = ?, 
                         status = ?, cpso_number = ?, postal_code = ?, gender = ?, updated_at = CURRENT_TIMESTAMP
                         WHERE name = ? AND address = ?`,
                        [
                            doctor.specialty,
                            doctor.phone,
                            doctor.languages,
                            doctor.status,
                            doctor.cpsoNumber || doctor.cpsonumber,
                            doctor.searchPostalCode || null,
                            doctor.gender,
                            doctor.name,
                            doctor.address
                        ]
                    );
                } else {
                    // Update without touching gender (preserve existing gender data)
                    await db.run(
                        `UPDATE doctors SET
                         specialty = ?, phone = ?, languages = ?, 
                         status = ?, cpso_number = ?, postal_code = ?, updated_at = CURRENT_TIMESTAMP
                         WHERE name = ? AND address = ?`,
                        [
                            doctor.specialty,
                            doctor.phone,
                            doctor.languages,
                            doctor.status,
                            doctor.cpsoNumber || doctor.cpsonumber,
                            doctor.searchPostalCode || null,
                            doctor.name,
                            doctor.address
                        ]
                    );
                }
            }
        }
        
        await db.run('COMMIT');
        
        const elapsed = Date.now() - startTime;
        console.log(`Database update in ${elapsed}ms: ${inserted} new, ${updated} modified, ${skipped} unchanged (total: ${doctors.length})`);
        
        return { inserted, updated, skipped, elapsed };
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in batch save:', error);
        throw error;
    }
}

// Helper function to check if doctor data has changed
function hasDataChanged(existing, newData) {
    const newCpsoNumber = newData.cpsoNumber || newData.cpsonumber;
    
    // Always update if we have a new CPSO number and the existing one is null/empty
    if (newCpsoNumber && (!existing.cpso_number || existing.cpso_number === '')) {
        return true;
    }
    
    return existing.name !== newData.name ||
           existing.specialty !== newData.specialty ||
           existing.phone !== newData.phone ||
           existing.languages !== newData.languages ||
           existing.status !== newData.status ||
           existing.cpso_number !== newCpsoNumber ||
           existing.postal_code !== (newData.searchPostalCode || null);
}

// Get geocoding for an address
async function getGeocoding(address) {
    try {
        const result = await db.get(
            'SELECT latitude, longitude FROM geocoding WHERE address = ?',
            [address]
        );
        
        if (result) {
            return {
                lat: result.latitude,
                lng: result.longitude
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting geocoding:', error);
        return null;
    }
}

// Save geocoding for an address
async function saveGeocoding(address, lat, lng, source = 'geoapify') {
    try {
        await db.run(
            `INSERT OR REPLACE INTO geocoding (address, latitude, longitude, source, geocoded_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [address, lat, lng, source]
        );
    } catch (error) {
        console.error('Error saving geocoding:', error);
        throw error;
    }
}

// Batch save geocoding results
async function saveGeocodingBatch(geocodingData) {
    try {
        await db.run('BEGIN TRANSACTION');
        
        for (const [address, coords] of Object.entries(geocodingData)) {
            if (coords && coords.lat && coords.lng) {
                await saveGeocoding(address, coords.lat, coords.lng);
            }
        }
        
        await db.run('COMMIT');
        console.log(`Saved ${Object.keys(geocodingData).length} geocoding entries to database`);
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in batch geocoding save:', error);
        throw error;
    }
}

// Get all geocoded addresses (for cache warming)
async function getAllGeocodedAddresses() {
    try {
        const results = await db.all(
            'SELECT address, latitude, longitude FROM geocoding WHERE latitude IS NOT NULL AND longitude IS NOT NULL'
        );
        
        const cache = {};
        for (const row of results) {
            cache[row.address] = {
                lat: row.latitude,
                lng: row.longitude
            };
        }
        
        return cache;
    } catch (error) {
        console.error('Error loading geocoded addresses:', error);
        return {};
    }
}

// Search doctors by postal code
async function searchDoctorsByPostalCode(postalCode) {
    try {
        const results = await db.all(
            `SELECT d.*, g.latitude, g.longitude 
             FROM doctors d
             LEFT JOIN geocoding g ON d.address = g.address
             WHERE d.postal_code = ?
             ORDER BY d.name`,
            [postalCode]
        );
        
        return results.map(row => ({
            ...row,
            coordinates: row.latitude && row.longitude ? {
                lat: row.latitude,
                lng: row.longitude
            } : null
        }));
    } catch (error) {
        console.error('Error searching doctors:', error);
        return [];
    }
}

// Get database statistics
async function getDatabaseStats() {
    try {
        const doctorCount = await db.get('SELECT COUNT(*) as count FROM doctors');
        const geocodingCount = await db.get('SELECT COUNT(*) as count FROM geocoding');
        const geocodedCount = await db.get('SELECT COUNT(*) as count FROM geocoding WHERE latitude IS NOT NULL');
        
        return {
            doctors: doctorCount.count,
            addresses: geocodingCount.count,
            geocoded: geocodedCount.count
        };
    } catch (error) {
        console.error('Error getting stats:', error);
        return { doctors: 0, addresses: 0, geocoded: 0 };
    }
}

// Update doctor gender
async function updateDoctorGender(cpsoNumber, gender) {
    try {
        const result = await db.run(
            'UPDATE doctors SET gender = ? WHERE cpso_number = ?',
            [gender, cpsoNumber]
        );
        return result;
    } catch (error) {
        console.error('Error updating doctor gender:', error);
        throw error;
    }
}

// Get doctors missing gender data
async function getDoctorsWithoutGender(limit = null) {
    try {
        const query = limit 
            ? 'SELECT cpso_number, name FROM doctors WHERE (gender IS NULL OR gender = "") AND cpso_number IS NOT NULL AND cpso_number != "" LIMIT ?'
            : 'SELECT cpso_number, name FROM doctors WHERE (gender IS NULL OR gender = "") AND cpso_number IS NOT NULL AND cpso_number != ""';
        
        const params = limit ? [limit] : [];
        const results = await db.all(query, params);
        return results;
    } catch (error) {
        console.error('Error getting doctors without gender:', error);
        return [];
    }
}


// Get existing doctors from database by CPSO numbers
async function getDoctorsByCpsoNumbers(cpsoNumbers) {
    try {
        if (!cpsoNumbers || cpsoNumbers.length === 0) {
            return [];
        }
        
        // Create placeholders for IN clause
        const placeholders = cpsoNumbers.map(() => '?').join(',');
        
        const results = await db.all(
            `SELECT d.*, g.latitude, g.longitude 
             FROM doctors d
             LEFT JOIN geocoding g ON d.address = g.address
             WHERE d.cpso_number IN (${placeholders})
             ORDER BY d.name`,
            cpsoNumbers
        );
        
        return results.map(row => ({
            name: row.name,
            cpsonumber: row.cpso_number,
            cpsoNumber: row.cpso_number,
            specialties: row.specialty,
            primaryaddressnotinpractice: false,
            street1: row.address.split(',')[0] || row.address,
            city: row.address.includes(',') ? row.address.split(',').slice(-3)[0]?.trim() : '',
            province: 'Ontario',
            postalcode: row.postal_code,
            street2: '',
            street3: '',
            street4: '',
            additionaladdresscount: 0,
            phonenumber: row.phone || '',
            fax: '',
            registrationstatus: row.status || 'Active',
            mostrecentformername: '',
            registrationstatuslabel: 'active',
            address: row.address,
            gender: row.gender, // Include gender from database
            searchPostalCode: row.postal_code,
            coordinates: row.latitude && row.longitude ? {
                lat: row.latitude,
                lng: row.longitude
            } : null,
            fromDatabase: true // Flag to indicate this came from database
        }));
    } catch (error) {
        console.error('Error getting doctors by CPSO numbers:', error);
        return [];
    }
}

// Get existing doctors from database by postal codes
async function getDoctorsByPostalCodes(postalCodes) {
    try {
        if (!postalCodes || postalCodes.length === 0) {
            return [];
        }
        
        // Create placeholders for IN clause
        const placeholders = postalCodes.map(() => '?').join(',');
        
        const results = await db.all(
            `SELECT d.*, g.latitude, g.longitude 
             FROM doctors d
             LEFT JOIN geocoding g ON d.address = g.address
             WHERE d.postal_code IN (${placeholders})
             ORDER BY d.name`,
            postalCodes
        );
        
        return results.map(row => ({
            name: row.name,
            cpsonumber: row.cpso_number,
            cpsoNumber: row.cpso_number,
            specialties: row.specialty,
            primaryaddressnotinpractice: false,
            street1: row.address.split(',')[0] || row.address,
            city: row.address.includes(',') ? row.address.split(',').slice(-3)[0]?.trim() : '',
            province: 'Ontario',
            postalcode: row.postal_code,
            street2: '',
            street3: '',
            street4: '',
            additionaladdresscount: 0,
            phonenumber: row.phone || '',
            fax: '',
            registrationstatus: row.status || 'Active',
            mostrecentformername: '',
            registrationstatuslabel: 'active',
            address: row.address,
            gender: row.gender, // Include gender from database
            searchPostalCode: row.postal_code,
            coordinates: row.latitude && row.longitude ? {
                lat: row.latitude,
                lng: row.longitude
            } : null,
            fromDatabase: true // Flag to indicate this came from database
        }));
    } catch (error) {
        console.error('Error getting doctors by postal codes:', error);
        return [];
    }
}

// Check which postal codes have NO data in database (simple existence check)
async function getPostalCodesNeedingUpdate(postalCodes) {
    try {
        if (!postalCodes || postalCodes.length === 0) {
            return postalCodes || [];
        }
        
        const placeholders = postalCodes.map(() => '?').join(',');
        
        // Get postal codes that have ANY data in database
        const existingCodes = await db.all(
            `SELECT DISTINCT postal_code 
             FROM doctors 
             WHERE postal_code IN (${placeholders})`,
            postalCodes
        );
        
        const existingSet = new Set(existingCodes.map(row => row.postal_code));
        
        // Return postal codes that have NO data (need fetching)
        return postalCodes.filter(code => !existingSet.has(code));
        
    } catch (error) {
        console.error('Error checking postal codes needing update:', error);
        return postalCodes; // If error, update all
    }
}

// Close database connection
async function closeDatabase() {
    if (db) {
        await db.close();
        console.log('Database connection closed');
    }
}

module.exports = {
    initDatabase,
    saveDoctor,
    saveDoctorsBatch,
    getGeocoding,
    saveGeocoding,
    saveGeocodingBatch,
    getAllGeocodedAddresses,
    searchDoctorsByPostalCode,
    getDatabaseStats,
    updateDoctorGender,
    getDoctorsWithoutGender,
    getDoctorsByPostalCodes,
    getDoctorsByCpsoNumbers,
    getPostalCodesNeedingUpdate,
    closeDatabase,
    hasDataChanged
};