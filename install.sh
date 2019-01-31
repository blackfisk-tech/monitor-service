#!/bin/bash
#
# ### ~/install.sh "PI" "$DEVICEID" "CPE"
#
SERVERTYPE="MS"
if [ "$1" != "" ]; then
  SERVERTYPE="$1"
fi
apt-get install curl -y
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
echo "127.0.0.1 "$SERVERNAME >> /etc/hosts
echo "127.0.0.1 "$FQDN >> /etc/hosts
echo sed -i 's/.*domain.*/domain $DOMAINNAME/' /etc/resolv.conf
sudo sed -i 's/.*search.*/search $DOMAINNAME/' /etc/resolv.conf

curl -is -XGET 'https://api.apophisapp.com/iptables/add?ip='$IPADDR'&server='$SERVERNAME'&privateIP='
curl -is -XGET 'https://api.apophisapp.com/iptables/?server='$SERVERNAME'&lastAction=install-monitor'

apt-get purge nodejs node npm  -y
curl -sL https://deb.nodesource.com/setup_11.x | sudo -E bash -
apt-get update
apt-get upgrade -y
apt-get install jq nodejs git lpr cups -y
npm install -g npm@latest

npm install pm2 -g

adduser --disabled-password --gecos "" blackfisk

# make sure that you can access it remotely
cupsctl --remote-admin
# make sure PI user has access to cups
sudo usermod -a -G lpadmin pi
# make sure blackfisk user has access to cups
sudo usermod -a -G lpadmin blackfisk
service cups restart

crontab -l | { cat; echo "@reboot curl -is -XGET 'https://api.apophisapp.com/iptables/?server=$SERVERNAME&lastAction=online-pending' > /dev/null 2>&1"; } | crontab -

mkdir /home/blackfisk/apps/
git clone https://github.com/blackfisk-tech/monitor-service.git /home/blackfisk/apps/monitor-service/ -q
cd /home/blackfisk/apps/monitor-service/
npm install
pm2 start /home/blackfisk/apps/monitor-service/index.js --name "Monitor Service"
pm2 startup
pm2 save
