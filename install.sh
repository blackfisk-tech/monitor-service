#!/bin/bash
#
# ### ~/install.sh "PI" "$DEVICEID" "CPE"
#
SERVERTYPE="MS"
if [ "$1" != "" ]; then
  SERVERTYPE="$1"
fi

DEVICEID=$(sudo dmidecode -t 4 | grep ID | sed 's/.*ID://;s/ //g' | md5sum | awk '{print $1}')
if [ "$2" != "" ]; then
  DEVICEID="$2"
fi

DATACENTER="CPE"
if [ "$3" != "" ]; then
  DATACENTER="$3"
fi

SERVERNAME="$SERVERTYPE-$DEVICEID-$DATACENTER"
DOMAINNAME="blackfisk.com"
FQDN="$SERVERNAME.cpe.$DOMAINNAME"
IPADDR=$(curl 'ipv4bot.whatismyipaddress.com')
echo "$SERVERNAME" > /etc/servername.conf
curl -is -XGET 'https://api.apophisapp.com/iptables/add?ip='$IPADDR'&server='$SERVERNAME'&privateIP='
curl -is -XGET 'https://api.apophisapp.com/iptables/?server='$SERVERNAME'&lastAction=install-monitor'

sudo curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get update
sudo apt-get purge nodejs npm -y
sudo apt-get install jq nodejs git lpr cups -y
sudo apt-get upgrade -y
sudo npm install pm2 -g

sudo cupsctl --remote-admin

echo "127.0.0.1 "$SERVERNAME >> /etc/hosts
echo "127.0.0.1 "$FQDN >> /etc/hosts

crontab -l | { cat; echo "@reboot curl -is -XGET 'https://api.apophisapp.com/iptables/?server=$SERVERNAME&lastAction=online-pending' > /dev/null 2>&1"; } | crontab -

sudo adduser --disabled-password --gecos "" blackfisk
sudo git clone https://github.com/blackfisk-tech/monitor-service.git /home/blackfisk/monitor-service/ -q
cd /home/blackfisk/monitor-service/
sudo npm install
sudo pm2 start /home/blackfisk/monitor-service/index.js --name "Monitor Service"
sudo pm2 startup
sudo pm2 save
