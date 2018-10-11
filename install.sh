#!/bin/bash
#
# ### ~/install.sh "PI" "$DEVICEID" "CPE"
#
SERVERTYPE="MS"
if [ "$1" != "" ]; then
  SERVERTYPE="$1"
fi

VMID=$(dmidecode | grep -i uuid | awk '{print $2}' | tr '[:upper:]' '[:lower:]')
DID=$(dmidecode -t 4 | grep ID | sed 's/.*ID://;s/ //g')
DEVICEID=$(echo "$VMID$DID" | md5sum | awk '{print $1}')
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

apt-get purge nodejs node npm -y
curl -sL https://deb.nodesource.com/setup_8.x | -E bash -
apt-get update
apt-get install jq nodejs npm git lpr cups -y
apt-get upgrade -y
npm install -g npm@latest
rm /usr/bin/npm
/usr/local/bin/npm install pm2 -g

cupsctl --remote-admin
service cups restart

echo "127.0.0.1 "$SERVERNAME >> /etc/hosts
echo "127.0.0.1 "$FQDN >> /etc/hosts

crontab -l | { cat; echo "@reboot curl -is -XGET 'https://api.apophisapp.com/iptables/?server=$SERVERNAME&lastAction=online-pending' > /dev/null 2>&1"; } | crontab -

adduser --disabled-password --gecos "" blackfisk
git clone https://github.com/blackfisk-tech/monitor-service.git /home/blackfisk/monitor-service/ -q
cd /home/blackfisk/monitor-service/
/usr/local/bin/npm install
pm2 start /home/blackfisk/monitor-service/index.js --name "Monitor Service"
pm2 startup
pm2 save
