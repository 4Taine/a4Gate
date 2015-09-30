module.exports = function(RED) {
    var btSerial = new (require('bluetooth-serial-port')).BluetoothSerialPort();
    var exec = require('child_process').exec;

    function WriteBTSerial(config) {
        RED.nodes.createNode(this, config);
        this.btaddress = null;
        this.btname = config.btname;
        var node = this;

        function connect(msg){
            if (node.btaddress == null || node.btaddress == ""){
                msg.payload = "no address found";
                node.send(msg);
                return;
            }
            var cl = " echo '1234' | bluez-simple-agent hci0 " + node.btaddress;
            var child = exec(cl, {encoding: 'binary', maxBuffer:10000000}, function (error, stdout, stderr) {
                btSerial.findSerialPortChannel(node.btaddress, function(channel) {
                    btSerial.connect(node.btaddress, channel, function() {
                        msg.payload = "Success! Connected to: " + node.btaddress;
                        node.send(msg);
                        var bufferhack = "";
                        btSerial.on('data', function(buffer) {
                            for (var i=0; i<buffer.length; i++) {
                                if (buffer[i] != 10) {
                                    var buf = new Buffer(1);
                                    buf[0] = buffer[i];
                                    bufferhack += buf.toString('ascii');
                                } else {
                                    msg.payload = bufferhack;
                                    node.send(msg);
                                    bufferhack = "";
                                    break;
                                }
                            }
                        }); 
                    }, function () {
                        msg.payload = "cannot connect";
                        node.send(msg);
                    });
                });
            });
        }

        function setSSPModeAndConnect(msg){
            var cl = "hciconfig hci0 sspmode 0";
            var child = exec(cl, {encoding: 'binary', maxBuffer:10000000}, function (error, stdout, stderr) {
                connect(msg);
            });
        }

        function scan (msg){
            var cl = "hcitool scan";
            var child = exec(cl, {encoding: 'binary', maxBuffer:10000000},function (error, stdout, stderr) {
                if( stdout.indexOf(node.btname) == -1){
                    msg.payload = "no device with " + node.btname + " as name found";
                    node.send(msg);
                    return;
                }
                var discover = stdout.split("\n");
                var adress = "";
                for (var i in discover){
                    if(discover[i].indexOf(node.btname) != -1){
                        var regexAdress = discover[i].match(/(([0-9a-fA-F][0-9a-fA-F]:){5}([0-9a-fA-F][0-9a-fA-F]))/);
                        if (regexAdress != null && regexAdress.length != 0){
                            address = regexAdress[0];
                        }
                    }
                }
                if (address == ""){
                    msg.payload = "no MAC adress for " + node.btname + " as name found";
                    node.send(msg);
                    return;
                }
                node.btaddress = address;
                setSSPModeAndConnect(msg);
            });
        }

        this.on('input', function(msg) {
            if (msg.topic === "discover") {
                var name = this.btname;
                if (msg.hasOwnProperty("btname") && msg.btname.trim() != ""){
                    name = msg.btname;
                }
                if (name.trim() == ""){
                    msg.payload = "no btname";
                    node.send(msg);
                }
                node.btname = name;
                scan(msg);
            } else {
                var intentInterpretation ="";
                if (msg.intent || msg.intent == 0){
                    if(msg.intent == 1) { // open
                        intentInterpretation = "01";
                    } else if (msg.intent == 0) { // close
                        intentInterpretation = "02";
                    }
                    var buffer = new Buffer(intentInterpretation,"hex");
                    msg.payload = buffer.toString('ascii');
                    node.send(msg);
                    btSerial.write(buffer, function(error, bytes) {
                        if (error) {
                            console.log("Bluetooth serial write error: " + error);
                        }
                    });
                } else {
                    msg.payload = "no intent found";
                    node.send(msg);
                }
                
            }
        });

        this.on('close', function() {
        });
    }
    RED.nodes.registerType("A4Gate", WriteBTSerial);
}
