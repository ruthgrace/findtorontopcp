const fetch = require('node-fetch');

class GenderFetcher {
    constructor(options = {}) {
        this.concurrency = options.concurrency || 2;
        this.maxRetries = options.maxRetries || 3;
        this.baseRetryDelay = options.baseRetryDelay || 2000; // 2 seconds
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.maxRetryDelay = options.maxRetryDelay || 30000; // 30 seconds max
        
        // Adaptive rate limiting - start aggressive, back off on errors
        this.minDelay = options.minDelay || 100; // Start at 100ms!
        this.maxDelay = options.maxDelay || 5000; // Cap at 5 seconds
        this.adaptiveDelay = this.minDelay; // Start fast
        
        // Error tracking for adaptive behavior
        this.consecutiveSuccesses = 0;
        this.consecutiveErrors = 0;
        this.lastRequestTime = 0;
        
        // Success/error thresholds
        this.successThreshold = 5; // After 5 successes, try to go faster
        this.errorThreshold = 2; // After 2 errors, slow down
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Adaptive rate limiting - adjust based on success/error patterns
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const requiredDelay = this.adaptiveDelay;
        
        if (timeSinceLastRequest < requiredDelay) {
            const waitTime = requiredDelay - timeSinceLastRequest;
            if (waitTime > 50) { // Only log significant waits
                console.log(`Rate limiting: waiting ${waitTime}ms (adaptive delay: ${this.adaptiveDelay}ms)`);
            }
            await this.delay(waitTime);
        }
        
        this.lastRequestTime = Date.now();
    }

    // Adjust delay based on success/error patterns
    adjustDelayOnSuccess() {
        this.consecutiveSuccesses++;
        this.consecutiveErrors = 0;
        
        // After multiple successes, try to go faster
        if (this.consecutiveSuccesses >= this.successThreshold) {
            const oldDelay = this.adaptiveDelay;
            this.adaptiveDelay = Math.max(this.minDelay, this.adaptiveDelay * 0.8); // Speed up by 20%
            
            if (oldDelay !== this.adaptiveDelay) {
                console.log(`🚀 Speeding up: ${oldDelay}ms → ${this.adaptiveDelay}ms (${this.consecutiveSuccesses} successes)`);
            }
            this.consecutiveSuccesses = 0; // Reset counter
        }
    }

    adjustDelayOnError(errorType) {
        this.consecutiveErrors++;
        this.consecutiveSuccesses = 0;
        
        // Determine backoff multiplier based on error type
        let backoffMultiplier;
        if (errorType === 'rate_limit') {
            backoffMultiplier = 3; // Aggressive backoff for rate limits
        } else if (errorType === 'server_error') {
            backoffMultiplier = 2; // Moderate backoff for server errors
        } else if (errorType === 'blocking') {
            backoffMultiplier = 5; // Very aggressive for blocking
        } else {
            backoffMultiplier = 1.5; // Gentle backoff for other errors
        }
        
        const oldDelay = this.adaptiveDelay;
        this.adaptiveDelay = Math.min(this.maxDelay, this.adaptiveDelay * backoffMultiplier);
        
        console.log(`⚠️ Slowing down: ${oldDelay}ms → ${this.adaptiveDelay}ms (${errorType}, ${this.consecutiveErrors} errors)`);
    }

    // Exponential backoff calculation
    calculateRetryDelay(attempt) {
        const delay = this.baseRetryDelay * Math.pow(this.backoffMultiplier, attempt - 1);
        return Math.min(delay, this.maxRetryDelay);
    }

    // Enhanced single gender fetch with retries and backoff
    async fetchGenderFromCPSO(cpsoNumber, attempt = 1) {
        try {
            await this.enforceRateLimit();
            
            const response = await fetch(`https://register.cpso.on.ca/physician-info/?cpsonum=${cpsoNumber}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; DocSearch/1.0)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'keep-alive'
                },
                timeout: 15000 // 15 second timeout
            });
            
            // Handle rate limiting responses
            if (response.status === 429) {
                console.log(`Rate limited for CPSO #${cpsoNumber}, attempt ${attempt}`);
                this.adjustDelayOnError('rate_limit');
                throw new Error(`Rate limited (HTTP 429)`);
            }
            
            // Handle server errors that might indicate rate limiting
            if (response.status === 503 || response.status === 502) {
                console.log(`Server error ${response.status} for CPSO #${cpsoNumber}, attempt ${attempt}`);
                this.adjustDelayOnError('server_error');
                throw new Error(`Server error (HTTP ${response.status})`);
            }
            
            if (!response.ok) {
                this.adjustDelayOnError('http_error');
                throw new Error(`HTTP ${response.status}`);
            }
            
            const html = await response.text();
            
            // Try primary pattern
            let genderMatch = html.match(/<span class="scrp-gender-value">\s*([^<]+)\s*</);
            if (genderMatch) {
                this.adjustDelayOnSuccess(); // Success!
                return genderMatch[1].trim();
            }
            
            // Try alternative pattern
            genderMatch = html.match(/Gender:[^<]*<span[^>]*>\s*([^<]+)\s*/i);
            if (genderMatch) {
                this.adjustDelayOnSuccess(); // Success!
                return genderMatch[1].trim();
            }
            
            // Check for blocked/captcha page
            if (html.includes('captcha') || html.includes('blocked') || html.includes('Access Denied')) {
                console.log(`Possible blocking detected for CPSO #${cpsoNumber}`);
                this.adjustDelayOnError('blocking');
                throw new Error('Possible blocking/captcha detected');
            }
            
            // Success! Track for adaptive rate limiting
            this.adjustDelayOnSuccess();
            
            // If no match, check if page exists
            if (html.includes('No physician found') || html.includes('not found')) {
                return 'Unknown - Doctor not found';
            }
            
            return 'Unknown - Gender not available';
            
        } catch (error) {
            const isRetryable = error.message.includes('Rate limited') || 
                              error.message.includes('Server error') ||
                              error.message.includes('timeout') ||
                              error.message.includes('blocking') ||
                              error.code === 'ECONNRESET' ||
                              error.code === 'ETIMEDOUT';
            
            if (isRetryable && attempt < this.maxRetries) {
                const retryDelay = this.calculateRetryDelay(attempt);
                console.log(`Retrying CPSO #${cpsoNumber} in ${retryDelay}ms (attempt ${attempt}/${this.maxRetries})`);
                
                await this.delay(retryDelay);
                return this.fetchGenderFromCPSO(cpsoNumber, attempt + 1);
            }
            
            console.error(`Final error fetching gender for CPSO #${cpsoNumber}:`, error.message);
            return `Unknown - ${error.message.includes('Rate limited') ? 'Rate limited' : 'Fetch error'}`;
        }
    }
}

// Global instance
const globalFetcher = new GenderFetcher();

// Backward compatible function
async function fetchGenderFromCPSO(cpsoNumber) {
    return globalFetcher.fetchGenderFromCPSO(cpsoNumber);
}

// Test function
async function testGenderFetching() {
    console.log('Testing gender fetching...');
    
    const testCases = [
        { cpso: '109709', expected: 'Man' },
        { cpso: '97607', expected: 'Woman' },
        { cpso: '99999', expected: 'Unknown' }
    ];
    
    for (const test of testCases) {
        const result = await fetchGenderFromCPSO(test.cpso);
        console.log(`CPSO #${test.cpso}: ${result}`);
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

module.exports = { fetchGenderFromCPSO, testGenderFetching };