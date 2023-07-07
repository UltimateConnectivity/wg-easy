curl -sSL https://get.docker.com | sh
apt-get install -y certbot nginx git python3-certbot-nginx
git clone https://github.com/UltimateConnectivity/wg-easy.git
cd wg-easy/
docker build -t"custom" .
docker run -d   --name=wg-easy   -e WG_HOST=$(curl -4 icanhazip.com) -e PASSWORD=Welcome1! -e WG_DEFAULT_ADDRESS=10.x.y.z -v ~/.wg-easy:/etc/wireguard -p 51820:51820/udp -p 8080:51821/tcp --cap-add=NET_ADMIN   --cap-add=SYS_MODULE   --sysctl="net.ipv4.conf.all.src_valid_mark=1"   --sysctl="net.ipv4.ip_forward=1"   --restart unless-stopped custom
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 51820/udp

cat > /etc/nginx/sites-available/default << EOL
server {
    server_name $1;

    # HTTP to HTTPS
    if (\$scheme != "https") {
        return 301 https://\$host\$request_uri;
    }

    location / {
        proxy_pass  http://127.0.0.1:8080;
        proxy_redirect                      off;
        proxy_set_header  Host              \$http_host;
        proxy_set_header  X-Real-IP         \$remote_addr;
        proxy_set_header  X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header  X-Forwarded-Proto \$scheme;
        proxy_read_timeout                  900;
    }
}
EOL
certbot --nginx --agree-tos -m secureconnections.help@gmail.com -n -d $1
