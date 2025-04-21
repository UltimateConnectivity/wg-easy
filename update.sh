git pull
docker build -t"custom" .
docker stop wg-easy
docker rm wg-easy
docker run -d --name=wg-easy   -e WG_HOST=$(curl -4 icanhazip.com) -e PASSWORD=Welcome1! -e WG_DEFAULT_ADDRESS=10.x.y.z -v ~/.wg-easy:/etc/wireguard -p 51820:51820/udp -p 8080:51821/tcp --cap-add=NET_ADMIN   --cap-add=SYS_MODULE   --sysctl="net.ipv4.conf.all.src_valid_mark=1"   --sysctl="net.ipv4.ip_forward=1"   --restart unless-stopped --ulimit memlock=-1:-1 custom