const fetch = require('node-fetch');

class ParallelGeocoder {
    constructor(options = {}) {
        this.apiKey = options.apiKey;
        this.concurrency = options.concurrency || 20; // Default to 20 parallel requests
        this.maxRetries = options.maxRetries || 5;
        this.initialRetryDelay = options.initialRetryDelay || 1000; // 1 second
        this.maxRetryDelay = options.maxRetryDelay || 32000; // 32 seconds
        this.cache = options.cache || {};
        this.dbSaveFunction = options.dbSaveFunction || null;
    }

    async geocodeBatch(addresses) {
        const results = {};
        const uncachedAddresses = [];

        // Check cache first
        for (const address of addresses) {
            if (this.cache.hasOwnProperty(address)) {
                results[address] = this.cache[address];
            } else {
                uncachedAddresses.push(address);
            }
        }

        if (uncachedAddresses.length === 0) {
            console.log(`All ${addresses.length} addresses found in cache`);
            return results;
        }

        console.log(`Geocoding ${uncachedAddresses.length} uncached addresses (${addresses.length - uncachedAddresses.length} found in cache)`);

        // Process uncached addresses in parallel with concurrency control
        const chunks = [];
        for (let i = 0; i < uncachedAddresses.length; i += this.concurrency) {
            chunks.push(uncachedAddresses.slice(i, i + this.concurrency));
        }

        let totalGeocoded = 0;
        let totalErrors = 0;
        let rateLimitHits = 0;

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            console.log(`Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} addresses)`);
            
            const promises = chunk.map(address => this.geocodeSingleWithRetry(address));
            const chunkResults = await Promise.all(promises);

            // Process results
            for (const result of chunkResults) {
                results[result.address] = result.coords;
                
                // Update cache
                this.cache[result.address] = result.coords;
                
                // Track statistics
                if (result.coords) {
                    totalGeocoded++;
                } else if (result.error === 'OVER_QUERY_LIMIT') {
                    rateLimitHits++;
                } else {
                    totalErrors++;
                }

                // Save to database if function provided
                if (this.dbSaveFunction && result.coords) {
                    this.dbSaveFunction(result.address, result.coords.lat, result.coords.lng, 'google')
                        .catch(err => console.error('Error saving to database:', err));
                }
            }

            // Log progress
            const progress = ((chunkIndex + 1) / chunks.length * 100).toFixed(1);
            console.log(`Progress: ${progress}% - Geocoded: ${totalGeocoded}, Errors: ${totalErrors}, Rate limits: ${rateLimitHits}`);
        }

        console.log(`Geocoding complete. Success: ${totalGeocoded}, Failed: ${totalErrors}, Rate limit hits: ${rateLimitHits}`);
        return results;
    }

    async geocodeSingleWithRetry(address, retryCount = 0) {
        try {
            const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=ca&key=${this.apiKey}`;
            const response = await fetch(googleUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const location = data.results[0].geometry.location;
                return {
                    address,
                    coords: {
                        lat: location.lat,
                        lng: location.lng
                    }
                };
            } else if (data.status === 'OVER_QUERY_LIMIT' && retryCount < this.maxRetries) {
                // Exponential backoff with jitter
                const baseDelay = Math.min(this.initialRetryDelay * Math.pow(2, retryCount), this.maxRetryDelay);
                const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% jitter
                const delay = baseDelay + jitter;
                
                console.log(`Rate limit hit for "${address}". Retrying in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.geocodeSingleWithRetry(address, retryCount + 1);
            } else if (data.status === 'ZERO_RESULTS') {
                console.log(`No results found for: ${address}`);
                return { address, coords: null };
            } else if (data.status === 'OVER_QUERY_LIMIT') {
                console.error(`Rate limit exceeded for "${address}" after ${this.maxRetries} retries`);
                return { address, coords: null, error: 'OVER_QUERY_LIMIT' };
            } else {
                console.log(`Geocoding failed for "${address}": ${data.status}`);
                return { address, coords: null, error: data.status };
            }
        } catch (error) {
            if (retryCount < this.maxRetries) {
                const delay = Math.min(this.initialRetryDelay * Math.pow(2, retryCount), this.maxRetryDelay);
                console.log(`Network error for "${address}": ${error.message}. Retrying in ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.geocodeSingleWithRetry(address, retryCount + 1);
            }
            
            console.error(`Failed to geocode "${address}" after ${this.maxRetries} retries:`, error.message);
            return { address, coords: null, error: error.message };
        }
    }

    async geocodeSingle(address) {
        // Check cache first
        if (this.cache.hasOwnProperty(address)) {
            return this.cache[address];
        }

        const result = await this.geocodeSingleWithRetry(address);
        
        // Update cache
        this.cache[address] = result.coords;
        
        // Save to database if function provided
        if (this.dbSaveFunction && result.coords) {
            this.dbSaveFunction(address, result.coords.lat, result.coords.lng, 'google')
                .catch(err => console.error('Error saving to database:', err));
        }

        return result.coords;
    }
}

module.exports = ParallelGeocoder;