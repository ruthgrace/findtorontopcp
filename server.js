const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true }));

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open your browser and navigate to the URL above to use the Toronto Doctor Finder');
});