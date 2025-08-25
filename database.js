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

        // Create doctors table (stores doctor info without coordinates)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS doctors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                specialty TEXT,
                address TEXT NOT NULL UNIQUE,
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

        // Create indexes for better performance
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_doctors_address ON doctors(address);
            CREATE INDEX IF NOT EXISTS idx_doctors_postal_code ON doctors(postal_code);
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
                doctorData.cpsoNumber,
                doctorData.searchPostalCode || null
            ]
        );
        return result;
    } catch (error) {
        console.error('Error saving doctor:', error);
        throw error;
    }
}

// Batch save doctors
async function saveDoctorsBatch(doctors) {
    try {
        await db.run('BEGIN TRANSACTION');
        
        for (const doctor of doctors) {
            await saveDoctor(doctor);
        }
        
        await db.run('COMMIT');
        console.log(`Saved ${doctors.length} doctors to database`);
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in batch save:', error);
        throw error;
    }
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
    closeDatabase
};