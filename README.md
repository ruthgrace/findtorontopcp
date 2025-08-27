# find ontario doctors
find local doctors by distance

using this api

curl 'https://register.cpso.on.ca/Get-Search-Results/' \
>   -H 'accept: */*' \
>   -H 'accept-language: en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7' \
>   -H 'content-type: application/x-www-form-urlencoded; charset=UTF-8' \
>   -b 'Dynamics365PortalAnalytics=hwbI9IhtOFZ_6vx9S9IQ4KwcrM-scrRFvynnyosAX4ziBlCSKB1CDtQazU5rRTzgVuCUnA2IOmnimX1zwXD4iEXNWhf2wCnb0Q-90PApIlfPcJJPPTKn54egRRlk48KxkZPFI-0v_gUrajXVAOVHiQ2; _ga=GA1.1.1307240706.1754765790; timezoneoffset=420; isDSTSupport=true; isDSTObserved=true; ContextLanguageCode=en-US; _clck=h92ihy%7C2%7Cfyb%7C0%7C2047; timeZoneCode=5; _ga_ZRCCDF4GCQ=GS2.1.s1754779194$o2$g0$t1754779194$j60$l0$h0; ARRAffinity=778dfe68ccfb9d96be57f2be2d452ca51e5e6a3c3d5f01ded1c44784ae5a5f31; ARRAffinitySameSite=778dfe68ccfb9d96be57f2be2d452ca51e5e6a3c3d5f01ded1c44784ae5a5f31' \
>   -H 'origin: https://register.cpso.on.ca' \
>   -H 'priority: u=1, i' \
>   -H 'referer: https://register.cpso.on.ca/Search-Results/' \
>   -H 'request-id: |7f3e2fe8e979490ea20f8efef046dbf1.fe346bc548e54e98' \
>   -H 'sec-ch-ua: "Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"' \
>   -H 'sec-ch-ua-mobile: ?0' \
>   -H 'sec-ch-ua-platform: "macOS"' \
>   -H 'sec-fetch-dest: empty' \
>   -H 'sec-fetch-mode: cors' \
>   -H 'sec-fetch-site: same-origin' \
>   -H 'traceparent: 00-7f3e2fe8e979490ea20f8efef046dbf1-fe346bc548e54e98-01' \
>   -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36' \
>   -H 'x-requested-with: XMLHttpRequest' \
>   --data-raw 'postalCode=M2N+4&doctorType=Any&LanguagesSelected=ENGLISH'

## required yearly updates

Postal code of information is provided by the federal government yearly here: https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index-eng.cfm

This application currently uses the 2025 data.

Download the Shapefile for the new year, unzip it, and put the resulting folder in postcode_geodata.

## Deployment

### Step 1: Copy and enable systemd service

```bash
sudo cp /var/www/findtorontopcp/findtorontopcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable findtorontopcp.service
sudo systemctl start findtorontopcp.service
```

Check if it's running:
```bash
sudo systemctl status findtorontopcp.service
```

### Step 2: Setup NGINX Bootstrap (for initial Let's Encrypt setup)

```bash
# Create a symlink to the bootstrap config first
sudo ln -s /var/www/findtorontopcp/nginx-bootstrap.conf /etc/nginx/conf.d/findtorontopcp.conf

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Step 3: Get SSL Certificate from Let's Encrypt

```bash
# Install certbot if not already installed
sudo dnf install -y certbot python3-certbot-nginx

# Get the certificate (replace with your actual domain)
sudo certbot certonly --webroot -w /var/www/findtorontopcp -d findtorontopcp.com -d www.findtorontopcp.com
```

### Step 4: Switch to Full NGINX Configuration

```bash
# Remove the bootstrap symlink
sudo rm /etc/nginx/conf.d/findtorontopcp.conf

# Create symlink to the full config
sudo ln -s /var/www/findtorontopcp/nginx.conf /etc/nginx/conf.d/findtorontopcp.conf

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Step 5: Setup Automatic SSL Renewal

```bash
# Test renewal works
sudo certbot renew --dry-run

# Add cron job for auto renewal (if not already exists)
sudo crontab -l | grep -q 'certbot renew' || (sudo crontab -l 2>/dev/null; echo "0 0,12 * * * certbot renew --quiet && systemctl reload nginx") | sudo crontab -
```

### Useful Commands

- **View app logs:** `sudo journalctl -u findtorontopcp -f`
- **Restart app:** `sudo systemctl restart findtorontopcp`
- **Check app status:** `sudo systemctl status findtorontopcp`
- **Reload nginx:** `sudo systemctl reload nginx`
- **Test SSL renewal:** `sudo certbot renew --dry-run`
- **Check nginx error logs:** `sudo tail -f /var/log/nginx/error.log`
- **Check app is responding:** `curl http://localhost:3002`

### Troubleshooting

If the app isn't working:
1. Check if Node.js app is running: `sudo systemctl status findtorontopcp`
2. Check if it's listening on port 3002: `sudo ss -tlnp | grep 3002`
3. Check app logs: `sudo journalctl -u findtorontopcp -n 50`
4. Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
5. Make sure database file has correct permissions: `ls -la /var/www/findtorontopcp/*.db`
