#!/bin/bash

# Deploy script for Find Toronto PCP application
# Run with sudo: sudo ./deploy.sh

set -e

echo "=== Find Toronto PCP Deployment Script ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo ./deploy.sh)"
    exit 1
fi

# Get the domain name
read -p "Enter your domain name (e.g., findtorontopcp.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo "Domain name is required"
    exit 1
fi

echo ""
echo "1. Installing systemd service..."
cp /var/www/findtorontopcp/findtorontopcp.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable findtorontopcp.service
systemctl start findtorontopcp.service
echo "   ✓ Service installed and started"

echo ""
echo "2. Setting up Nginx configuration..."
# Replace domain placeholder in nginx config
sed "s/findtorontopcp.com/${DOMAIN}/g" /var/www/findtorontopcp/nginx.conf > /etc/nginx/sites-available/findtorontopcp
ln -sf /etc/nginx/sites-available/findtorontopcp /etc/nginx/sites-enabled/

# Test nginx configuration
nginx -t
if [ $? -ne 0 ]; then
    echo "   ✗ Nginx configuration test failed"
    exit 1
fi
echo "   ✓ Nginx configuration valid"

echo ""
echo "3. Setting up SSL certificate with Let's Encrypt..."
# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo "   Installing certbot..."
    dnf install -y certbot python3-certbot-nginx
fi

# Get SSL certificate
certbot certonly --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --register-unsafely-without-email
if [ $? -eq 0 ]; then
    echo "   ✓ SSL certificate obtained"
else
    echo "   ✗ SSL certificate generation failed"
    echo "   You may need to run: certbot certonly --nginx -d $DOMAIN -d www.$DOMAIN"
fi

echo ""
echo "4. Reloading services..."
systemctl reload nginx
echo "   ✓ Nginx reloaded"

echo ""
echo "5. Setting up automatic SSL renewal..."
# Add cron job for SSL renewal if not exists
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "0 0,12 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
    echo "   ✓ SSL renewal cron job added"
else
    echo "   ✓ SSL renewal already configured"
fi

echo ""
echo "=== Deployment Status ==="
echo ""
echo "Service status:"
systemctl status findtorontopcp.service --no-pager | head -10
echo ""
echo "Nginx status:"
systemctl status nginx --no-pager | head -10
echo ""
echo "Application should be accessible at:"
echo "  https://$DOMAIN"
echo "  https://www.$DOMAIN"
echo ""
echo "Useful commands:"
echo "  View app logs:        journalctl -u findtorontopcp -f"
echo "  Restart app:          systemctl restart findtorontopcp"
echo "  Check app status:     systemctl status findtorontopcp"
echo "  Reload nginx:         systemctl reload nginx"
echo "  Test SSL renewal:     certbot renew --dry-run"