const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true }));

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