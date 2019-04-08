#!/bin/bash
#
# ### ~/install.sh "PI" "$DEVICEID" "CPE"
#
SERVERTYPE="MS"
if [ "$1" != "" ]; then
  SERVERTYPE="$1"
fi
apt-get install curl uuidgen -y
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

# ifconfig | perl -nle'/dr:(\S+)/ && print $1'
# ifconfig | grep 'inet addr' | cut -d ':' -f 2 | awk '{ print $1 }' | grep -E '^(192\.168|10\.|172\.1[6789]\.|172\.2[0-9]\.|172\.3[01]\.)'

SERVERNAME="$SERVERTYPE-$DEVICEID-$DATACENTER"
DOMAINNAME="blackfisk.com"
FQDN="$SERVERNAME.cpe.$DOMAINNAME"
IPADDR=$(curl 'ipv4bot.whatismyipaddress.com')
PRIVATEIPADDR=$(ifconfig | grep 'inet ' | cut -d ':' -f 2 | awk '{ print $2 }' | grep -E '^(192\.168|10\.|172\.1[6789]\.|172\.2[0-9]\.|172\.3[01]\.)')
if [ "$PRIVATEIPADDR" == "" ]; then
  PRIVATEIPADDR=$(ifconfig | grep 'inet addr' | cut -d ':' -f 2 | awk '{ print $1 }' | grep -E '^(192\.168|10\.|172\.1[6789]\.|172\.2[0-9]\.|172\.3[01]\.)')
fi

echo "$SERVERNAME" > /etc/servername.conf
uuidgen -t -r > /etc/serverkey.conf
SERVERKEY=$(cat /etc/serverkey.conf)
echo "127.0.0.1 "$SERVERNAME >> /etc/hosts
echo "127.0.0.1 "$FQDN >> /etc/hosts
echo sed -i 's/.*domain.*/domain $DOMAINNAME/' /etc/resolv.conf
sudo sed -i 's/.*search.*/search $DOMAINNAME/' /etc/resolv.conf

curl -is -XGET 'https://api.apophisapp.com/iptables/add?ip='$IPADDR'&server='$SERVERNAME'&privateIP='$PRIVATEIPADDR'&serverKey='$SERVERKEY
curl -is -XGET 'https://api.apophisapp.com/iptables/?server='$SERVERNAME'&lastAction=install-monitor&serverKey='$SERVERKEY

apt-get purge nodejs node npm  -y
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
# This loads nvm
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
# This loads nvm bash_completion
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
apt-get update
apt-get upgrade -y
apt-get install jq git lpr cups -y
nvm install 8

npm install pm2 -g

adduser --disabled-password --gecos "" blackfisk

# make sure that you can access it remotely
cupsctl --remote-admin
# make sure PI user has access to cups
sudo usermod -a -G lpadmin pi
# make sure blackfisk user has access to cups
sudo usermod -a -G lpadmin blackfisk
service cups restart

crontab -l | { cat; echo "@reboot curl -is -XGET 'https://api.apophisapp.com/iptables/?server=$SERVERNAME&lastAction=online-pending&serverKey=$(cat /etc/serverkey.conf)' > /dev/null 2>&1"; } | crontab -

mkdir /home/blackfisk/apps/
git clone https://github.com/blackfisk-tech/monitor-service.git /home/blackfisk/apps/monitor-service/ -q
cd /home/blackfisk/apps/monitor-service/

npm cache clean --force
rm -rf ~/.npm
rm -rf node_modules
rm -f package-lock.json

npm install
pm2 start /home/blackfisk/apps/monitor-service/index.js --name "Monitor Service"
pm2 startup
pm2 save
