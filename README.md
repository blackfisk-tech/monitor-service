# monitor-service
## This service acts as a websocket client for servers and devices.

### CUPS service enables printing by websocket and discovery of printers.

#### Install Arguments: In this example, the first argument "PI" is the server type abbreviation, the second argument "#" is the optional device id formatted as `/[0-9a-z]{16}/`, and the third argument "CPE" is the optional data center abbreviation

```
wget https://raw.githubusercontent.com/blackfisk-tech/monitor-service/master/install.sh ~/.
chmod a+x ~/install.sh
~/install.sh "PI" "#" "CPE"
```

#### Debugging
Uses debug package from TJ Holowaychuk (https://github.com/visionmedia/debug)
Enable full debug by setting env variable DEBUG=*

#### Server Naming
By default the server name is read from the OS hostname and must follow `/[\w]*-[\w]*-[\w]*/` format. Else the servername is read from /etc/servername.conf.

#### CUPS
You can access the cups interface in a browser at `{hostname OR private ip}:631`. You can also use the cups cli. See https://github.com/apple/cups for more information.