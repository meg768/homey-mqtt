const Mqtt = require('mqtt');
const MqttAsync = require('mqtt-async');






class Foo {

    deleteMqttTopic(options) {
        return new Promise((resolve, reject) =>  {
    
            let mqtt = null;
            let timer = null;
    
            let resetTimeout = (timeout = 1000) => {
                clearTimeout(timer);
    
                timer = setTimeout(() => {
                    if (mqtt != null) {
                        mqtt.end();
                    }
                    resolve();
                }, timeout);
            };
    
            mqtt = MqttAsync(Mqtt.connect(options.host, {
                username: options.username,
                password: options.password,
                port: options.port,
                topic: options.topic
            }));
    
            mqtt.on('connect', async () => {
                console.log(`Connected to host ${options.host}:${options.port}.`);
                resetTimeout();
    
                mqtt.on('message', async (topic, message) => {
                    if (message != "") {
                        console.log(`Deleting topic ${topic}`);
                        await mqtt.publish(topic, "", {retain:true});
                        resetTimeout();
                    }
                });
            
                await mqtt.subscribe(`${options.topic}/#`);
    
                
            });
    
            resetTimeout(5000);
        });
    }
    
    


}




async function Kalle() {
    console.log("HEJ");
    let app = new Foo();
    await app.deleteMqttTopic({
        host: "http://192.168.86.50",
        port: 1883,
        password: "P0tatismos",
        username: "meg768",
        topic: "homey"        
    });
    console.log("DÅ");
}

Kalle();

