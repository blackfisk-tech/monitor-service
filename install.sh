#!/bin/bash
#
DEVICEID=$(cat /proc/cpuinfo | grep Serial | cut -d ' ' -f 2)
HOSTNAME="MS-$DEVICEID-CPE"
IPADDR=$(curl 'ipv4bot.whatismyipaddress.com')
FQDN="$HOSTNAME.cpe.blackfisk.com"
DOMAINNAME="blackfisk.com"
SERVERTYPE="MS"
PRIVIPADDR=$(/sbin/ifconfig eth0 | awk '/inet / { print $2 }' | sed 's/addr://')
sudo hostnamectl set-hostname "$HOSTNAME"
curl -is -XGET 'https://api.apophisapp.com/iptables/add?ip='$IPADDR'&server='$HOSTNAME'&privateIP='$PRIVIPADDR
curl -is -XGET 'https://api.apophisapp.com/iptables/?server='$HOSTNAME'&lastAction=install-system'

sudo curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get update
sudo apt-get purge nodejs npm -y
sudo apt-get install jq nodejs git -y
sudo apt-get upgrade -y
sudo npm install pm2 -g

echo "127.0.0.1 "$HOSTNAME >> sudo /etc/hosts
echo "127.0.0.1 "$FQDN >> sudo /etc/hosts

echo sed -i 's/.*domain.*/domain $DOMAINNAME/' /etc/resolv.conf
sudo sed -i 's/.*search.*/search $DOMAINNAME/' /etc/resolv.conf

crontab -l | { cat; echo "@reboot curl -is -XGET 'https://api.apophisapp.com/iptables/?server=$HOSTNAME&lastAction=online-pending' > /dev/null 2>&1"; } | crontab -

sudo adduser --disabled-password --gecos "" blackfisk
sudo git clone https://github.com/blackfisk-tech/monitor-service.git /home/blackfisk/monitor-service/ -q
cd /home/blackfisk/monitor-service/
sudo npm install
sudo pm2 start /home/blackfisk/monitor-service/index.js --name "Monitor Service"
sudo pm2 startup ubuntu -u root --hp /root/
sudo pm2 save

curl -XGET 'https://api.apophisapp.com/iptables/?server='$HOSTNAME'&lastAction=reboot'

reboot